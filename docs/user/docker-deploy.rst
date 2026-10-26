.. _web-docker-deploy:

从源码制作镜像并部署 Docker 环境
========================================

本方式使用项目 Dockerfile 和 Controller 的 Compose，不要求宿主机安装 Go / Node / pnpm；
镜像构建阶段下载工具链和锁定依赖。

.. contents:: 操作步骤
   :local:
   :depth: 2

1. 准备主机和源码
----------------------------------------

需要 Linux rootful Docker、支持 BuildKit 指令的构建器、Docker Compose 插件、Python 3，
以及当前用户访问 Docker 的权限。完整实验需要容器网络管理权限，不适用于普通 rootless 接线。

.. code-block:: bash

   docker version
   docker compose version
   python3 --version

将三个项目源码放在同一父目录：

.. code-block:: text

   ~/program/github/
   ├── sdn-agent/docker/Dockerfile
   ├── sdn-controller/docker/compose.yaml
   └── sdn-web/docker/Dockerfile

构建需要访问镜像仓库、Go 模块源、npm 和 Alpine 包源，或对应内部镜像。
下文目录可整体替换为实际源码位置。

2. 制作 Web 镜像
----------------------------------------

在三个项目的共同父目录执行：

.. code-block:: bash

   cd ~/program/github
   docker build -f sdn-web/docker/Dockerfile \
     --target web -t sdn-web:alpine .

默认 ``web`` target 将 Nginx 与 Gateway 作为两个进程放入一个容器，代码和接口仍独立。
需要前后端分离部署时，可继续构建两个独立 target：

.. code-block:: bash

   docker build -f sdn-web/docker/Dockerfile \
     --target gateway -t sdn-web-gateway:alpine .
   docker build -f sdn-web/docker/Dockerfile \
     --target ui -t sdn-web-ui:alpine .

gateway target 从 Go 源码构建并以 Alpine 非 root 用户运行。
ui target 使用 Node 24 / pnpm 10.33.4 安装锁定依赖、执行单测和类型检查、构建前端，
最终由 Alpine/Nginx 非 root 用户托管。

合并 ``web`` 容器的 Nginx 监听 8080，API 转发到同容器的 ``127.0.0.1:18080``。
单独 ``ui`` target 的默认上游仍为 ``gateway:18080``，可通过部署配置覆盖。
构建上下文需要相邻公共协议项目；ignore 规则排除已有二进制、node_modules、dist 和真实凭据。

.. code-block:: bash

   docker image inspect sdn-web-gateway:alpine --format '{{.Id}}'
   docker image inspect sdn-web-ui:alpine --format '{{.Id}}'

只构建镜像不会启动服务。下面使用完整 Compose 启动相关组件。

3. 初始化并启动完整环境
----------------------------------------

在部署主机的 Controller 源码目录执行：

.. code-block:: bash

   cd ~/program/github/sdn-controller
   python3 docker/manage.py init

init 生成 docker/.env、docker/state/tokens.json，以及缺失的外部启动配置文件，已有凭据与自定义配置保持不变。
启动前可编辑环境文件的下列非敏感字段，保留其他令牌字段：

.. code-block:: text

   SDN_WEB_BIND=0.0.0.0
   SDN_WEB_PORT=28080
   SDN_GRPC_PORT=29090

0.0.0.0 表示监听所有 IPv4 地址，不是浏览器地址。当前 manage.py 使用
127.0.0.1 做就绪探测，因此保留 0.0.0.0；仅本机访问时可以设为 127.0.0.1。
不要直接改成仅绑定某个外部接口 IP，否则脚本的本机探测可能失败。
浏览器使用 ``http://<部署服务器IP>:28080``，服务器网络策略需允许该端口。

.. code-block:: bash

   python3 docker/manage.py build
   python3 docker/manage.py up
   python3 docker/manage.py status

build 编译 Agent、Controller、UI 和 Gateway；每个 Agent 镜像内安装 FRR 与 Redis，
Controller 镜像内安装 etcd。Redis / etcd 不再是单独的 Compose 服务。
up 默认启动 5 个容器：Controller、Web、Spine、Leaf1、Leaf2。
Web 内包含 Nginx 与 Gateway 两个进程；节点各自包含 Agent、FRR、Redis。
脚本创建专用卷和 Spine 到两个 Leaf 的连线，等待三个 Agent 注册，
生成含本轮真实 UUID 的 docker/state/evpn.json。首次使用空卷时得到空白环境；已有卷保持原管理数据，
up 不自动纳管或下发新的业务配置。

.. code-block:: text

   浏览器 -> Web 容器           -> Controller 容器
             Nginx + Gateway      sdn-controller + etcd
                                 |
                    +------------+-------------+
                    |            |             |
                Spine 容器   Leaf1 容器     Leaf2 容器
                Agent+FRR    Agent+FRR      Agent+FRR
                +Redis      +Redis         +Redis
                    |            |             |
                    +----- 实验业务网络 --------+

需要 PC1/PC2 验证跨网段 EVPN 数据通信时，显式启动 ``lab`` profile：

.. code-block:: bash

   python3 docker/manage.py lab-up
   # 完成主机测试后停止两台 PC，保留五个核心容器：
   python3 docker/manage.py lab-stop

``lab-up`` 共启动 7 个容器，并增加两条 Leaf 到 PC 的连线。

在宿主机编辑以下文件，Compose 以只读 bind mount 加载；修改后重启对应容器才生效：

