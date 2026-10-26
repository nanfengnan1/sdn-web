.. _web-source-install:

源码编译、安装与部署
========================================

本页按“准备工具 → 安装依赖 → 编译 → 安装文件 → 启动 → 验证”说明完整流程。
示例系统为 Linux，Vue 前端由 Nginx 托管，Go Gateway 作为另一个独立进程运行。
开发热更新见 :doc:`/developer/development`；版本包、镜像交付与升级回滚见 :doc:`release`。

.. contents:: 操作步骤
   :local:
   :depth: 2

1. 准备源码和工具
----------------------------------------

把三个项目放在自己选择的同一父目录；下文的 ``~/program/github`` 可整体替换：

.. code-block:: text

   ~/program/github/
   ├── sdn-agent/        公开 Agent Protobuf
   ├── sdn-controller/   公开 Controller Protobuf
   └── sdn-web/
       ├── gateway/     Go 模块
       └── ui/          Vue / pnpm 工作区

Gateway 的 go.mod 使用相对 replace 引用相邻项目的公开 API。只复制 sdn-web 会找不到依赖。
生成的 Protobuf Go 文件已包含在源码中，普通构建无需 protoc，也不要求先运行 Agent。

.. list-table:: 工具要求
   :header-rows: 1
   :widths: 25 75

   * - 工具
     - 要求
   * - Go
     - 1.25 或更高，用于 Gateway 构建
   * - Node.js
     - 本项目验证版本 24.14.0；package.json 允许 22.18+ 的 22 系列或 24 系列
   * - pnpm
     - 10.33.4，与 packageManager、Docker 构建一致
   * - GNU Make、curl、CA 证书
     - 构建目标和部署检查所需
   * - Nginx
     - 用于分离部署前端；Gateway 临时托管方式不需要
   * - C 编译器
     - Go race 测试需要；发布二进制采用 CGO_ENABLED=0

先用适合本机平台的安装包准备 Go 和 Node。Debian / Ubuntu 可以安装辅助工具：

.. code-block:: bash

   sudo apt-get update
   sudo apt-get install -y ca-certificates curl make nginx
   npm install --global pnpm@10.33.4
   go version
   node --version
   pnpm --version
   make --version

npm 全局目录应对当前安装用户可写，或按本机 Node 安装方式授予安装权限。
不要引用其他开发机的私有缓存路径。依赖安装需要访问 Go / npm 包源，
或使用部署方提供的兼容内部镜像。

2. 下载依赖并编译
----------------------------------------

在 Linux 构建机执行：

.. code-block:: bash

   cd ~/program/github/sdn-web/gateway
   go mod download
   cd ../ui
   pnpm install --frozen-lockfile
   cd ..
   make build

make build 等价于分别编译 Gateway 和生产前端：

.. code-block:: bash

   cd ~/program/github/sdn-web/gateway
   CGO_ENABLED=0 go build -o ../bin/sdn-web-gateway ./cmd/sdn-web-gateway
   cd ../ui
   pnpm build

.. list-table:: 构建产物
   :header-rows: 1

   * - 路径
     - 内容
   * - ``bin/sdn-web-gateway``
     - Go 可执行文件，默认使用构建机系统和架构
   * - ``ui/apps/web-ele/dist/``
     - 全部静态文件，包括 index.html、config.js、assets/
   * - ``ui/apps/web-ele/dist/config.js``
     - 部署时 API 地址；源文件在 ui/apps/web-ele/public/config.js

.. code-block:: bash

   cd ~/program/github/sdn-web
   test -x bin/sdn-web-gateway
   test -f ui/apps/web-ele/dist/index.html
   test -f ui/apps/web-ele/dist/config.js
   bin/sdn-web-gateway -h

不能只发布 index.html。部署机系统和 CPU 架构须与 Gateway 匹配；
跨架构构建要显式设置对应 GOOS / GOARCH，并验证目标平台。

3. 安装文件
----------------------------------------

将产物复制到部署服务器后执行安装。以下按同机构建的路径展示：

.. code-block:: bash

   cd ~/program/github/sdn-web
   sudo install -d -m 0755 /opt/sdn-web/ui /etc/sdn-web
   sudo install -m 0755 bin/sdn-web-gateway /usr/local/bin/sdn-web-gateway
   sudo cp -a ui/apps/web-ele/dist/. /opt/sdn-web/ui/

这是首次安装示例。更新时应准备完整新目录再切换，避免用户同时读取两个版本的资源。
运行服务器只需要 Gateway 二进制、静态资源和 Nginx，不再需要 Go / Node / pnpm / node_modules。

同源部署保持 ``/opt/sdn-web/ui/config.js`` 为：

.. code-block:: javascript

   window.__SDN_CONFIG__ = { apiBase: '/api/v1' };

