package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	pb "sdn-controller/api/controller/v1"
)

const admin = "test-admin-credential-123"
const viewer = "test-viewer-credential-123"

type fakeClient struct {
	pb.NorthClient
	commit func(context.Context, *pb.CommitChangeRequest) (*pb.Job, error)
	config func(context.Context) (*pb.ConfigurationState, error)
	getJob func(context.Context, *pb.JobRequest) (*pb.Job, error)
	watch  func(context.Context, *pb.JobRequest) (grpc.ServerStreamingClient[pb.JobEvent], error)
}

func (f *fakeClient) CommitChange(c context.Context, q *pb.CommitChangeRequest, _ ...grpc.CallOption) (*pb.Job, error) {
	return f.commit(c, q)
}
func (f *fakeClient) GetConfiguration(c context.Context, _ *pb.Empty, _ ...grpc.CallOption) (*pb.ConfigurationState, error) {
	return f.config(c)
}
func (f *fakeClient) GetJob(c context.Context, q *pb.JobRequest, _ ...grpc.CallOption) (*pb.Job, error) {
	return f.getJob(c, q)
}
func (f *fakeClient) WatchJob(c context.Context, q *pb.JobRequest, _ ...grpc.CallOption) (grpc.ServerStreamingClient[pb.JobEvent], error) {
	return f.watch(c, q)
}
func server(t *testing.T, c pb.NorthClient, config Config) *Server {
	t.Helper()
	config.AdminToken = admin
	config.ViewerToken = viewer
	s, e := New(c, config)
	if e != nil {
		t.Fatal(e)
	}
	return s
}
func call(s http.Handler, method, path, body, credential string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if credential != "" {
		r.Header.Set("Authorization", "Bearer "+credential)
	}
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}

func TestAuthenticationAndViewerWrite(t *testing.T) {
	s := server(t, &fakeClient{}, Config{})
	for _, test := range []struct {
		token, method, path string
		want                int
	}{{"", "GET", "/api/v1/me", 401}, {"bad", "GET", "/api/v1/me", 401}, {viewer, "GET", "/api/v1/me", 200}, {viewer, "POST", "/api/v1/changes", 403}, {viewer, "PUT", "/api/v1/changes/id", 403}, {viewer, "DELETE", "/api/v1/changes/id", 403}} {
		w := call(s, test.method, test.path, "{}", test.token)
		if w.Code != test.want {
			t.Fatalf("%s %s: %d %s", test.method, test.path, w.Code, w.Body.String())
		}
	}
}
func TestCommitIdentityAndProtobufJSON(t *testing.T) {
	var count int
	f := &fakeClient{commit: func(ctx context.Context, q *pb.CommitChangeRequest) (*pb.Job, error) {
		count++
		md, _ := metadata.FromOutgoingContext(ctx)
		if md.Get("authorization")[0] != "Bearer "+admin {
			t.Error("not forwarded")
		}
		if q.ChangeId != "c1" || q.PlanId != "p1" || q.RequestId != "fixed-key" {
			t.Fatalf("bad request %+v", q)
		}
		return &pb.Job{Id: "j1", State: "ACCEPTED", DesiredRevision: 9007199254740993}, nil
	}}
	s := server(t, f, Config{})
	for range 2 {
		r := httptest.NewRequest("POST", "/api/v1/changes/c1/commit", strings.NewReader(`{"planId":"p1"}`))
		r.Header.Set("Authorization", "Bearer "+admin)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", "fixed-key")
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		if w.Code != 202 {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
		var value map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &value)
		if value["desiredRevision"] != "9007199254740993" {
			t.Fatal("uint64 lost precision")
		}
	}
	if count != 2 {
		t.Fatal("Gateway must delegate deduplication to Controller")
	}
	for _, body := range []string{`{"planId":"p1"}`, `{"planId":"p1","requestId":"k","changeId":"wrong"}`, `{"planId":"p1","requestId":"k","unexpected":true}`} {
		w := call(s, "POST", "/api/v1/changes/c1/commit", body, admin)
		if w.Code != 400 {
			t.Fatalf("invalid request not rejected: %d", w.Code)
		}
	}
}
func TestUpstreamErrorsAndCancellation(t *testing.T) {
	for _, test := range []struct {
		code codes.Code
		http int
	}{{codes.Unauthenticated, 401}, {codes.PermissionDenied, 403}, {codes.Aborted, 409}, {codes.Unavailable, 503}, {codes.DeadlineExceeded, 504}} {
		s := server(t, &fakeClient{config: func(context.Context) (*pb.ConfigurationState, error) {
			return nil, status.Error(test.code, "controller-rejected")
		}}, Config{})
		w := call(s, "GET", "/api/v1/desired", "", viewer)
		if w.Code != test.http {
			t.Fatalf("%v -> %d", test.code, w.Code)
		}
	}
	s := server(t, &fakeClient{config: func(ctx context.Context) (*pb.ConfigurationState, error) { <-ctx.Done(); return nil, ctx.Err() }}, Config{RPCTimeout: 5 * time.Millisecond})
	w := call(s, "GET", "/api/v1/desired", "", admin)
	if w.Code != 504 {
		t.Fatal(w.Code)
	}
}
func TestConcurrentAdmission(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	f := &fakeClient{config: func(context.Context) (*pb.ConfigurationState, error) {
		calls.Add(1)
		close(entered)
		<-release
		return &pb.ConfigurationState{}, nil
	}}
	s := server(t, f, Config{MaxRequests: 1})
	done := make(chan struct{})
	go func() { defer close(done); call(s, "GET", "/api/v1/desired", "", admin) }()
	<-entered
	w := call(s, "GET", "/api/v1/desired", "", admin)
	close(release)
	<-done
	if w.Code != 429 || calls.Load() != 1 {
		t.Fatalf("limit %d count %d", w.Code, calls.Load())
	}
}