.. list-table:: 外部配置覆盖
   :header-rows: 1
   :widths: 50 50

   * - Controller 项目下的宿主文件
     - 容器路径
   * - docker/state/config/controller/controller.conf
     - Controller 的 /etc/sdn-controller/controller.conf
   * - docker/state/config/spine/agent.conf
     - Spine 的 /etc/sdn-agent/agent.conf
   * - docker/state/config/leaf1/agent.conf
     - Leaf1 的 /etc/sdn-agent/agent.conf
   * - docker/state/config/leaf2/agent.conf
     - Leaf2 的 /etc/sdn-agent/agent.conf

扩展名为 .conf，内容是严格 JSON。controller.conf 包含 controller 与 etcd 两节，
agent.conf 包含 agent 与 redis 两节。未知字段和错误类型会阻止启动。
镜像默认配置不含真实令牌；Compose 继续从 docker/.env 提供凭据环境变量。
配置项定义见相邻 Controller / Agent 项目的配置手册。

启动配置没有需要手工分配的 nodeId：Agent 身份在首次启动/注册后持久保存，
Web 提交的租户网络 JSON 才引用这些 UUID，见 :doc:`configuration`。

脚本固定管理 sdn-docker 项目。若已有同名环境，先确认用途和状态，
不要为安装教程清空正在使用的环境。

4. 检查并登录
----------------------------------------

.. code-block:: bash

   cd ~/program/github/sdn-controller
   docker compose --project-name sdn-docker --env-file docker/.env \
     -f docker/compose.yaml ps
   docker compose --project-name sdn-docker --env-file docker/.env \
     -f docker/compose.yaml logs --tail 50 web
   python3 docker/manage.py bundled-check
   curl -fsS http://127.0.0.1:28080/healthz

修改过 SDN_WEB_PORT 时，curl 使用对应端口；保持上述可从 127.0.0.1 探测的绑定方式。
这里经 28080 访问的 healthz 仅检查前端 Nginx。Docker 镜像的联合健康检查还会检查
同容器 Gateway 的 healthz，但两者都不能证明 Controller 可用；登录后查询节点或
带认证的 /api/v1/desired 才能验证上游查询链路。

浏览器访问 ``http://<部署服务器IP>:28080``，
使用部署主机 sdn-controller/docker/state/tokens.json 中的 admin 或 viewer 字段值登录。
不要输入整个 JSON，也不要使用 agent 字段登录 Web。
能显示三个 RUNNING 待纳管节点说明查询链路可用；随后按 :doc:`quickstart` 配置业务。

.. list-table:: 地址对照
   :header-rows: 1

   * - 组件
     - Compose 网络内
     - 宿主机 / 浏览器
   * - UI
     - web:8080
     - ``http://<部署服务器IP>:28080``
   * - Gateway
     - 合并 Web 容器内的 127.0.0.1:18080
     - 默认不单独发布
   * - Controller
     - controller:19090
     - 宿主机本地 127.0.0.1:29090
   * - Agent
     - spine:9090、leaf1:9090、leaf2:9090
     - 默认不单独发布
   * - 各 Agent 的 Redis
     - 各自容器内 127.0.0.1:6379
     - 不存在独立 Redis 容器，不发布端口
   * - Controller 的 etcd
     - Controller 容器内 127.0.0.1:2379
     - 不存在独立 etcd 容器，不发布端口

默认 Nginx 保留外部 Host 端口，关闭 API 响应缓冲以支持 SSE；
自定义代理配置时要保留这些行为。
Web 容器（或分离部署的 UI 容器）的运行时配置路径为 ``/usr/share/nginx/html/config.js``，
需要替换时可挂载自己的只读配置文件。

5. 停止和重新启动 Web
----------------------------------------

只停止本项目 Web 容器（其中包含 UI 与 Gateway）：

.. code-block:: bash

   cd ~/program/github/sdn-controller
   docker compose --project-name sdn-docker --env-file docker/.env \
     -f docker/compose.yaml stop web

重新启动该 Web 容器：

.. code-block:: bash

   docker compose --project-name sdn-docker --env-file docker/.env \
     -f docker/compose.yaml start web

Gateway 没有业务数据库，重启后仍可查 Controller 原 Job。
关闭浏览器或停止 Web 不会取消已受理任务。

全套状态分别保存在 Controller 内置 etcd、各 Agent 内置 Redis、身份卷和 FRR 配置卷。
进程在同一容器中运行，但数据库文件仍挂载持久卷；容器删除不等于数据库已备份。
重建节点网络命名空间可能丢失 Linux 接口，不能把它与仅重启 Web 混为一谈。
当前没有完整的 Linux 网络自动重建器。

只有明确要清空实验时才执行 Controller 的 ``python3 docker/manage.py reset``。
它重建本项目容器和数据卷，节点 UUID 会变化，须使用新生成的 evpn.json。
``make -C docs clean`` 只删除文档 HTML，不会重置实验。

其他部署方式
----------------------------------------

分离 UI target 默认代理 gateway:18080；把 UI 移到另一主机时，此容器 DNS 可能无法解析。
应提供符合实际地址的 Nginx 配置，或通过运行时 config.js 指向独立 API。
跨域允许来源和 TLS 终止设置见 :doc:`source-install`。

当前 Compose 明确使用隔离明文模式，不能只把浏览器 URL 改为 https 就获得 TLS。
镜像版本交付、Web 单服务升级和回滚见 :doc:`release`。
