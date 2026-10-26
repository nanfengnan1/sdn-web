package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	agentpb "sdn-agent/api/agent/v1"
	pb "sdn-controller/api/controller/v1"
)

type Config struct {
	AdminToken, ViewerToken, StaticDir string
	AllowedOrigins                     []string
	MaxRequests, MaxStreams            int
	RPCTimeout                         time.Duration
}
type Server struct {
	client            pb.NorthClient
	config            Config
	requests, streams chan struct{}
	origins           map[string]bool
}
type Error struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId"`
}

var marshaler = protojson.MarshalOptions{EmitUnpopulated: true}

func New(client pb.NorthClient, c Config) (*Server, error) {
	if len(c.AdminToken) < 16 || c.ViewerToken != "" && (len(c.ViewerToken) < 16 || c.AdminToken == c.ViewerToken) {
		return nil, fmt.Errorf("admin token must be >=16 bytes, optional viewer token must be distinct and >=16")
	}
	if c.MaxRequests <= 0 {
		c.MaxRequests = 64
	}
	if c.MaxStreams <= 0 {
		c.MaxStreams = 64
	}
	if c.RPCTimeout <= 0 {
		c.RPCTimeout = 30 * time.Second
	}
	if c.StaticDir != "" {
		p, e := filepath.Abs(c.StaticDir)
		if e != nil {
			return nil, e
		}
		c.StaticDir = p
		if _, e = os.Stat(filepath.Join(p, "index.html")); e != nil {
			return nil, fmt.Errorf("static index.html: %w", e)
		}
	}
	s := &Server{client: client, config: c, requests: make(chan struct{}, c.MaxRequests), streams: make(chan struct{}, c.MaxStreams), origins: map[string]bool{}}
	for _, o := range c.AllowedOrigins {
		if o = strings.TrimSpace(o); o != "" {
			if o == "*" {
				return nil, fmt.Errorf("explicit allowed origins required")
			}
			s.origins[o] = true
		}
	}
	return s, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	requestID := hex.EncodeToString(b)
	w.Header().Set("X-Request-ID", requestID)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.URL.Path == "/healthz" {
		if r.Method != http.MethodGet {
			s.err(w, requestID, status.Error(codes.Unimplemented, "GET required"))
			return
		}
		w.WriteHeader(200)
		_, _ = io.WriteString(w, "ok\n")
		return
	}
	if !strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Path != "/readyz" {
		s.static(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if origin := r.Header.Get("Origin"); origin != "" {
		// Same-origin requests do not require CORS permission. Cross-origin deployments are explicit.
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		if origin != scheme+"://"+r.Host && !s.origins[origin] {
			s.err(w, requestID, status.Error(codes.PermissionDenied, "origin not allowed"))
			return
		}
		if s.origins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
		}
	}
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key, Last-Event-ID")
		w.WriteHeader(204)
		return
	}
	token, role, e := s.authenticate(r)
	if e != nil {
		s.err(w, requestID, e)
		return
	}
	if r.Method != http.MethodGet && role != "admin" {
		s.err(w, requestID, status.Error(codes.PermissionDenied, "viewer is read-only"))
		return
	}
	stream := strings.HasSuffix(r.URL.Path, "/events") && r.Method == http.MethodGet
	limit := s.requests
	if stream {
		limit = s.streams
	}
	select {
	case limit <- struct{}{}:
		defer func() { <-limit }()
	default:
		s.err(w, requestID, status.Error(codes.ResourceExhausted, "gateway concurrency limit reached"))
		return
	}
	ctx := metadata.NewOutgoingContext(r.Context(), metadata.Pairs("authorization", "Bearer "+token))
	if !stream {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, s.config.RPCTimeout)
		defer cancel()
	}
	r = r.WithContext(ctx)
	if r.URL.Path == "/readyz" {
		_, e := s.client.GetConfiguration(ctx, &pb.Empty{})
		if e != nil {
			s.err(w, requestID, e)
			return
		}
		s.json(w, 200, map[string]string{"status": "ready"})
		return
	}
	if r.URL.Path == "/api/v1/me" && r.Method == http.MethodGet {
		s.json(w, 200, map[string]string{"role": role})
		return
	}
	if stream {
		s.events(w, r, requestID)
		return
	}
	response, httpCode, e := s.dispatch(r)
	if e != nil {
		s.err(w, requestID, e)
		return
	}
	data, e := marshaler.Marshal(response)
	if e != nil {
		s.err(w, requestID, status.Error(codes.Internal, "response serialization failed"))
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(httpCode)
	_, _ = w.Write(data)
}