浏览器使用当前页面域名访问 API，由 Nginx 转发。此文件不能放令牌。
重新构建会从 public/config.js 生成新文件，发布时应重新应用部署配置。
当前入口按域名根路径部署；只改 apiBase 不会改变 index.html 中 /config.js、/sdn.svg
等静态引用，子路径部署需另行调整并验证 Vite 和代理配置。

4. 配置并启动 Gateway
----------------------------------------

先按 Controller 手册启动服务。以下假设 Controller 在同机监听 127.0.0.1:19090。
分机时改成 ``<Controller管理IP>:19090``；对接同机 Docker Controller 时用 127.0.0.1:29090。

Gateway 和 Controller 必须使用相同、至少 16 字节的 admin 令牌。启用 viewer 时，其值也必须一致，
与 admin 不同且至少 16 字节。不要为 Gateway 单独生成不匹配的令牌。

这里配置 Web / Gateway 的启动参数，不需要填写 nodeId。
nodeId 是 Web 后续提交网络配置时引用的 Agent 注册 UUID，见 :doc:`configuration`。

在部署服务器的专用终端执行：

.. code-block:: bash

   export SDN_ADMIN_TOKEN='<与Controller相同的管理员令牌>'
   export SDN_VIEWER_TOKEN='<与Controller相同的只读令牌>'
   /usr/local/bin/sdn-web-gateway \
     -listen 127.0.0.1:18080 \
     -controller 127.0.0.1:19090 \
     -insecure

未启用 viewer 时省略或清空该变量。-insecure 明确允许隔离实验的 HTTP/gRPC 明文。
看到 ``sdn-web-gateway listen=... controller=...`` 后保持该终端运行；程序不会自动后台化。
按 Ctrl+C 可停止，程序处理 SIGINT / SIGTERM。

另开终端检查：

.. code-block:: bash

   curl -fsS http://127.0.0.1:18080/healthz
   export SDN_ADMIN_TOKEN='<与Controller相同的管理员令牌>'
   curl -fsS -H "Authorization: Bearer $SDN_ADMIN_TOKEN" \
     http://127.0.0.1:18080/readyz

healthz 返回 ok 仅证明 Gateway 存活；readyz 返回 ready 才证明带认证的 Controller 查询成功。
readyz 失败时先核对 Controller 地址、令牌、网络和 TLS。

5. 启动独立 Nginx 前端
----------------------------------------

创建 ``/etc/nginx/conf.d/sdn-web.conf``。以下 server 放在 Nginx 的 http 上下文中；
常见发行版通过 conf.d 自动包含：

.. code-block:: nginx

   server {
       listen 8080;
       server_name _;
       root /opt/sdn-web/ui;
       index index.html;
       client_max_body_size 4m;

       location /api/ {
           proxy_pass http://127.0.0.1:18080;
           proxy_http_version 1.1;
           proxy_set_header Host $http_host;
           proxy_set_header Authorization $http_authorization;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header Connection "";
           proxy_buffering off;
           proxy_cache off;
           proxy_read_timeout 3600s;
       }
       location = /config.js {
           add_header Cache-Control "no-store";
           try_files $uri =404;
       }
       location / {
           try_files $uri $uri/ /index.html;
       }
   }

使用 systemd 的部署机执行：

.. code-block:: bash

   sudo nginx -t
   sudo systemctl enable --now nginx
   sudo systemctl reload nginx

浏览器访问 ``http://<部署服务器IP>:8080``。确保所选 Web 端口可达且未被其他服务占用，
不覆盖其他站点配置。Gateway 仍只监听本机 18080。

proxy_pass 保留 /api/v1 路径；Host 使用 $http_host 保留外部端口，
否则可能出现页面正常但提交返回 origin not allowed。
禁用响应缓存和缓冲以支持任务 SSE 长连接。

6. 验证并开始使用
----------------------------------------

在部署服务器执行：

.. code-block:: bash

   curl -fsS http://127.0.0.1:8080/config.js
   curl -fsS -H "Authorization: Bearer $SDN_ADMIN_TOKEN" \
     http://127.0.0.1:8080/api/v1/me
   curl -fsS -H "Authorization: Bearer $SDN_ADMIN_TOKEN" \
     http://127.0.0.1:8080/api/v1/nodes

应分别返回 API 配置、当前角色和节点列表。尚未注册 Agent 时节点列表可以为空。
浏览器用相同令牌登录，确认各页面和资源正常，再按 :doc:`quickstart` 配置网络。

临时验证不使用 Nginx时，可先停止上面的 Gateway，再用它托管独立构建的静态资源：

.. code-block:: bash

   /usr/local/bin/sdn-web-gateway \
     -listen 0.0.0.0:18080 \
     -controller 127.0.0.1:19090 \
     -static-dir /opt/sdn-web/ui \
     -insecure

