发布、升级与回滚
========================================

本页说明如何交付已经验证的 Web 版本。首次编译、安装目录、Gateway 参数和 systemd
示例见 :doc:`source-install`，完整实验环境见 :doc:`docker-deploy`。
以下是手工发布流程；仓库没有 ``make install``、``make release`` 或自动上传发布系统。
示例版本 ``v0.1.0`` 仅供替换，不代表已有正式发布。

.. contents:: 发布流程
   :local:
   :depth: 2

依赖与交付边界
----------------------------------------

.. list-table:: 哪个阶段需要哪些依赖
   :header-rows: 1
   :widths: 24 44 32

   * - 阶段
     - 必需内容
     - 产物或依赖边界
   * - 源码构建
     - Go 1.25+；相邻 Controller/Agent 公开 API；Node 22.18+ 的 22 系列或 24 系列；pnpm 10.33.4
     - Gateway 二进制和完整 UI dist；版本约束以 go.mod/package.json 为准
   * - 自动测试
     - 构建依赖与 C 编译器（Go race）；浏览器测试另需 Chrome/Chromium 与 Playwright
     - 单测与组件模拟不能替代真实网络/浏览器验收
   * - 二进制运行
     - Linux 对应架构、CA/服务证书、Controller 地址与匹配的 admin/viewer 凭据
     - Nginx 托管 UI，或 Gateway 的可选 static-dir；运行端不需要 Go、Node 或 pnpm
   * - 镜像构建与运行
     - 构建端 Docker/BuildKit 和三个相邻源码目录；运行端 Docker，整套实验另需 Compose/Python
     - 默认 web target 包含 Nginx/Gateway；gateway 和 ui target 可分别发布
   * - 文档构建
     - Python 3.10+、docs/requirements.txt；Make 可选
     - 独立静态 HTML，运行 Web 不依赖 Sphinx
   * - 归档与校验
     - Bash、tar、sha256sum
     - 版本包、来源清单、校验文件

浏览器入口默认部署在域名根路径，``index.html`` 引用 ``/config.js`` 和 ``/sdn.svg``。
仅修改 config.js 的 apiBase 只改变 API 地址，不会把静态应用迁移到任意子路径；
子路径部署还需修改和验证 Vite base、静态引用、路由及代理配置。

发布前检查
----------------------------------------

1. 冻结同一套 Web、Controller、Agent 源码。正式交付优先记录三者 Git commit；
   若源码尚未初始化 Git，则记录三个可追溯源码归档的编号和 SHA-256。
   检查是否存在未纳入发布的本地修改，不能只记录 Web 版本而忽略相邻 Protobuf 依赖。
2. 安装源码依赖后执行下列检查。记录实际命令、工具版本、通过/跳过项和目标平台。
3. 在专用环境验证 UI/Gateway 与目标 Controller/Agent 版本的组合；
   涉及网络行为的变化按 :doc:`/developer/testing` 验收，不能拿历史报告代替当前结果。
4. 发布内容仅包含程序、静态文件、公开配置示例、文档和来源/许可说明。
   运行令牌、TLS 私钥、浏览器会话和实验数据库由部署方单独管理。

在已准备依赖的 Linux 构建机执行：

.. code-block:: bash

   cd ~/program/github/sdn-web
   make test
   make build
   make -C docs html

``make test`` 包含 Gateway race/vet 和 UI 单测/类型检查；``make build`` 不安装 pnpm
依赖，需先运行源码安装页中的 ``pnpm install --frozen-lockfile``。
文档构建需激活本项目文档虚拟环境，或指定 ``SPHINXBUILD``。
本页命令不包含真实实验的重置或网络下发。

制作二进制和静态资源包
----------------------------------------

以下 Bash 示例在 Linux 构建机执行，并明确生成本机 CPU 架构的 Linux 程序。
替换来源占位符后运行；本例不依赖目录已经初始化 Git，但必须提供可追溯来源。