func (s *Server) authenticate(r *http.Request) (string, string, error) {
	values := r.Header.Values("Authorization")
	if len(values) != 1 {
		return "", "", status.Error(codes.Unauthenticated, "Bearer token required")
	}
	v := values[0]
	for _, t := range []struct{ value, role string }{{s.config.AdminToken, "admin"}, {s.config.ViewerToken, "viewer"}} {
		if t.value != "" && subtle.ConstantTimeCompare([]byte(v), []byte("Bearer "+t.value)) == 1 {
			return t.value, t.role, nil
		}
	}
	return "", "", status.Error(codes.Unauthenticated, "invalid Bearer token")
}
func read(r *http.Request, m proto.Message) error {
	if ct := strings.Split(r.Header.Get("Content-Type"), ";")[0]; ct != "application/json" {
		return status.Error(codes.InvalidArgument, "Content-Type must be application/json")
	}
	b, e := io.ReadAll(io.LimitReader(r.Body, (1<<20)+1))
	if e != nil {
		return status.Error(codes.InvalidArgument, "cannot read request")
	}
	if len(b) > 1<<20 {
		return status.Error(codes.ResourceExhausted, "body exceeds 1 MiB")
	}
	if e = protojson.Unmarshal(b, m); e != nil {
		return status.Errorf(codes.InvalidArgument, "invalid protobuf JSON: %v", e)
	}
	return nil
}
func matchID(body *string, path string) error {
	if *body != "" && *body != path {
		return status.Error(codes.InvalidArgument, "body ID differs from path")
	}
	*body = path
	return nil
}
func key(r *http.Request, body *string) error {
	k := r.Header.Get("Idempotency-Key")
	if k == "" {
		k = *body
	}
	if len(k) < 1 || len(k) > 128 {
		return status.Error(codes.InvalidArgument, "Idempotency-Key is required (1..128 bytes)")
	}
	if *body != "" && *body != k {
		return status.Error(codes.InvalidArgument, "conflicting idempotency keys")
	}
	*body = k
	return nil
}
func list(r *http.Request) (*pb.ListRequest, error) {
	q := &pb.ListRequest{PageSize: 50, PageToken: r.URL.Query().Get("pageToken")}
	if n := r.URL.Query().Get("pageSize"); n != "" {
		v, e := strconv.ParseUint(n, 10, 32)
		if e != nil || v < 1 || v > 200 {
			return nil, status.Error(codes.InvalidArgument, "pageSize must be 1..200")
		}
		q.PageSize = uint32(v)
	}
	return q, nil
}
func (s *Server) dispatch(r *http.Request) (proto.Message, int, error) {
	ctx := r.Context()
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 || parts[0] != "api" || parts[1] != "v1" {
		return nil, 0, status.Error(codes.NotFound, "unknown API path")
	}
	p := parts[2:]
	m := r.Method
	if len(p) == 1 {
		switch p[0] {
		case "nodes":
			if m == "GET" {
				q, e := list(r)
				if e != nil {
					return nil, 0, e
				}
				v, e := s.client.ListNodes(ctx, q)
				return v, 200, e
			}
		case "desired":
			if m == "GET" {
				v, e := s.client.GetConfiguration(ctx, &pb.Empty{})
				return v, 200, e
			}
		case "jobs":
			if m == "GET" {
				q, e := list(r)
				if e != nil {
					return nil, 0, e
				}
				v, e := s.client.ListJobs(ctx, q)
				return v, 200, e
			}
		case "changes":
			if m == "POST" {
				q := &pb.BeginChangeRequest{}
				if e := read(r, q); e != nil {
					return nil, 0, e
				}
				if e := key(r, &q.RequestId); e != nil {
					return nil, 0, e
				}
				v, e := s.client.BeginChange(ctx, q)
				return v, 201, e
			}
		case "topology":
			if m == "GET" {
				q := &pb.TopologyRequest{NodeIds: r.URL.Query()["nodeId"]}
				if value := r.URL.Query().Get("refresh"); value != "" {
					v, e := strconv.ParseBool(value)
					if e != nil {
						return nil, 0, status.Error(codes.InvalidArgument, "refresh must be boolean")
					}
					q.Refresh = v
				}
				v, e := s.client.GetTopology(ctx, q)
				return v, 200, e
			}
		}
	}
	if len(p) == 2 {
		switch p[0] {
		case "nodes":
			if m == "GET" {
				v, e := s.client.GetNode(ctx, &pb.NodeRequest{NodeId: p[1]})
				return v, 200, e
			}
		case "jobs":
			if m == "GET" {
				v, e := s.client.GetJob(ctx, &pb.JobRequest{JobId: p[1]})
				return v, 200, e
			}
		case "changes":
			switch m {
			case "GET":
				v, e := s.client.GetChange(ctx, &pb.ChangeRequest{ChangeId: p[1]})
				return v, 200, e
			case "DELETE":
				v, e := s.client.AbortChange(ctx, &pb.ChangeRequest{ChangeId: p[1]})
				return v, 200, e
			case "PUT":
				q := &pb.EditChangeRequest{}
				if e := read(r, q); e != nil {
					return nil, 0, e
				}
				if e := matchID(&q.ChangeId, p[1]); e != nil {
					return nil, 0, e
				}
				v, e := s.client.EditChange(ctx, q)
				return v, 200, e
			}
		}
	}
	if len(p) == 3 {
		if p[0] == "nodes" && p[2] == "resources" && m == "GET" {
			v, e := s.client.GetNodeResources(ctx, &pb.NodeResourcesRequest{NodeId: p[1], ChangeId: r.URL.Query().Get("changeId")})
			return v, 200, e
		}
		if p[0] == "nodes" && p[2] == "query" && m == "GET" {
			q, e := queryRequest(r, p[1])
			if e != nil {
				return nil, 0, e
			}
			v, e := s.client.QueryNode(ctx, q)
			return v, 200, e
		}
		if p[0] == "nodes" && p[2] == "adopt" && m == "POST" {
			q := &pb.AdoptNodeRequest{}
			if e := read(r, q); e != nil {
				return nil, 0, e
			}
			if e := matchID(&q.NodeId, p[1]); e != nil {
				return nil, 0, e
			}
			v, e := s.client.AdoptNode(ctx, q)
			return v, 200, e
		}
		if p[0] == "changes" && m == "POST" {
			switch p[2] {
			case "plan":
				v, e := s.client.PlanChange(ctx, &pb.ChangeRequest{ChangeId: p[1]})
				return v, 200, e
			case "commit":
				q := &pb.CommitChangeRequest{}
				if e := read(r, q); e != nil {
					return nil, 0, e
				}
				if e := matchID(&q.ChangeId, p[1]); e != nil {
					return nil, 0, e
				}
				if e := key(r, &q.RequestId); e != nil {
					return nil, 0, e
				}
				v, e := s.client.CommitChange(ctx, q)
				return v, 202, e
			}
		}
	}
	if len(p) == 4 && p[0] == "nodes" && p[2] == "resources" && p[3] == "import" && m == "POST" {
		q := &pb.ImportNodeResourcesRequest{}
		if e := read(r, q); e != nil {
			return nil, 0, e
		}
		if e := matchID(&q.NodeId, p[1]); e != nil {
			return nil, 0, e
		}
		if e := key(r, &q.RequestId); e != nil {
			return nil, 0, e
		}
		v, e := s.client.ImportNodeResources(ctx, q)
		return v, 200, e
	}
	if len(p) == 5 && p[0] == "changes" && p[2] == "nodes" && p[4] == "resources" && m == "PUT" {
		q := &pb.EditNodeResourcesRequest{}
		if e := read(r, q); e != nil {
			return nil, 0, e
		}
		if e := matchID(&q.ChangeId, p[1]); e != nil {
			return nil, 0, e
		}
		if e := matchID(&q.NodeId, p[3]); e != nil {
			return nil, 0, e
		}
		v, e := s.client.EditNodeResources(ctx, q)
		return v, 200, e
	}
	return nil, 0, status.Error(codes.NotFound, "unknown API route or method")
}