此时浏览器访问 ``http://<部署服务器IP>:18080``。这是可选运行模式；
Nginx + API-only Gateway 仍是两个独立进程。

使用 systemd 启停 Gateway
----------------------------------------

完成前台验证后按 Ctrl+C 停止该进程，避免端口冲突。下例适用于 systemd Linux，
沿用同机隔离实验的明文地址，其他环境应替换 ExecStart 中的地址与 TLS 参数。

创建专用运行账号，存在时复用：

.. code-block:: bash

   id sdn-web >/dev/null 2>&1 || \
     sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin sdn-web

创建 ``/etc/sdn-web/gateway.env`` 并替换占位符：

.. code-block:: text

   SDN_ADMIN_TOKEN=<与Controller相同的管理员令牌>
   SDN_VIEWER_TOKEN=<与Controller相同的只读令牌>

.. code-block:: bash

   sudo chown root:root /etc/sdn-web/gateway.env
   sudo chmod 0600 /etc/sdn-web/gateway.env

创建 ``/etc/systemd/system/sdn-web-gateway.service``：

.. code-block:: ini

   [Unit]
   Description=SDN Web Gateway
   After=network-online.target
   Wants=network-online.target

   [Service]
   User=sdn-web
   Group=sdn-web
   EnvironmentFile=/etc/sdn-web/gateway.env
   ExecStart=/usr/local/bin/sdn-web-gateway -listen 127.0.0.1:18080 -controller 127.0.0.1:19090 -insecure
   Restart=on-failure
   RestartSec=3
   TimeoutStopSec=15

   [Install]
   WantedBy=multi-user.target

systemd 读取环境文件后传入进程。启动、看日志和停止：

.. code-block:: bash

   sudo systemctl daemon-reload
   sudo systemctl enable --now sdn-web-gateway
   sudo systemctl status sdn-web-gateway
   sudo journalctl -u sdn-web-gateway -n 50 --no-pager

需要停止时执行以下命令；重新启动使用 systemctl start：

.. code-block:: bash

   sudo systemctl stop sdn-web-gateway

停止 Gateway 不会取消 Controller 已受理的 Job。撤下前端时只移除本项目 Nginx server 配置，
检查后重载；不要停止承载其他站点的 Nginx 服务。

分机、跨域与 TLS
----------------------------------------

UI 和 API 使用不同域名时，修改实际发布目录的 config.js：

.. code-block:: javascript

   window.__SDN_CONFIG__ = {
     apiBase: 'https://api.example.net:18443/api/v1'
   };

Gateway 添加 ``-allowed-origins https://console.example.net``；
scheme、域名、端口必须与页面 Origin 一致，多个来源用逗号分隔。
以上域名是部署占位示例，不使用通配来源。

上述 API 地址与下面 Gateway 直接监听的 18443 端口一致。
只有另外配置了 443 反向代理时，才可从 API URL 中去掉端口。
console.example.net 表示已通过 HTTPS 托管前端的实际站点，不能把示例域名原样使用。

Gateway 自身启用 HTTPS、出站 Controller 使用 TLS：

.. code-block:: bash

   /usr/local/bin/sdn-web-gateway \
     -listen 0.0.0.0:18443 \
     -controller controller.example.net:19090 \
     -tls-cert /etc/sdn-web/server.crt \
     -tls-key /etc/sdn-web/server.key \
     -controller-ca /etc/sdn-web/controller-ca.pem \
     -allowed-origins https://console.example.net

本例仍需匹配 Controller 的令牌环境。证书 SAN 和信任链须覆盖实际连接地址。
若 Nginx 终止外部 HTTPS、内部 HTTP 代理到 Gateway，需允许对应 HTTPS Origin；
Gateway 不会只凭 X-Forwarded-Proto 认为请求使用 TLS。
内部 HTTP 模式要显式 -insecure，仍可同时指定 -controller-ca 让出站 gRPC 使用 TLS。

运行参数速查
----------------------------------------

.. list-table::
   :header-rows: 1

   * - 参数
     - 默认值
     - 用途
   * - -listen
     - 127.0.0.1:18080
     - HTTP / HTTPS 监听地址
   * - -controller
     - 127.0.0.1:19090
     - Controller gRPC endpoint
   * - -static-dir
     - 空
     - 可选前端目录，为空时只提供 API
   * - -max-requests / -max-streams
     - 各 64
     - 普通请求与 SSE 的独立并发上限
   * - -rpc-timeout
     - 30s
     - 普通 Controller RPC 超时

Gateway 无业务数据库；任务和配置由 Controller 保存。
Web 独立部署不代表 Controller 已支持多实例写入。
