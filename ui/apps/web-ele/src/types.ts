export type Revision = string;
export interface Node { nodeId: string; name: string; role: string; fabricId: string; state: string; adopted: boolean; endpoint: string; instanceId: string; registrationId: string; agentRevision: Revision; lastSeenUnixMs: string; observationError: string; capabilities: { operations: { code: string; backends: string[]; rollback: boolean }[]; queries?: { kind:string; families:string[]; ospfVersions:number[] }[]; features?:string[] } | null }
export interface NodeProfile { nodeId: string; name: string; role: string; fabricId: string; routerId: string; vtepIp: string; asn: number; [key: string]: unknown }
export interface Tenant { id: string; name: string; fabricId: string; l3vni: number; importRts: string[]; exportRts: string[]; placements: { nodeId: string; tableId: number; bridge: string; vxlan: string; [key: string]: unknown }[] }
export interface Network { id: string; tenantId: string; l2vni: number; importRts: string[]; exportRts: string[]; placements: { nodeId: string; bridge: string; vxlan: string; ports: string[]; gateways: string[]; [key: string]: unknown }[] }
export interface Configuration { nodes: NodeProfile[]; tenants: Tenant[]; networks: Network[]; nodeResources?: NodeResources[] }
export interface Operation { id?: string; code: string; action: string; dependsOn?: string[]; [key: string]: unknown }
export interface BridgePolicy { bridge:string; neighSuppress?:boolean }
export interface NodeResources { nodeId: string; objects: Operation[]; bridgePolicies?:BridgePolicy[] }
export interface NodeResourcesState { resources: NodeResources; desiredRevision: Revision; editRevision: Revision; agentRevision: Revision; adopted: boolean; state: string; mode:string }
export interface QueryResponse { nodeId:string; kind:string; records:Record<string,unknown>[]; source:string; collectedUnixMs:string; nextPageToken:string; totalCount:number; stale:boolean; error:string; revision:Revision }
export interface ConfigurationState { revision: Revision; configuration: Configuration }
export interface Change { id: string; baseRevision: Revision; editRevision: Revision; configuration: Configuration; frozen: boolean; aborted: boolean; jobId: string }
export interface NodePlan { nodeId: string; operations: Record<string, unknown>[]; expectedAgentRevision: Revision }
export interface Plan { id: string; changeId: string; baseRevision: Revision; editRevision: Revision; nodes: NodePlan[]; warnings: string[] }
export interface NodeJob { nodeId: string; state: string; taskId: string; transactionId: string; agentRevision: Revision; error: string }
export interface JobEvent { jobId: string; sequence: Revision; state: string; nodeId: string; message: string; timeUnixMs: string }
export interface Job { id: string; changeId: string; state: string; desiredRevision: Revision; sequence: Revision; error: string; nodes: NodeJob[]; events: JobEvent[]; createdUnixMs: string; plan: Plan }
export interface Page<T> { items: T[]; nextPageToken: string }
export interface Topology { desiredRevision: Revision; nodes: { id: string; label: string; kind: string; nodeId: string; source: string }[]; links: { source: string; target: string; kind: string; origin: string }[]; observations: { nodeId: string; collectedUnixMs: string; stale: boolean; error: string }[]; evpnRoutes: { sourceNode: string; rd: string; type: number; nlri: string; mac: string; ip: string; nextHops: string[] }[]; warnings: string[] }