// Keep the query transport typed. Unknown filters and malformed enums must not
// become an unfiltered query whose empty result could be mistaken for success.
func queryRequest(r *http.Request, nodeID string) (*agentpb.QueryRequest, error) {
	q := &agentpb.QueryRequest{NodeId: nodeID, PageSize: 100}
	values := r.URL.Query()
	for k, v := range values {
		if len(v) != 1 {
			return nil, status.Errorf(codes.InvalidArgument, "duplicate query filter %s", k)
		}
		switch k {
		case "kind", "vrf", "bridge", "interface", "family", "ospfVersion", "pageSize", "pageToken", "routeType", "prefix", "neighbor":
		default:
			return nil, status.Errorf(codes.InvalidArgument, "unknown query filter %s", k)
		}
	}
	kind, ok := agentpb.QueryKind_value[values.Get("kind")]
	if !ok || kind == 0 {
		return nil, status.Error(codes.InvalidArgument, "valid query kind required")
	}
	q.Kind = agentpb.QueryKind(kind)
	if value := values.Get("family"); value != "" {
		family, ok := agentpb.AddressFamily_value[value]
		if !ok {
			return nil, status.Error(codes.InvalidArgument, "invalid address family")
		}
		q.Family = agentpb.AddressFamily(family)
	}
	for _, field := range []struct {
		name   string
		target *uint32
		max    uint64
	}{{"pageSize", &q.PageSize, 200}, {"ospfVersion", &q.OspfVersion, 3}, {"routeType", &q.RouteType, 5}} {
		if value := values.Get(field.name); value != "" {
			n, e := strconv.ParseUint(value, 10, 32)
			if e != nil || n > field.max || field.name == "pageSize" && n == 0 || field.name == "ospfVersion" && n != 2 && n != 3 {
				return nil, status.Errorf(codes.InvalidArgument, "invalid %s", field.name)
			}
			*field.target = uint32(n)
		}
	}
	q.Vrf, q.Bridge, q.Interface = values.Get("vrf"), values.Get("bridge"), values.Get("interface")
	q.PageToken, q.Prefix, q.Neighbor = values.Get("pageToken"), values.Get("prefix"), values.Get("neighbor")
	return q, nil
}

