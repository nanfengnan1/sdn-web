# sdn-web 架构设计

更新日期：2026-10-27。

2026-10-27 已增加 VPP 运行查询展示：资源页识别 `dataplane/vpp-26.06` 能力，显示 VPP 标识；VXLAN 列表优先显示原生接口、本地 VTEP、地址族、远端和 BUM 数，展开查看 MAC→VTEP 映射；接口/FDB/路由使用适合 VPP 的列与状态格式。Gateway/Controller 公共查询协议不变，权限与取消沿用现有实现。新增 `query-presentation.test.ts`，真实无模拟浏览器验收 `tests/e2e/vpp-query.cjs`，配合同级 sdn-agent 的隔离实验脚本；IPv6 外层及 viewer 查询已纳入测试。未发布或修改 v1.0。

项目路径：`~/program/github/sdn-web`，Windows 共享路径为 `X:\program\github\sdn-web`。

本文是首版实施设计。Web 首版已实现并完成基础构建及单元测试，当前代码映射和已验证范围见第 9 节；完整端到端结果由独立测试记录说明。已读取本轮新增的 [Controller 北向 Protobuf](../sdn-controller/api/controller/v1/controller.proto)，其 `sdn.controller.v1.North` 服务是跨项目接口的依据，第 4 节按该协议对齐。

## 1. 项目边界与首版范围

`sdn-web` 是独立项目，包含 Vue 前端和 Go Gateway。Gateway 与 Controller 是独立进程，通过 gRPC 通信；前端独立构建为静态文件。三个组件可以分别部署，实验环境允许 Gateway 托管前端构建产物，但不将前端或 Gateway 编译进 Controller。

| 组件 | 职责 | 数据归属 |
| --- | --- | --- |
| Vue UI | 展示、编辑、计划预览、任务进度、拓扑交互 | 页面状态和可丢弃缓存 |
| Go Gateway | HTTP JSON API、身份校验、协议转换、SSE 推送、请求限流 | 连接状态和有界临时缓冲 |
| Controller | 节点、全局资源、校验、计划、执行编排、查询与恢复 | etcd 中的配置、候选、任务、幂等记录；可重建观测缓存 |
| Agent | 本节点 Linux/FRR 配置执行、回读和回滚 | 本地 Redis/File 中的事务和状态 |

首版页面：节点清单、详情及显式纳管、Desired 配置、候选编辑与预览、提交、任务清单与详情、拓扑视图。页面调用真实 Gateway/Controller 接口；模拟数据只允许用于明确标识的单元测试和开发 fixture。

当前容器交付把 etcd 集成在 Controller 容器，把 Redis/FRR 集成在每个 Agent 容器；数据库数据仍持久挂卷。Controller 和 Agent 分别从容器外只读挂载 `controller.conf`、`agent.conf`，文件同时描述应用和内置数据库启动配置。Web/Gateway 本身无 nodeId；网络 Configuration 的 `nodes[].nodeId`、租户和网络的 `placements[].nodeId` 必须引用实际注册 UUID。

首版认证采用管理员/只读用户两类 Bearer token。OIDC、Cookie 会话、细粒度租户 RBAC、Gateway 多副本压测及 Controller HA 放到后续阶段。独立部署和接口并发从首版支持；不能把 Gateway 可扩容等同于 Controller 已支持多实例写入。

## 2. 分层架构

```text
                         Browser
                            |
  +-------------------------------------------------------+
  | L1 Presentation: Vue 3 + TypeScript                   |
  | Vben Admin / Element Plus                            |
  | Nodes | Desired | Changes | Jobs | Topology           |
  +-------------------------------------------------------+
                            |
  +-------------------------------------------------------+
  | L2 Frontend Application                              |
  | Route/access | forms | query state | event reducer    |
  | typed API client | cancellation | reconnect cursor    |
  +-------------------------------------------------------+
                            |
                  HTTPS JSON + SSE
                            |
  +-------------------------------------------------------+
  | L3 Go Gateway HTTP                                   |
  | Authentication | access | request ID | bounds         |
  | REST handlers | error mapping | SSE writer            |
  +-------------------------------------------------------+
                            |
  +-------------------------------------------------------+
  | L4 Controller Client Adapter                         |
  | versioned protobuf | gRPC client | deadline           |
  | token forwarding | job stream | cancellation          |
  +-------------------------------------------------------+
                            |
                         gRPC/TLS
                            |
  +-------------------------------------------------------+
  | Existing boundary: Controller North API               |
  | Service -> Planning -> Orchestration -> South         |
  | Repository -> etcd                                   |
  +-------------------------------------------------------+
                            |
                       Node Agents

  Deployment: UI static host / Gateway / Controller independent
  Optional: Gateway serves the separately built UI assets
```