type eventStream struct {
	grpc.ClientStream
	ctx    context.Context
	events []*pb.JobEvent
	err    error
	index  int
	block  bool
	closed chan struct{}
}

func (e *eventStream) Recv() (*pb.JobEvent, error) {
	if e.index < len(e.events) {
		v := e.events[e.index]
		e.index++
		return v, nil
	}
	if e.block {
		<-e.ctx.Done()
		if e.closed != nil {
			close(e.closed)
		}
		return nil, e.ctx.Err()
	}
	if e.err != nil {
		return nil, e.err
	}
	return nil, io.EOF
}
func TestSSECursorAndFraming(t *testing.T) {
	f := &fakeClient{getJob: func(context.Context, *pb.JobRequest) (*pb.Job, error) { return &pb.Job{Sequence: 3}, nil }, watch: func(ctx context.Context, q *pb.JobRequest) (grpc.ServerStreamingClient[pb.JobEvent], error) {
		if q.AfterSequence != 2 {
			t.Errorf("cursor %d", q.AfterSequence)
		}
		return &eventStream{ctx: ctx, events: []*pb.JobEvent{{JobId: q.JobId, Sequence: 3, State: "SUCCEEDED", Message: "配置完成"}}}, nil
	}}
	s := server(t, f, Config{})
	w := call(s, "GET", "/api/v1/jobs/j1/events?afterSequence=2", "", viewer)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "id: 3\nevent: job\ndata: ") || !strings.Contains(w.Body.String(), "配置完成") {
		t.Fatal(w.Body.String())
	}
	if !strings.HasPrefix(w.Header().Get("Content-Type"), "text/event-stream") {
		t.Fatal("SSE content type")
	}
	w = call(s, "GET", "/api/v1/jobs/j1/events?afterSequence=4", "", admin)
	if w.Code != 410 {
		t.Fatal("future cursor", w.Code)
	}
}
func TestSSEDisconnectCancelsUpstream(t *testing.T) {
	closed := make(chan struct{})
	f := &fakeClient{getJob: func(context.Context, *pb.JobRequest) (*pb.Job, error) { return &pb.Job{Sequence: 0}, nil }, watch: func(ctx context.Context, _ *pb.JobRequest) (grpc.ServerStreamingClient[pb.JobEvent], error) {
		return &eventStream{ctx: ctx, block: true, closed: closed}, nil
	}}
	server := httptest.NewServer(server(t, f, Config{}))
	defer server.Close()
	r, _ := http.NewRequest("GET", server.URL+"/api/v1/jobs/j1/events", nil)
	r.Header.Set("Authorization", "Bearer "+admin)
	resp, e := http.DefaultClient.Do(r)
	if e != nil {
		t.Fatal(e)
	}
	_ = resp.Body.Close()
	select {
	case <-closed:
	case <-time.After(2 * time.Second):
		t.Fatal("upstream stream leaked after disconnect")
	}
}
func TestCORSAndUnknownRoutes(t *testing.T) {
	s := server(t, &fakeClient{}, Config{AllowedOrigins: []string{"https://console.example"}})
	r := httptest.NewRequest("OPTIONS", "/api/v1/desired", nil)
	r.Header.Set("Origin", "https://console.example")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "https://console.example" {
		t.Fatal(w.Code)
	}
	r.Header.Set("Origin", "https://untrusted.example")
	w = httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
	w = call(s, "GET", "/api/v1/missing", "", admin)
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
}
