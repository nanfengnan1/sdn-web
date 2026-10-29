# sdn-web

资源工作台的“隧道 / VXLAN”支持 VPP 外层 VRF 创建字段、修改操作和运行查询列。表 ID 0 表示默认承载表，与租户 VRF 独立；入口按节点能力显示。详见 [VXLAN 外层 VRF 配置](docs/user/resources.rst)。

`sdn-web` 是面向网络操作者的 **SDN 管理控制台**：用 Vue/Vben/Element Plus 提供节点、网络资源、配置候选、执行任务和拓扑界面，用 Go Gateway 把浏览器 HTTP/SSE 请求转换为 Controller 的公开 `sdn.controller.v1.North` gRPC 调用。

项目负责用户交互、认证复核和协议适配。Controller 负责期望配置、规划、任务与持久化，Agent 通过可扩展适配器管理本地 Linux/FRR；Web 不直接操作 Agent、执行网络命令或访问 etcd。设计、状态归属和请求时序见[架构说明](docs/developer/architecture.rst)。

**nodeId 用在网络配置中：** `nodes[].nodeId`、租户和网络的 `placements[].nodeId` 都引用注册并纳管后的节点 UUID；不能用容器名或 VTEP IP 代替。`docker/state/evpn.json` 已由 Controller 部署脚本填入当前 UUID。Web/Gateway 启动只配置服务地址与认证，不需要 nodeId。详见 [配置说明](docs/user/configuration.rst)。

当前 Compose 将 etcd 集成在 Controller 容器，将 Redis/FRR 集成在每个 Agent 容器；数据库不是独立容器。Controller 与 Agent 从宿主机只读挂载各自 `.conf` 文件启动，Web 容器运行 Nginx/Gateway 两个进程，见 [Docker 部署](docs/user/docker-deploy.rst)。

从这里开始：[源码编译、安装与部署](docs/user/source-install.rst) · [Docker 源码镜像部署](docs/user/docker-deploy.rst) · [发布、升级与回滚](docs/user/release.rst)。包含依赖安装、构建产物、安装目录、启动/停止、版本打包和成功检查。
维护者制作含三个 Web 镜像和文档的 `.tar.xz`、推送 Git tag、发布 GitHub Release 和补传附件，见[开发发布流程](docs/developer/release.rst)。

完整文档：[用户手册源码](docs/user/index.rst) · [开发手册源码](docs/developer/index.rst) · [文档构建说明](docs/README.md)。`make -C docs help` 无需 Sphinx 即可查看帮助；`make -C docs html` 生成 `docs/html/index.html`，`make -C docs clean` 只清理文档。应用构建使用下面的 `make build`，当前没有 `make install` 或 `make release`。

源码 Alpine 镜像见 [docker/README.md](docker/README.md)。`docker/Dockerfile` 默认使用 `web` target，将 Nginx 与 Gateway 两个进程放入一个容器；也保留独立 `gateway`、`ui` targets。默认 Compose 是 Controller、Web、三个 Agent 共 5 个容器，`lab-up` 加入两台 PC 共 7 个。Web 入口为 28080。

- [架构设计](docs/developer/architecture.rst)：分层、状态归属、缓存与重启、请求响应时序。
- [HTTP API](docs/developer/http-api.rst)：请求、权限、资源查询、提交与 SSE 语义。
- [扩展开发](docs/developer/extensions.rst)：新增页面、资源表单、查询和写接口的源码入口、流程与测试。
- [测试说明](docs/developer/testing.rst)：自动检查、浏览器入口和历史验收边界。
- [上游记录](ui/UPSTREAM.md)：Vben v5.7.0 来源、修改范围和 MIT 许可。

## 构建

与 `sdn-controller`、`sdn-agent` 放在同一父目录。Go 模块通过相邻目录 `replace`
引用公开 API；发布独立 SDK 后可去掉这些开发映射，Gateway 不依赖其他项目 internal 包。

工具链：Go 1.25+，pnpm 10.33.4；Node 的 `package.json` 约束为 `^22.18.0 || ^24.0.0`，已有验证记录使用 24.14.0。运行端使用构建好的 Gateway 和 UI，无需安装 Go、Node 或 pnpm。

```sh
cd ~/program/github/sdn-web/ui
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
cd ../gateway
go test -race ./...
go vet ./...
CGO_ENABLED=0 go build -o ../bin/sdn-web-gateway ./cmd/sdn-web-gateway
```

Gateway 发布二进制使用 `CGO_ENABLED=0` 静态构建，可在 FRR Alpine 实验容器中运行；
`go test -race` 仍在具备 C 编译器的 Linux 宿主机运行，不关闭测试所需的 CGO。