Gateway 是 Controller 的外部北向适配器。它不做 VNI 分配、op DAG 编译、配置差异判断或节点任务补偿；这些规则由 Controller 统一处理。它不直接连接 Agent、执行 Linux/FRR 命令或访问 Controller 的 etcd。

前端采用 Vben Admin 的 Element Plus 版本作为基础，保留其布局和必要的路由、状态管理封装，删除示例业务。上游明确提供 Element Plus 版本，框架版本和依赖在实施时固定并保留许可信息。[Vben 组件库说明](https://doc.vben.pro/guide/in-depth/ui-framework.html)

拓扑组件使用 G6，统计图表按首版需求使用 ECharts；两者分别封装在业务组件中，不让页面直接依赖图形库的内部对象。首版没有足够真实指标时不显示虚构统计。

## 3. 内部组件设计

### 3.1 组件关系

```text
 Vue UI
 +-----------------------------------------------------+
 | App Shell / Router / Access                         |
 |       |                                             |
 | Nodes  Desired  Change Editor  Job Detail  Topology  |
 |       |                                             |
 | API Client <---- Query State / Event Reducer         |
 +-------------------------+---------------------------+
                           |
                  HTTP JSON / fetch SSE
                           |
 Go Gateway                v
 +-----------------------------------------------------+
 | Middleware: token / request ID / limits / logging    |
 |                         |                           |
 |     +-------------------+--------------------+      |
 |     v                   v                    v      |
 | Query Handlers    Change Handlers       Event Handler|
 |     |                   |                    |      |
 | DTO / errors      idempotency key       SSE framing |
 |     |                   |                    |      |
 |     +-------------------+--------------------+      |
 |                         v                           |
 |                  ControllerClient                   |
 |             versioned generated gRPC stub            |
 +-------------------------+---------------------------+
                           |
                     Controller API
```

| 组件 | 首版行为 |
| --- | --- |
| App Shell / Router | 导航、页面布局、权限入口；前端隐藏按钮只改善交互，不作为授权依据 |
| API Client | 统一 base URL、Bearer token、请求 ID、错误处理及取消；不自动重试未知结果的写操作 |
| Query State | 记录加载/空/错误/过期状态；切换节点或筛选时取消旧查询，防止晚返回的响应覆盖新页面 |
| Change Editor | 编辑 Controller 接受的资源配置；保留 change_id、基础版本和草稿版本；显示校验错误与计划 |
| Event Reducer | 按 job_id 和 sequence 去重合并；维护最后已处理游标，收到终态后停止订阅 |
| Topology View | 消费 Controller 提供的图节点/边及来源；区分配置关系和观测关系，不从 Type-3 猜测物理连接 |
| HTTP Middleware | 校验 token、请求体大小、允许的方法；生成/传播 request_id；限制请求和订阅数量 |
| Query Handlers | 调用节点、Desired、任务和拓扑查询，保持筛选及分页语义 |
| Change Handlers | 做传输层解析，将用户意图交给 Controller；提交的幂等键原样传递 |
| Event Handler | 将 Controller 任务事件转换为 SSE；有界缓冲、写超时、断线清理 |
| ControllerClient | 维护可复用的 gRPC 连接；负责超时、凭据、协议转换和可观测错误 |

### 3.2 代码与协议解耦

```text
sdn-web/
  agent.md
  README.md
  ui/                         独立 package.json 和前端构建
    apps/web-ele/             采用上游 Vben 布局时的业务入口
    packages/                 仅保留该应用所需共享包
  gateway/                    独立 go.mod
    cmd/sdn-web-gateway/
    internal/httpapi/
    internal/auth/
    internal/controllerclient/
    internal/events/
  deploy/                     容器、反向代理和组合部署
  tests/                      契约与端到端验证
```

该目录是目标布局，保留 Vben 必需的 workspace 结构优先于强行搬移文件。实际入口以实现后的 README 为准。

Controller 维护 `sdn.controller.v1` 北向协议及生成的公开 Go 客户端，首版 Go 导入路径为 `sdn-controller/api/controller/v1`，包名 `controllerv1`，服务名 `North`。Gateway 只导入公开 API 包，不导入 Controller `internal`；本地开发允许通过 Go `replace` 指向相邻项目，发布时固定协议版本。HTTP DTO 和生成的前端类型要明确字段映射，不能依赖 Go 结构体默认 JSON 行为。

当前 [Agent 协议](../sdn-agent/api/agent/v1/agent.proto) 中的 `Controller.Register/Heartbeat` 是节点接入服务，不是 Web 北向资源服务。浏览器既不调用该服务，也不直接组装 Agent `Operation`。首版候选编辑器可以接受结构化资源 JSON；租户/网络表单在同一资源契约上逐步完善，不能通过任意命令执行接口代替资源 API。

### 3.3 身份、数据和并发

首版 Gateway 和 Controller 都验证 Bearer token，采用 `admin`、`viewer` 角色。Gateway 通过可信配置识别角色，并将用户凭据转发给 Controller 复核；不接受浏览器自报的角色或任意 `X-User` 作为授权依据。Viewer 可查询但不能修改候选或提交。节点注册凭据与 Web 用户凭据分开配置。

浏览器首版以运行时登录输入获得 token，不写入源码、构建产物或 URL；默认仅在内存保存，刷新后重新输入。前端可以保留非敏感的 job_id、change_id 和事件游标。后续再实现正式登录和会话管理。

关键数据保存在 Controller：候选、草稿修订、配置版本、任务、幂等收据和可重放任务事件。Gateway 内存只保存连接和有界缓存，重启后可通过 Controller 查询恢复。首版 Gateway 无独立业务数据库，也不新增 Redis。

查询并发设置上限，列表采用服务端筛选与分页。若首版 API 仅支持有界列表，UI 明确范围和截断信息，不假装完整分页。拓扑普通查询读取 Controller 汇总快照，返回采集时间和过期状态；刷新必须有独立的可见进行中状态，不能每个浏览器轮询都触发全网 Agent 采集。

配置并发由 Controller 的版本检查处理：提交携带基础业务版本，同一候选被并发编辑时也需要草稿版本或等价条件检查。版本冲突返回 409 和当前版本，页面保留用户输入以便重新比较。只在 Gateway 内加锁无法保护跨副本写入。

首版 Controller 保持单个配置写入实例；Gateway 的并发接入不改变这一限制。后续 Gateway 多副本使用一致的身份配置和 Controller 事件存储，不要求会话粘滞；Controller HA 需单独解决 Agent 控制权隔离。

## 4. HTTP 与 Controller 接口约定

以下 RPC 名称已与本轮 Controller `.proto` 对齐；HTTP 路径为首版约定。实施者需要同步 HTTP 文档和契约测试，不能在 Controller 尚无对应能力时返回伪造成功。

| HTTP 入口建议 | Controller 语义 | 结果 |
| --- | --- | --- |
| `GET /api/v1/me` | Gateway 已校验身份 | 用户标识与角色，不返回 token |
| `GET /api/v1/nodes` | ListNodes | 节点清单、管理状态、版本 |
| `GET /api/v1/nodes/{id}` | GetNode | 节点详情和能力；能力不足明确展示 |
| `POST /api/v1/nodes/{id}/adopt` | AdoptNode | 显式纳管；expected_revision、allow_existing |
| `GET /api/v1/desired` | GetConfiguration | 期望资源及业务 revision |
| `POST /api/v1/changes` | BeginChange | change_id、基础版本、候选 |
| `GET /api/v1/changes/{id}` | GetChange | 可恢复候选和计划关联 |
| `PUT /api/v1/changes/{id}` | EditChange | 替换完整候选 Configuration，携带 edit_revision |
| `POST /api/v1/changes/{id}/plan` | PlanChange | 计划、节点操作、校验错误 |
| `POST /api/v1/changes/{id}/commit` | CommitChange | 携带 plan_id、request_id；持久受理后 `202` 和 job_id |
| `DELETE /api/v1/changes/{id}` | AbortChange | 只丢弃未提交候选 |
| `GET /api/v1/jobs` | ListJobs | 任务清单 |
| `GET /api/v1/jobs/{id}` | GetJob | 全局状态、节点结果和错误 |
| `GET /api/v1/jobs/{id}/events` | WatchJob(after_sequence) | SSE 事件流 |
| `GET /api/v1/topology` | GetTopology | 图与来源、新鲜度、范围信息 |

首版 `Configuration` 包含 `nodes`、`tenants`、`networks` 三个列表。`NodeProfile` 描述接口、地址、OSPF、BGP 和 VTEP；Tenant 包含 L3VNI、RT 及每节点 placement；Network 包含 L2VNI、RT 和 BD/VXLAN/网关/接入口 placement。GetConfiguration 的结果是编辑起点，EditChange 替换完整候选，不能将只改了一个租户的局部 JSON 当完整配置提交。

BeginChange 使用 `base_revision`；EditChange 使用返回的最新 `edit_revision`；PlanChange 返回与该草稿版本对应的 `plan_id`；CommitChange 使用该 `plan_id` 和固定 `request_id`。再次编辑后必须重新预览计划。Node 的注册记录与 Configuration.nodes 中的期望配置是两个对象，注册完成不会自动覆盖节点配置。

ListNodes/ListJobs 使用 `page_size/page_token` 与 `next_page_token`。GetTopology 支持 `node_ids` 和 `refresh`，普通访问 `refresh=false`；显式刷新才传 true。返回配置图、带新鲜度的观测和 EVPN 路由，UI 不假定所有部分都已采集成功。

HTTP 请求使用 `/api/v1` 版本前缀，应用错误统一包含 `code`、`message`、`request_id`，可附资源字段或当前版本。典型映射：无凭据 401、权限不足 403、资源不存在 404、版本/冻结状态冲突 409、参数错误 400、并发限额 429、上游不可用 503、请求超时 504。

Begin/Commit 使用 `Idempotency-Key`，Gateway 映射到 Controller request_id。相同身份、相同键、相同请求返回原结果；同键不同请求必须拒绝。浏览器重试沿用原键，提交前不能因刷新或超时重新生成一个键后盲目重放。受理状态以 Controller 已持久化的任务为准。

HTTP 消息采用 Protobuf JSON 的 lowerCamelCase 字段名；本文对协议字段的讨论保留 `.proto` 中的 snake_case 名称。对可能超过 JavaScript 安全整数范围的 revision、sequence、uint64 字段，JSON 使用十进制字符串，前端按字符串或 BigInt 比较，避免精度丢失。任务状态直接保留 Controller 的状态值，未知的新状态显示原值，不默认解释为成功。

任务的 `SUCCEEDED` 表示配置事务已成功，BGP 收敛、Type-2/Type-3 及主机连通性是额外观测/验收结果。`PARTIAL`、`UNKNOWN`、回滚失败需要直接展示节点级详情。首版不提供一个实际不存在的“撤销已成功 Agent task”按钮。

## 5. 请求与响应时序

### 5.1 查询节点与配置

```text
Browser          Gateway Auth / Handler      Controller Query       Store/Cache
   |                       |                         |                   |
   |-- GET nodes + token ->|                         |                   |
   |                       | verify identity/role    |                   |
   |                       |-- ListNodes + token --->| verify identity   |
   |                       |                         |-- read ---------->|
   |                       |                         |<-- records -------|
   |                       |<-- nodes + revision ----|                   |
   |<-- 200 JSON ----------|                         |                   |
   | show loading/error/empty/data separately        |                   |
```

查询失败保留最后成功结果并标记过期；错误不能被转换成空节点清单。Controller 不可达时 Gateway readiness 报告上游状态，liveness 仅判断进程自身。

节点首次注册后由管理员在详情页显式执行纳管：读取 Node 的 agent_revision，提交 AdoptNode(expected_revision, allow_existing)。`allow_existing` 默认 false；存在已有配置时需要页面明确确认后才允许 true，不自动接管或清空。Controller 重新验证节点版本并建立受管基线，返回 adopted 状态；版本变化则重新查询。普通查询或打开页面不得触发纳管。

### 5.2 编辑、预览和提交

```text
Browser                 Gateway                Controller                 etcd
   |                       |                         |                      |
   |-- Begin(base,key) --->|-- BeginChange --------->|-- save candidate ---->|
   |<-- change_id ---------|<------------------------|<---------------------|
   |-- Edit(full config) ->|-- EditChange ---------->|-- update draft ------>|
   |<-- draft revision ----|<------------------------|<---------------------|
   |-- Plan -------------->|-- PlanChange ---------->| validate and compile |
   |<-- diff + node plan --|<-- plan/version --------|                      |
   |                       |                         |                      |
   |-- Commit(plan,key) -->|-- CommitChange -------->| recheck versions      |
   |                       |                         |-- atomic publish --->|
   |                       |                         | desired/job/receipt   |
   |                       |<-- accepted job_id -----|<---------------------|
   |<-- 202 + job_id ------|                         |                      |
   |                       |                  worker -> Agents             |
   |-- GetJob/subscribe -->|-- GetJob/WatchJob ------>|                      |
   |<-- progress/result ---|<------------------------|                      |
```

409 时页面保留草稿并展示版本冲突，不自动覆盖新配置。浏览器或 Gateway 断开不会取消已经持久化的 Controller Job。Gateway 只取消当前查询/订阅 RPC，Controller 的任务执行上下文必须独立于 HTTP 请求生命周期。

### 5.3 SSE 订阅、断线与恢复

```text
Browser                   Gateway A             Controller Event Store
   |-- fetch events(token, after=N) -->|                    |
   |                        |-- WatchJob(after=N) -------->|
   |<-- id:N+1, event:job ---|<-- persisted event N+1 ------|
   | apply event, save cursor                             |
   |                 connection lost                      |
   |                                                      |
   |                       Gateway B                      |
   |-- fetch events(token, after=N+1) ->|                  |
   |                        |-- WatchJob(after=N+1) ------>|
   |<-- missed/live events -|<-----------------------------|
   | drop duplicate IDs; GetJob if stream cannot resume    |
   |<-- terminal event -----|<-----------------------------|
   | stop reconnecting                                    |
```

首版使用 `fetch` 读取 `text/event-stream`，从而携带 Authorization。客户端负责 SSE 分帧、UTF-8 增量解码、重连和游标；不能假设一次网络 chunk 就是一条事件。事件格式使用 `id`、`event: job` 和 JSON `data`，遵循 SSE 标准。[SSE 标准](https://html.spec.whatwg.org/multipage/server-sent-events.html)

Gateway 接受 `after_sequence`，也可兼容 `Last-Event-ID`；没有游标则从 API 定义的起点读取。事件 ID 在一个 job 内单调，客户端按 job_id 和 sequence 去重。服务端定时写注释心跳，并关闭代理缓冲；慢客户端超过有界缓冲时断开，让其带游标恢复。

过期游标返回明确的无法重放错误，前端重新 GetJob 取得完整快照及对应事件游标后续订阅。若首版不清理事件，需要明确记录保留策略，不能承诺无限存储。订阅已经到达终态且无新事件时直接结束，前端查询终态后停止循环重连。

### 5.4 Commit 响应丢失

```text
Browser                   Gateway                 Controller
   |-- Commit(key=K) -------->|-- CommitChange(K) ----->|
   |                         |                 persist Job J + receipt K
   |                   response lost                  |
   | mark submission outcome unknown                  |
   |-- retry same change/K ->|-- CommitChange(K) ----->|
   |<-- original Job J ------|<-- receipt lookup ------|
   |-- query Job J ----------|------------------------>|
```

HTTP 超时只说明本次调用未得到结果。已知 job_id 则查询任务；未知 job_id 则用原 change_id 和幂等键重试。禁止把超时直接显示为“配置失败并已回滚”。

### 5.5 拓扑查询

```text
Browser             Gateway             Controller Topology      Collector
   |-- GET topology -->|-- GetTopology ------>|                       |
   |                   |                     | read existing snapshot|
   |<-- nodes/edges ---|<-- source/time/stale-|                       |
   | render configuration/observed views separately                  |
   |                   |                     |<-- independent collect|
   |-- later refresh ->|-- GetTopology ------>| updated snapshot      |
```

Type-2/Type-3 支持 Overlay 和主机位置视图；物理 Leaf-Spine 连接来自显式配置或后续 LLDP 采集。首版没有这些来源时，页面显示不可用或配置关系。网络上下文使用 Controller 的租户/网络 ID 与映射，不能只按 MAC/IP 或 RT 后缀跨租户合并。

## 6. 独立部署和运行约束

前端构建为静态资产，通过可配置 API base URL 连接 Gateway。推荐统一域名下将 `/api/` 转发到 Gateway、其余路径提供静态文件；组件仍可位于不同机器。跨域部署时显式配置允许的来源及 Authorization 头。Vite 开发服务器只用于开发。

Gateway 通过配置取得 Controller endpoint 和 TLS 信任，不能让浏览器指定任意 gRPC 目标。生产使用 HTTPS/gRPC TLS；实验环境使用显式 insecure 参数，并在部署文档中标明。secret 从环境或受保护配置加载，示例中只出现占位值。

进程退出时停止新请求、关闭订阅并允许有界时间内的调用结束。任务持久化和恢复归 Controller 负责。多副本 Gateway 共用 Controller API，连接可以重新建立；用户身份配置须一致。后续引入登录会话时，再选择共享会话存储或可验证的身份令牌。

## 7. 第一版验收与实现顺序

1. 对齐 Controller North proto 和 HTTP DTO，生成公开客户端，记录接口版本。
2. 启动独立 Go Gateway，接入 admin/viewer 认证和真实 Controller 查询。
3. 构建 Vben Element Plus 应用，完成节点、Desired、候选、任务和拓扑页面。
4. 完成候选编辑、计划预览、显式提交，以及可恢复的任务查询/SSE。
5. 验证整体请求经过 Web -> Gateway -> Controller -> Agent，不使用页面假结果替代链路。

| 验收项 | 预期结果 |
| --- | --- |
| 独立构建 | UI 和 Go Gateway 分别构建，Controller 无 Web 源码依赖 |
| 身份权限 | 无 token 401；viewer 修改 403；Controller 直接调用也验证权限 |
| 真实查询 | 节点、配置、任务和拓扑来自 Controller；错误和过期状态可见 |
| 正常提交 | 候选 -> 计划 -> 202 job_id -> 最终任务；各节点状态可追踪 |
| 并发冲突 | 两个旧版本提交不会静默覆盖，冲突明确返回 |
| 幂等 | 重复相同提交得到同一任务；同键不同内容被拒绝 |
| 订阅恢复 | SSE 分片/断线后按序号恢复，重复事件不重复应用 |
| 重启与超时 | Gateway 重启后可查询原任务；未知 Commit 结果按原键找回 |
| 数据规模 | 结果范围/分页可见；大量数据不要求一次加载全部表和全网拓扑 |
| 端到端 | 实验环境真实下发并核对配置、EVPN 观测及转发结果；配置成功与连通性分别记录 |

实现完成后，在测试记录中分别注明单元、契约、浏览器和真实实验测试结果。未执行的测试明确标注，不把设计验收表当作已经通过的结论。

## 8. 对接资料

- [Controller 设计](../sdn-controller/agent.md)：资源、计划、任务和全局状态语义。
- [Agent 设计](../sdn-agent/agent.md)：本节点事务、回滚、观测及恢复边界。
- [Agent Protobuf](../sdn-agent/api/agent/v1/agent.proto)：当前节点接入及执行协议。
- [Vben 权限机制](https://doc.vben.pro/guide/in-depth/access.html)：用于前端展示控制，实际权限由服务端验证。
- [gRPC-Gateway](https://grpc-ecosystem.github.io/grpc-gateway/)：后续可用来生成 HTTP/gRPC 映射；首版允许明确的手写薄适配层，SSE 仍需专门处理。

## 9. 当前实现与基础验证

| 实际模块 | 代码 |
| --- | --- |
| Gateway 进程、TLS、关闭流程 | [main.go](gateway/cmd/sdn-web-gateway/main.go) |
| 公开 Controller gRPC 客户端 | [client.go](gateway/internal/controllerclient/client.go) |
| HTTP 适配、auth、并发、错误映射、SSE | [server.go](gateway/internal/httpapi/server.go) |
| Gateway 契约与断连测试 | [server_test.go](gateway/internal/httpapi/server_test.go) |
| Vben 启动、布局和菜单 | [bootstrap.ts](ui/apps/web-ele/src/bootstrap.ts)、[layout.vue](ui/apps/web-ele/src/layout.vue)、[router.ts](ui/apps/web-ele/src/router.ts) |
| HTTP/SSE 客户端 | [api.ts](ui/apps/web-ele/src/api.ts)、[sse.ts](ui/apps/web-ele/src/sse.ts) |
| 节点、纳管 | [nodes.vue](ui/apps/web-ele/src/views/nodes.vue) |
| 资源配置展示 | [desired.vue](ui/apps/web-ele/src/views/desired.vue) |
| 候选/计划/幂等提交 | [changes.vue](ui/apps/web-ele/src/views/changes.vue) |
| 任务与节点进度 | [jobs.vue](ui/apps/web-ele/src/views/jobs.vue) |
| G6 与 EVPN 视图 | [topology.vue](ui/apps/web-ele/src/views/topology.vue) |

首版 Gateway 将鉴权、HTTP handler 和事件 writer 合并在同一个小型 `httpapi` 包；
没有为图中的每个逻辑组件额外建立微服务。SSE 缓冲为一个事件，慢连接有写入超时，
断开后取消上游；事件到达时前端对任务详情查询进行 250ms 合并，最多一个合并刷新在途。
Gateway 只转发公开 API，前端只访问 HTTP 接口。准确信息见 [HTTP 契约](docs/http-api.md)。

Vben 上游固定为 v5.7.0 / `63a38dce49ba109f61607994e21ba921d8e970e9`，
实际复用了其 BasicLayout、偏好、菜单、状态、样式与构建包；保留 MIT 许可。
其他 UI 应用和演示页面已移除。凭据保存在独立内存变量中，不使用 Vben 的持久 token。

2026-10-25 基础验证：Gateway 7 个测试及 race、go vet、二进制构建通过；
UI 7 个协议/恢复辅助测试、vue-tsc、生产构建通过。实际 Chromium 在隔离空 Controller
上完成登录及五个业务页面访问，无 pageerror；检查 localStorage/sessionStorage 未含 token。
这只证明基础接口和渲染可用，不代表已通过真实 EVPN 下发或规模测试。

当前候选编辑同时支持独立资源表单和完整资源 JSON；OIDC、细粒度租户权限、历史指标、
多副本压力验证尚未实现。拓扑统计只展示后端返回值，无模拟主机或流量数据。

## 2026-10-25 独立资源工作台

资源模型与 Controller 的 `Configuration.nodeResources` 对齐，每个节点持久化
`objects: Operation[]` 和 `bridgePolicies`。前端使用 `resources.ts` 的字段描述生成表单，
传输强类型 Protobuf JSON；后端计算自然键、资源依赖与差异。可选字段留空不发送，
显式 `false` 与 `0` 保留。不会由浏览器拼接 vtysh、ip 或 shell 命令。

```text
租户与网络 / Agent 资源工作台
  ├─ 节点选择与能力检查（viewer 仅查看）
  ├─ 配置目标 / 候选资源
  │    ├─ VRF → BD → 成员与三层地址关系树
  │    ├─ 租户与网络 / 二层网络 BD / 接口
  │    ├─ 隧道 → VXLAN
  │    ├─ 路由 → BGP（含 EVPN）/ OSPF
  │    └─ 共享候选：创建 → 多次局部编辑 → 预览 → 提交
  └─ 实际运行状态查询：来源 / 时间 / revision / stale / error
             │ HTTP + Protobuf JSON
          Go Gateway（鉴权、参数与节点ID检查、并发限制）
             │ North gRPC
          Controller
             ├─ Desired / Candidate / Plan / Job
             └─ QueryNode → Agent Query → Linux / FRR
```

```text
用户      Vue 表单       Gateway       Controller       Agent
 | 新建候选 |              |               |              |
 |--------->| BeginChange ---------------->|              |
 | 编辑 VRF |              |               |              |
 |--------->| EditNodeResources ---------->| 保存候选      |
 | 编辑 BD  |              |               |              |
 |--------->| EditNodeResources ---------->| 校验草稿版本  |
 | 预览     | PlanChange ----------------->| 依赖与能力检查|
 | 确认提交 | CommitChange（固定幂等键）--->| 持久化 Job    |
 |          |<--------- Job ID ------------| 事务执行 ---->|
 |          | Job / SSE ------------------>|<--- 验证结果 --|
 | 查询运行 | QueryNode ------------------>| Query -------->|
 |          |<------- records + source + time + stale/error |
```

Web 与 CLI 共享同一候选模型，不直接向 Agent 写入。旧声明式节点或未管理的 Running
需要显式 Import，通过版本与读回验证后转换成独立资源基线。空且已接管节点可直接编辑。
切换 Agent 后丢弃旧表单输入、旧查询和已预览计划；候选仍可包含多个节点，但每个
编辑请求固定携带原节点路径与当前 editRevision，防止异步回复污染另一节点。

ARP/ND 抑制持久保存为 BD 策略，由 Controller 投影到当前及未来的 VXLAN 成员。
它不是主动探测或 MAC 保活。FDB/邻居/接口/路由/BGP/EVPN/OSPF 查询与配置目标分开展示；
未知对象、适配器失败和不支持的筛选保留错误，不伪造空表。

2026-10-27：配置工作台按职责拆分。接口条目只管理 `INTERFACE` / `ADDRESS`，
地址不再在 BD 表单重复编辑；路由条目统一容纳 BGP 与 OSPF 子条目，EVPN 配置和查询归入 BGP，
工作台不开放静态路由入口，也不在接口分类混入 ROUTES/FIB 查询。
新增独立的隧道条目，目前只开放 VXLAN，负责隧道创建/删除和状态查询；
BD 成员关系统一归二层网络 BD。`resources.ts` 的分类定义控制表单、资源列表及查询范围，
未知资源不再默认落入接口分类。切换分类保留已保存的共享候选，重置未保存表单及查询状态；
仍由 Controller 统一生成计划并处理资源依赖。

新增实现：`views/resource-workspace.vue`、`views/resource-query.vue`、`resources.ts`，
Gateway 资源契约测试 `resources_test.go` 与 UI 资源单测 `resources.test.ts`。
真实表单验收脚本为 `tests/e2e/resources.cjs`，要求显式指定隔离环境和凭据文件。
基础单测、race、vet、typecheck 和 build 通过；整网与浏览器结果以最终联调报告为准。

默认 Docker 部署是 Controller + Web + 三个 Agent，共 5 个容器。Web 容器运行
Nginx 与 Gateway 两个独立进程；保留独立 `ui` / `gateway` 镜像 targets，
需要测试主机时通过 `lab` profile 加入两台 PC，共 7 个容器。

独立资源最终验证：Gateway 10 项/race/vet、UI 13 项、类型与生产构建通过；
生产 UI 的模拟契约 Chromium 8 项通过，真实隔离 Linux/FRR 浏览器 7 项通过。
后者分三笔提交空 VRF、后续 BD/地址、L3VNI，验证查询错误和 viewer，0 pageerror。
数字控件从禁用变启用的 ARIA 状态已修复并加入浏览器回归。
报告见 [独立资源验证](docs/resource-validation.md)。

## VPP 邻居保活界面

“二层网络 BD”新增节点邻居保活开关及运行状态查询。按 neighbor-keepalive/v1
和 Agent 操作能力显示，仅 VPP 支持。开关仍先加入候选，预览/提交后生效；
明确 false 必须保留。查询显示每 IP 的状态、尝试次数、最近确认时间、下一次探测，
并显示节点发送错误与容量计数。查询来自 VPP，候选配置不能冒充已生效状态。
