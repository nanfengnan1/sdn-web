package httpapi

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	agentpb "sdn-agent/api/agent/v1"
	pb "sdn-controller/api/controller/v1"
)

type resourceClient struct {
	pb.NorthClient
	get   func(*pb.NodeResourcesRequest) (*pb.NodeResourcesState, error)
	edit  func(*pb.EditNodeResourcesRequest) (*pb.Change, error)
	adopt func(*pb.ImportNodeResourcesRequest) (*pb.NodeResourcesState, error)
	query func(*agentpb.QueryRequest) (*agentpb.QueryResponse, error)
}

func (f *resourceClient) GetNodeResources(_ context.Context, q *pb.NodeResourcesRequest, _ ...grpc.CallOption) (*pb.NodeResourcesState, error) {
	return f.get(q)
}
func (f *resourceClient) EditNodeResources(_ context.Context, q *pb.EditNodeResourcesRequest, _ ...grpc.CallOption) (*pb.Change, error) {
	return f.edit(q)
}
func (f *resourceClient) ImportNodeResources(_ context.Context, q *pb.ImportNodeResourcesRequest, _ ...grpc.CallOption) (*pb.NodeResourcesState, error) {
	return f.adopt(q)
}
func (f *resourceClient) QueryNode(_ context.Context, q *agentpb.QueryRequest, _ ...grpc.CallOption) (*agentpb.QueryResponse, error) {
	return f.query(q)
}

func TestResourcesRouteAndSparsePresence(t *testing.T) {
	var edits int
	s := server(t, &resourceClient{
		get: func(q *pb.NodeResourcesRequest) (*pb.NodeResourcesState, error) {
			if q.NodeId != "leaf1" || q.ChangeId != "candidate" {
				t.Fatalf("bad get: %v", q)
			}
			return &pb.NodeResourcesState{Mode: "resources", AgentRevision: 9007199254740993}, nil
		},
		edit: func(q *pb.EditNodeResourcesRequest) (*pb.Change, error) {
			edits++
			if q.ChangeId != "candidate" || q.NodeId != "leaf1" || q.EditRevision != 9 {
				t.Fatalf("bad identity: %v", q)
			}
			b := q.Operations[0].GetBridge()
			if b.Stp == nil || *b.Stp || b.AgeingTime == nil || *b.AgeingTime != 0 || b.Mtu != nil {
				t.Fatalf("presence lost: %v", b)
			}
			if q.BridgePolicies[0].NeighSuppress == nil || *q.BridgePolicies[0].NeighSuppress {
				t.Fatal("policy false lost")
			}
			return &pb.Change{Id: q.ChangeId, EditRevision: 10}, nil
		},
	}, Config{})
	w := call(s, "GET", "/api/v1/nodes/leaf1/resources?changeId=candidate", "", viewer)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"9007199254740993"`) {
		t.Fatalf("get %d %s", w.Code, w.Body.String())
	}
	body := `{"editRevision":"9","operations":[{"code":"BD","action":"SET","bridge":{"name":"br10","stp":false,"ageingTime":0}}],"bridgePolicies":[{"bridge":"br10","neighSuppress":false}]}`
	w = call(s, "PUT", "/api/v1/changes/candidate/nodes/leaf1/resources", body, admin)
	if w.Code != 200 || edits != 1 {
		t.Fatalf("edit %d %s", w.Code, w.Body.String())
	}
	for _, bad := range []string{`{"nodeId":"leaf2"}`, `{"changeId":"other"}`, `{"unknown":1}`} {
		w = call(s, "PUT", "/api/v1/changes/candidate/nodes/leaf1/resources", bad, admin)
		if w.Code != 400 {
			t.Fatalf("bad identity accepted: %s %d", bad, w.Code)
		}
	}
	for _, route := range []struct{ method, path string }{{"PUT", "/api/v1/changes/candidate/nodes/leaf1/resources"}, {"POST", "/api/v1/nodes/leaf1/resources/import"}} {
		w = call(s, route.method, route.path, body, viewer)
		if w.Code != 403 {
			t.Fatalf("viewer mutation %d", w.Code)
		}
	}
	if edits != 1 {
		t.Fatal("invalid request reached controller")
	}
}
func TestResourceImportUsesOriginalKeyAndRevision(t *testing.T) {
	calls := 0
	s := server(t, &resourceClient{adopt: func(q *pb.ImportNodeResourcesRequest) (*pb.NodeResourcesState, error) {
		calls++
		if q.NodeId != "leaf1" || q.ExpectedAgentRevision != 7 || q.RequestId != "import-once" {
			t.Fatalf("bad import %v", q)
		}
		return &pb.NodeResourcesState{Mode: "resources"}, nil
	}}, Config{})
	for range 2 {
		r := httptest.NewRequest("POST", "/api/v1/nodes/leaf1/resources/import", strings.NewReader(`{"expectedAgentRevision":"7"}`))
		r.Header.Set("Authorization", "Bearer "+admin)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", "import-once")
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
	}
	if calls != 2 {
		t.Fatal("key retry not forwarded")
	}
	w := call(s, "POST", "/api/v1/nodes/leaf1/resources/import", `{"expectedAgentRevision":"7"}`, admin)
	if w.Code != 400 {
		t.Fatalf("missing key %d", w.Code)
	}
}
func TestQueryValidationAndErrorNotEmptyResult(t *testing.T) {
	calls := 0
	s := server(t, &resourceClient{query: func(q *agentpb.QueryRequest) (*agentpb.QueryResponse, error) {
		calls++
		if q.NodeId != "leaf1" || q.Kind != agentpb.QueryKind_OSPF_NEIGHBORS || q.OspfVersion != 3 || q.Vrf != "TENANT-A" || q.Family != agentpb.AddressFamily_IPV6 {
			t.Fatalf("query %+v", q)
		}
		return nil, status.Error(codes.NotFound, "VRF TENANT-A does not exist")
	}}, Config{})
	w := call(s, "GET", "/api/v1/nodes/leaf1/query?kind=OSPF_NEIGHBORS&ospfVersion=3&vrf=TENANT-A&family=IPV6", "", viewer)
	if w.Code != 404 || !strings.Contains(w.Body.String(), "does not exist") {
		t.Fatalf("query error hidden: %d %s", w.Code, w.Body.String())
	}
	for _, query := range []string{"", "kind=BOGUS", "kind=TENANTS&kind=FDB", "kind=TENANTS&family=bogus", "kind=TENANTS&pageSize=0", "kind=TENANTS&pageSize=201", "kind=OSPF_SUMMARY&ospfVersion=1", "kind=EVPN_ROUTES&routeType=6", "kind=TENANTS&random=1"} {
		w = call(s, "GET", "/api/v1/nodes/leaf1/query?"+query, "", viewer)
		if w.Code != 400 {
			t.Fatalf("invalid %s: %d %s", query, w.Code, w.Body.String())
		}
	}
	if calls != 1 {
		t.Fatal("invalid query reached controller")
	}
}
