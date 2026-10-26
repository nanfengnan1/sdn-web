# Alpine 源码镜像：默认合并部署，可选分离部署

同一个 Dockerfile 提供 `web`、`gateway`、`ui` 三个 target。默认 `web` 在一个容器运行 Nginx 与 Gateway 两个独立进程；也可以使用后两个 target 分离部署：

完整步骤见 [Docker 构建与部署手册](../docs/user/docker-deploy.rst)，不使用容器时见 [源码编译安装手册](../docs/user/source-install.rst)。版本标签、镜像分发与 Web 单服务升级见[发布指南](../docs/user/release.rst)。宿主机需 Linux rootful Docker、Docker Compose、Python 3；镜像构建阶段自行安装 Go/Node/pnpm。

```sh
cd ~/program/github
docker build -f sdn-web/docker/Dockerfile --target web -t sdn-web:alpine .
docker build -f sdn-web/docker/Dockerfile --target gateway -t sdn-web-gateway:alpine .
docker build -f sdn-web/docker/Dockerfile --target ui -t sdn-web-ui:alpine .
```

- `web`：默认镜像，非 root Nginx 用户运行两个进程，Gateway 仅监听容器内 127.0.0.1:18080，Nginx 对外监听 8080；联合健康检查，任一进程退出则停止整个容器。默认 Compose 使用显式 insecure 实验模式；Gateway 的监听地址由 bundle 固定，其他参数由 CMD/启动命令提供。
- `gateway`：容器内编译 Go Gateway，Alpine 运行，非 root 用户；不安装 FRR，不直接配置网络。
- `ui`：容器内通过 Node 24 + pnpm 10.33.4 安装锁定依赖，执行单测、类型检查和构建；Alpine + Nginx 非 root 用户托管 Vue 静态文件。
- 独立 UI target 监听 8080，`/api/` 代理到 `gateway:18080`；合并 target 则代理到 127.0.0.1:18080。两者都关闭代理缓冲、保留原 Host 端口及 SSE 长连接。独立部署可挂载自己的 nginx.conf 或修改 UI 运行时 config.js。
- 所有 token 在运行时提供，前端构建不会包含控制台 token；不复制本机 node_modules、dist、运行数据或测试产物。

构建上下文需要相邻 `sdn-controller`、`sdn-agent` 的公共 Protobuf 模块，因为当前 Go replace 使用相对目录。

构建镜像后，在部署主机启动完整环境：

```sh
cd ~/program/github/sdn-controller
python3 docker/manage.py init
python3 docker/manage.py build
python3 docker/manage.py up
python3 docker/manage.py status
python3 docker/manage.py bundled-check
```

完整 Compose 部署见 [Controller Docker 指南](../../sdn-controller/docker/README.md)。浏览器入口为 `http://<部署服务器IP>:28080`，替换占位符；可以在启动前调整 `docker/.env` 的 `SDN_WEB_PORT`。保留 `SDN_WEB_BIND=0.0.0.0` 以支持脚本的 127.0.0.1 就绪探测（只本机访问可使用 127.0.0.1），不要仅绑定某个外部接口 IP。`0.0.0.0` 是监听地址，不是浏览器访问地址。

默认环境常驻 5 个容器（Controller、Web、Spine、Leaf1、Leaf2）。`manage.py lab-up` 按需增加两个测试 PC，共 7 个。Controller 容器内运行 etcd，每个 Agent 容器内运行 Redis/FRR；不再创建独立 Redis 或 etcd 容器。`init` 只为缺失节点生成 `docker/state/config/controller/controller.conf` 和 `docker/state/config/{spine,leaf1,leaf2}/agent.conf`，已有配置保留。Compose 把这些严格 JSON 文件只读挂载进目标容器；修改后重启对应服务才生效。Web UI/Gateway 本身仍是独立进程，不直接访问这些数据库。

Web 启动地址配置不需要 nodeId。登录后配置租户网络时，`nodes[].nodeId` 和两类 `placements[].nodeId` 必须使用已注册/纳管节点的 UUID；`docker/state/evpn.json` 已自动填入，手写 JSON 不能省略。见 [业务配置说明](../docs/user/configuration.rst)。

使用部署主机 Controller 的 `docker/state/tokens.json` 中 admin 或 viewer 值登录。默认 Web 为 `web:8080`，Gateway 仅在同容器 127.0.0.1:18080，Controller 为 `controller:19090`；容器 DNS 不直接填写到外部浏览器。

只停止和重新启动 Web 两个进程，不停止 Agent：

```sh
docker compose --project-name sdn-docker --env-file docker/.env -f docker/compose.yaml stop web
docker compose --project-name sdn-docker --env-file docker/.env -f docker/compose.yaml start web
```

命令在 Controller 项目目录执行。整套环境 reset 会重建数据卷和节点身份；不应当作普通 Web 重启命令。
