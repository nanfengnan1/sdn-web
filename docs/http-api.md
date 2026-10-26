# Gateway HTTP API

All `/api/v1` calls require `Authorization: Bearer <token>`; tokens are configured
as `SDN_ADMIN_TOKEN` and optional `SDN_VIEWER_TOKEN` in both Gateway and Controller.
The Agent credential is never accepted as a Web user credential. Controller
independently authorizes every forwarded RPC. No credentials appear in URLs.

JSON follows Protobuf JSON: lowerCamelCase names and **decimal strings for uint64**.
Unknown fields and body/path ID disagreement are rejected. Request bodies are
limited to 1 MiB. Lists default to 50 rows, accept `pageSize=1..200`, `pageToken`,
and return `nextPageToken`. All target IDs are URL path segments.

| Method/path | Body/query | Result |
| --- | --- | --- |
| GET `/me` | — | role from Gateway credential mapping |
| GET `/nodes` | pageSize/pageToken | registered nodes |
| GET `/nodes/{id}` | — | node/capabilities |
| POST `/nodes/{id}/adopt` | expectedRevision, allowExisting | adopted node |
| GET `/desired` | — | revision + complete configuration |
| POST `/changes` | baseRevision; Idempotency-Key header | 201 Change |
| GET `/changes/{id}` | — | Change |
| PUT `/changes/{id}` | editRevision + complete configuration | updated Change |
| POST `/changes/{id}/plan` | — | immutable Plan |
| POST `/changes/{id}/commit` | planId; Idempotency-Key header | **202 Job** |
| DELETE `/changes/{id}` | — | abort uncommitted candidate |
| GET `/jobs` | pageSize/pageToken | Jobs |
| GET `/jobs/{id}` | — | Job with node results and events |
| GET `/jobs/{id}/events` | afterSequence or Last-Event-ID | SSE |
| GET `/topology` | refresh=false; repeated nodeId | topology + freshness |
| GET `/nodes/{id}/resources` | optional changeId | NodeResourcesState (desired/candidate objects, policies, revisions, mode) |
| PUT `/changes/{change}/nodes/{node}/resources` | editRevision, operations and/or bridgePolicies | updated Change |
| POST `/nodes/{id}/resources/import` | expectedAgentRevision + idempotency key | verified NodeResourcesState |
| GET `/nodes/{id}/query` | kind + typed scope/family/version/page filters | Agent QueryResponse with actual records and provenance |

The HTTP response for Commit is the complete public `Job` message, whose `id` is
the job ID. `202` means durably accepted, not successful configuration. Repeating
Begin/Commit must use the original body/key. No arbitrary Linux/FRR command API
is exposed. A complete Configuration contains nodes/tenants/networks and
nodeResources arrays (the latter holds per-node canonical Operation objects and
bridgePolicies). Never omit existing nodeResources in a complete replacement;
GetConfiguration is the editing baseline and PUT replaces the full candidate.

Resource edits are sparse candidate changes; optional false/zero remain present.
Deletion accepts natural identity fields and the Controller expands the managed
object, checks references, and plans dependencies. Editing does not execute the
Agent; Plan/Commit/Job remains required. Import uses readback validation to adopt
an unmanaged or legacy baseline. Viewer cannot edit or import.

Query parameters: kind (required enum name), vrf, bridge, interface, family,
ospfVersion, pageSize, pageToken, routeType, prefix, neighbor. Unknown/duplicate
filters and malformed enums/numbers are rejected; backend validates combinations
and capability. Errors remain HTTP errors, never a fabricated empty records list.
QueryResponse includes source, collectedUnixMs, revision, stale, error, records,
totalCount and nextPageToken. Actual queries are separate from desired objects.

Errors contain `code`, `message`, `requestId`. gRPC mapping: InvalidArgument=400,
Unauthenticated=401, PermissionDenied=403, NotFound=404,
Aborted/AlreadyExists/FailedPrecondition=409, OutOfRange=410,
ResourceExhausted=429, Unimplemented=501, Unavailable=503, DeadlineExceeded=504.
Gateway/Controller internal error details are not exposed. A 5xx or transport
error on Commit has an unknown outcome; query/retry the original request. On an
explicit 4xx rejection the UI first queries Change: a frozen job is recovered,
an unfrozen candidate can be re-edited/replanned. Begin version rejection clears
its failed request so a fresh baseline can be selected.

SSE uses `id: <sequence>`, `event: job`, one JSON `data` line. Comment heartbeats
arrive every 15 seconds; writes have a 10-second deadline. Each stream has a
one-event buffer and cancellation closes its upstream RPC. A late gRPC error is
sent as `event: stream-error`; clients query GetJob and resume from its sequence.
The UI handles fragmented UTF-8/frames and uint64 sequences without rounding,
deduplicates events, throttles detail refreshes, and stops after terminal jobs.
UNKNOWN is not treated as a terminal failure. Gateway does not keep unique task
state and can restart independently of running jobs.

Default concurrency: 64 unary requests and 64 event subscriptions, separately
bounded and configurable. Unary timeout is 30 seconds. `/healthz` is unauthenticated
liveness; `/readyz` requires a valid user credential and checks Controller read
access. Cross-origin deployment requires an explicit allowed-origin list; no
wildcard access or cookies are enabled.