.. code-block:: bash

   set -euo pipefail
   cd ~/program/github/sdn-web
   VERSION=v0.1.0
   SOURCE_REFERENCE='<填写三项目 commit 或源码归档编号与校验值>'
   [[ "$VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]
   [[ -n "$SOURCE_REFERENCE" && "$SOURCE_REFERENCE" != *'<'* ]]
   test "$(go env GOHOSTOS)" = linux
   TARGET_ARCH=$(go env GOHOSTARCH)
   PACKAGE="sdn-web-${VERSION}-linux-${TARGET_ARCH}"
   OUT="$PWD/artifacts/releases/$VERSION"
   test ! -e "$OUT"
   mkdir -p "$OUT/$PACKAGE/bin" "$OUT/$PACKAGE/ui" "$OUT/$PACKAGE/deploy"
   (
     cd gateway
     CGO_ENABLED=0 GOOS=linux GOARCH="$TARGET_ARCH" go build -trimpath \
       -o "$OUT/$PACKAGE/bin/sdn-web-gateway" ./cmd/sdn-web-gateway
   )
   test -f ui/apps/web-ele/dist/index.html
   test -f ui/apps/web-ele/dist/config.js
   cp -a ui/apps/web-ele/dist/. "$OUT/$PACKAGE/ui/"
   cp deploy/nginx.conf.example "$OUT/$PACKAGE/deploy/"
   cp README.md "$OUT/$PACKAGE/"
   cp ui/LICENSE "$OUT/$PACKAGE/LICENSE-VBEN"
   cp ui/UPSTREAM.md "$OUT/$PACKAGE/UPSTREAM-VBEN.md"
   "$OUT/$PACKAGE/bin/sdn-web-gateway" -h
   {
     printf 'version=%s\nsource=%s\nplatform=linux/%s\n' \
       "$VERSION" "$SOURCE_REFERENCE" "$TARGET_ARCH"
     go version
     node --version
     pnpm --version
   } > "$OUT/$PACKAGE/BUILD-INFO.txt"
   tar -C "$OUT" -czf "$OUT/$PACKAGE.tar.gz" "$PACKAGE"
   (cd "$OUT" && sha256sum "$PACKAGE.tar.gz" > "$PACKAGE.tar.gz.sha256")

此步骤使用前面 ``make build`` 生成的 UI；二者之间保持源码不变。
将实际验证报告与版本说明一并交付，并核对其他随包依赖的许可要求。
已有 OUT 时换用新版本目录或先人工审阅旧产物，避免覆盖已有版本证据。
交叉编译可显式选择其他 GOARCH，但不能在构建机直接运行异构二进制来证明兼容。

接收端先在保存 tar 包与校验文件的目录验证，再解压到空的暂存目录：

.. code-block:: bash

   VERSION=v0.1.0
   PACKAGE="sdn-web-${VERSION}-linux-amd64"
   sha256sum -c "$PACKAGE.tar.gz.sha256"
   mkdir "unpack-$VERSION"
   tar -C "unpack-$VERSION" -xzf "$PACKAGE.tar.gz"
   "unpack-$VERSION/$PACKAGE/bin/sdn-web-gateway" -h

上例 amd64 须与实际包和部署机一致。程序安装使用暂存目录中的 bin，
静态站点安装整个 ui 目录，按 :doc:`source-install` 配置服务和反向代理。
config.js 在发布目录中重新应用实际 apiBase，任何时候都不把令牌写入它。

制作和分发镜像
----------------------------------------

Dockerfile 的构建上下文必须是三个项目的父目录。以下发布默认合并的 Web 镜像：

.. code-block:: bash

   cd ~/program/github
   VERSION=v0.1.0
   docker build -f sdn-web/docker/Dockerfile --target web \
     -t "sdn-web:$VERSION" .
   docker image inspect "sdn-web:$VERSION" --format '{{.Id}}'

需要分离部署时，分别选择 ``--target gateway`` 和 ``--target ui``，
并使用 ``sdn-web-gateway:$VERSION``、``sdn-web-ui:$VERSION`` 等独立标签。
不要将 gateway target 当作带前端的完整镜像。

默认 web target 固定 Gateway 为容器内 HTTP 127.0.0.1:18080，由 Nginx 监听 8080。
它拒绝通过启动参数覆盖 Gateway 的 listen/tls-cert/tls-key；外部 HTTPS 在 Nginx 配置，
出站 Controller TLS 仍可使用 controller-ca。合并部署的 Gateway 仍需 ``-insecure``
允许本地 HTTP；同时设置 ``-controller-ca`` 可让出站 gRPC 使用 TLS，不能仅删除
``-insecure``。镜像默认 CMD 是隔离实验的 insecure 模式。
Supervisor 联合检查 Nginx/Gateway 存活，但不能据此认定 Controller 或网络业务可用。

在线分发时，在有权限的实际仓库登录、标记和上传；以下域名为占位示例：

.. code-block:: bash

   VERSION=v0.1.0
   REGISTRY=registry.example.net/sdn
   docker login registry.example.net
   docker tag "sdn-web:$VERSION" "$REGISTRY/sdn-web:$VERSION"
   docker push "$REGISTRY/sdn-web:$VERSION"
   docker image inspect "$REGISTRY/sdn-web:$VERSION" --format '{{json .RepoDigests}}'

记录 push 返回的 digest，部署方按固定版本或 digest 引用镜像。
默认 Compose 使用本地构建标签，发布新标签不会自动让既有容器切换版本。

离线分发在发送端执行：

.. code-block:: bash

   VERSION=v0.1.0
   mkdir -p artifacts/releases/images
   docker save "sdn-web:$VERSION" | gzip > "artifacts/releases/images/sdn-web-$VERSION.tar.gz"
   (cd artifacts/releases/images && sha256sum "sdn-web-$VERSION.tar.gz" > "sdn-web-$VERSION.tar.gz.sha256")

此例在 sdn-web 项目根目录执行，选择尚未交付的新版本文件名。
接收端在离线文件目录运行 ``sha256sum -c sdn-web-v0.1.0.tar.gz.sha256``，
再运行 ``docker load -i sdn-web-v0.1.0.tar.gz``；替换版本号后核对镜像标签和 ID。
离线文件的 SHA-256 用于校验传输内容，不能代替可信来源验证或镜像兼容性验收。

发布文档
----------------------------------------

在已安装本项目文档依赖的环境构建并打包整个 HTML：

.. code-block:: bash

   cd ~/program/github/sdn-web
   VERSION=v0.1.0
   make -C docs html
   mkdir -p artifacts/releases/docs
   tar -C docs -czf "artifacts/releases/docs/sdn-web-docs-$VERSION.tar.gz" html
   (cd artifacts/releases/docs && sha256sum "sdn-web-docs-$VERSION.tar.gz" > "sdn-web-docs-$VERSION.tar.gz.sha256")
   python3 -m http.server 18088 --bind 127.0.0.1 --directory docs/html

最后一条仅启动本机预览，浏览器访问 ``http://127.0.0.1:18088``，Ctrl+C 停止。
发布到实际静态站点时复制完整 html 目录；它与业务 UI dist 是两套不同产物。
仓库默认忽略生成 HTML，提交 README、RST、模板、静态源文件与 requirements.txt 即可。

升级和回滚
----------------------------------------

升级前记录现有 Web 版本、镜像 ID/digest、Nginx 配置、Gateway 启动参数、部署 config.js
以及配套 Controller/Agent 版本，保留旧包。令牌和证书沿用部署配置并保留受控备份。
Web 无业务数据库；Desired、候选、任务及回执仍在 Controller 中。

1. 先在单独目录准备并验证新 Gateway 和整套 UI。检查 HTTP/Protobuf 字段兼容性，
   尤其是新资源 oneof、optional 字段、revision 和任务状态。
2. 选择维护窗口暂停新提交，记录待确认 Commit 的原请求键和 Job/Change ID。
   更换 Web 不会取消 Controller 已受理任务；也不能通过换新幂等键“恢复”未知结果。
3. 二进制部署先停止本项目 Gateway，切换完整版本目录与服务配置，验证 Nginx 配置后重载，
   启动 Gateway。UI 升级应保留旧哈希资源一段部署窗口，或要求浏览器在维护结束后刷新，
   避免旧页面按需加载已经撤下的资源。只覆盖单个 index.html 无法完成版本切换。
4. 容器部署使用版本覆盖文件替换 Web 的 image，并仅重建 Web 服务。
   下例在 Controller 项目目录执行，``web-release.yaml`` 由部署方提供：

   .. code-block:: yaml

      services:
        web:
          image: registry.example.net/sdn/sdn-web:v0.1.0

   .. code-block:: bash

      docker compose --project-name sdn-docker --env-file docker/.env \
        -f docker/compose.yaml -f web-release.yaml pull web
      docker compose --project-name sdn-docker --env-file docker/.env \
        -f docker/compose.yaml -f web-release.yaml up -d --no-deps --no-build web

   离线已 load 时省略 pull。替换示例 image 为实际受控版本，保留原 Compose 环境参数。
   不用整套 reset 作为升级或回滚命令，也不重建 Agent 网络命名空间。
5. 检查 Web health、带认证的 ``/api/v1/desired``、节点和原 Job 查询；浏览器重新登录，
   确认资源加载、只读权限和 SSE 恢复。HTTP 200 只能证明对应请求成功，网络转发另行验收。

回滚时切回原 Gateway、完整 UI 目录或原 Web 镜像，并重新应用该版本的部署配置。
若已同时升级 Controller/Agent 或写入旧版本无法理解的新资源，先确认协议与状态兼容，
不能单靠 Web 回滚撤销网络变更。当前没有自动数据库迁移、跨版本降级协调或网络自动还原器；
相关恢复应按 Controller/Agent 的恢复手册处理。