工具应安装到本机正常 PATH，不使用其他开发机的私有缓存目录。可以先安装并确认 pnpm 版本：

```sh
npm install --global pnpm@10.33.4
go version
node --version
pnpm --version
cd ~/program/github/sdn-web
make test
make build
```

## 启动

先按照 Controller README 启动 Controller，管理员/只读 token 在两端保持一致，
Agent token 使用另外的值。token 从环境传入，禁止放入 Vue 配置或构建产物。

```sh
cd ~/program/github/sdn-web
export SDN_ADMIN_TOKEN='<与 Controller 一致的至少 16 字节管理员 token>'
export SDN_VIEWER_TOKEN='<与 Controller 一致且不同的只读 token>'
./bin/sdn-web-gateway \
  -listen 127.0.0.1:18080 \
  -controller 127.0.0.1:19090 \
  -static-dir ./ui/apps/web-ele/dist \
  -insecure
```

浏览器访问 `http://127.0.0.1:18080`，输入对应 token。`-insecure` 只用于隔离实验；
远程实验访问可显式绑定 `0.0.0.0:18080`。token 仅存在页面内存中，刷新后重新输入。
候选 ID、提交幂等键等非敏感恢复信息保存在当前浏览器标签页的 sessionStorage。

正式部署配置 `-tls-cert/-tls-key/-controller-ca`；UI 可以单独托管，修改
`dist/config.js` 的 `apiBase` 指向 Gateway `/api/v1`，并在 Gateway 设置
`-allowed-origins https://console.example.net`。也可以统一域名反向代理，示例在
[deploy/nginx.conf.example](deploy/nginx.conf.example)。前端与 Gateway 分开构建，
托管静态文件只是可选部署方式，不将 Web 编译进 Controller。

开发时在 `ui` 执行 `pnpm dev:ele`，15173 的 Vite 服务将 `/api` 转发至本机
18080 Gateway；Gateway 需增加 `-allowed-origins http://localhost:15173,http://127.0.0.1:15173`，
具体三个终端的启动步骤见[开发环境](docs/developer/development.rst)。运行时业务接口不使用 Vben mock backend。

## 首版范围

已实现节点清单/详情/纳管、期望租户网络、完整资源候选编辑/预览/提交、任务
查询/SSE 与 G6 拓扑/EVPN 表。管理员和只读访问均由 Gateway 和 Controller 复核。
配置成功只代表 Agent 事务成功，网络收敛和主机连通性需单独验证。

“租户与网络”新增按 Agent 的独立资源表单、租户/BD/三层接口关系树和实时查询，使用候选→预览→提交→Job 流程；完整 JSON 作为高级入口保留。操作说明见 [资源用户手册](docs/user/resources.rst)。OIDC、细粒度
租户 RBAC、历史指标、自动补偿 UI 和 Controller HA 未在此首版实现。
前端大图采用指定节点范围查询；未声称具备任意规模的全网图渲染容量。

## 历史联调记录

既有记录报告了真实 Controller/Agent/Linux/FRR 端到端验收：11 个源码阶段、17 项网络/API 检查、10 项浏览器检查。详见 [验收记录](docs/validation.md) 和 [浏览器复现方法](tests/e2e/README.md)。该记录对应旧 `sdnc-it-*` 实验的 `18080` 入口及 `lab/state/tokens.json`，不能直接作为当前源码重新验收的结果。

源码 Alpine 镜像的独立环境使用 `http://<部署服务器IP>:28080`，占位符替换为浏览器可访问的实际服务器地址。凭据在部署主机 Controller 项目的 `docker/state/tokens.json`，使用其中 `admin` 或 `viewer` 登录。见 [Docker 历史验收记录](docs/docker-validation.md) 和 [用户手册](docs/user/index.rst)。不同部署版本与资源工作台的验证范围见[测试与验收](docs/developer/testing.rst)，本次文档构建不代表重跑真实网络验收。验收报告中的具体 IP 属于历史测试证据，实际令牌不写入前端构建或文档。


### Snort IPS

支持带 ``snort-ips/v1`` 能力的 Agent：规则按 SID 管理，
通过候选和事务创建/修改/删除；支持 VPP 三层接口/BVI 的检查方向绑定。
Web 提供独立 **IPS 配置** 菜单和实际加载状态查询。
Agent 使用已有 Redis + confd 校验并热重载 Snort3。
三个项目需同步更新协议后构建，启用方式见 sdn-agent 的 ``docs/user/ips.rst``。