func (s *Server) events(w http.ResponseWriter, r *http.Request, rid string) {
	p := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(p) != 5 || p[0] != "api" || p[1] != "v1" || p[2] != "jobs" || p[4] != "events" {
		s.err(w, rid, status.Error(codes.NotFound, "unknown event route"))
		return
	}
	after := r.URL.Query().Get("afterSequence")
	if after == "" {
		after = r.Header.Get("Last-Event-ID")
	}
	var seq uint64
	if after != "" {
		v, e := strconv.ParseUint(after, 10, 64)
		if e != nil {
			s.err(w, rid, status.Error(codes.InvalidArgument, "invalid event cursor"))
			return
		}
		seq = v
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	checkCtx, checkCancel := context.WithTimeout(ctx, s.config.RPCTimeout)
	job, e := s.client.GetJob(checkCtx, &pb.JobRequest{JobId: p[3]})
	checkCancel()
	if e != nil {
		s.err(w, rid, e)
		return
	}
	if seq > job.Sequence {
		s.err(w, rid, status.Error(codes.OutOfRange, "event cursor exceeds job sequence"))
		return
	}
	stream, e := s.client.WatchJob(ctx, &pb.JobRequest{JobId: p[3], AfterSequence: seq})
	if e != nil {
		s.err(w, rid, e)
		return
	}
	type result struct {
		event *pb.JobEvent
		err   error
	}
	ch := make(chan result, 1)
	go func() {
		defer close(ch)
		for {
			v, e := stream.Recv()
			select {
			case ch <- result{v, e}:
			case <-ctx.Done():
				return
			}
			if e != nil {
				return
			}
		}
	}()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	rc := http.NewResponseController(w)
	write := func(value string) bool {
		_ = rc.SetWriteDeadline(time.Now().Add(10 * time.Second))
		if _, e := io.WriteString(w, value); e != nil {
			return false
		}
		return rc.Flush() == nil
	}
	if !write(": connected\n\n") {
		return
	}
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !write(": heartbeat\n\n") {
				return
			}
		case result, ok := <-ch:
			if !ok {
				return
			}
			if result.err != nil {
				if !errors.Is(result.err, io.EOF) && ctx.Err() == nil {
					b, _ := json.Marshal(Error{Code: status.Code(result.err).String(), Message: status.Convert(result.err).Message(), RequestID: rid})
					write("event: stream-error\ndata: " + string(b) + "\n\n")
				}
				return
			}
			b, e := marshaler.Marshal(result.event)
			if e != nil {
				return
			}
			if !write(fmt.Sprintf("id: %d\nevent: job\ndata: %s\n\n", result.event.Sequence, b)) {
				return
			}
		}
	}
}
func (s *Server) err(w http.ResponseWriter, rid string, e error) {
	c := status.Code(e)
	if errors.Is(e, context.DeadlineExceeded) {
		c = codes.DeadlineExceeded
	}
	if errors.Is(e, context.Canceled) {
		c = codes.Canceled
	}
	code := http.StatusInternalServerError
	switch c {
	case codes.InvalidArgument:
		code = 400
	case codes.Unauthenticated:
		code = 401
	case codes.PermissionDenied:
		code = 403
	case codes.NotFound:
		code = 404
	case codes.AlreadyExists, codes.Aborted, codes.FailedPrecondition:
		code = 409
	case codes.OutOfRange:
		code = 410
	case codes.ResourceExhausted:
		code = 429
	case codes.Unimplemented:
		code = 501
	case codes.Unavailable:
		code = 503
	case codes.DeadlineExceeded:
		code = 504
	case codes.Canceled:
		code = 499
	}
	message := status.Convert(e).Message()
	if c == codes.Internal || c == codes.Unknown {
		message = "controller or gateway internal error"
	}
	s.json(w, code, Error{Code: c.String(), Message: message, RequestID: rid})
}
func (s *Server) json(w http.ResponseWriter, code int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(value)
}
func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	if s.config.StaticDir == "" {
		http.NotFound(w, r)
		return
	}
	if r.Method != "GET" && r.Method != "HEAD" {
		w.WriteHeader(405)
		return
	}
	cleaned := filepath.Clean("/" + r.URL.Path)
	p := filepath.Join(s.config.StaticDir, cleaned)
	st, e := os.Stat(p)
	if e != nil || st.IsDir() {
		if filepath.Ext(r.URL.Path) != "" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(s.config.StaticDir, "index.html"))
		return
	}
	http.ServeFile(w, r, p)
}
