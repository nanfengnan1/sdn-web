开发环境与扩展方式
==================

工具和目录
----------

当前验证使用 Go 1.25+、Node 24.14.0、pnpm 10.33.4。UI 的上游固定为 Vben v5.7.0，来源、提交和修改范围记录在 ``ui/UPSTREAM.md``，许可文件保留在项目中。

工作目录布局：

.. code-block:: text

   ~/program/github/
     sdn-agent/          public Agent protobuf
     sdn-controller/     public North protobuf
     sdn-web/
       gateway/          Go module and HTTP adapter
       ui/               pnpm/Vben workspace
         apps/web-ele/   SDN business UI
       docker/           default web and optional gateway/ui targets
       deploy/           reverse proxy example
       tests/e2e/        browser workflows
       docs/             user and developer HTML sources

Go ``replace`` 引用相邻项目的公共 API，构建时需保留该布局。Gateway 不导入 Controller 的 internal 包。若将来发布独立 SDK，应同时更新版本约束、构建上下文和契约测试。

启动本地开发
------------

首次安装 Go / Node / pnpm、源码编译和发布目录见 :doc:`/user/source-install`。
下面按三个终端准备本地开发，不依赖某台测试机的缓存目录。

终端一：按 Controller 的源码部署手册运行 Controller，保持 admin / viewer 令牌供 Gateway 使用。
以下假设 Controller 可从本机 127.0.0.1:19090 访问；若对接同机 Docker 则改为 29090。

终端二：下载 Go 依赖、编译并启动 API-only Gateway：

.. code-block:: bash

   cd ~/program/github/sdn-web/gateway
   go mod download
   CGO_ENABLED=0 go build -o ../bin/sdn-web-gateway ./cmd/sdn-web-gateway
   export SDN_ADMIN_TOKEN='<与Controller相同的管理员令牌>'
   export SDN_VIEWER_TOKEN='<与Controller相同的只读令牌>'
   ../bin/sdn-web-gateway \
     -listen 127.0.0.1:18080 \
     -controller 127.0.0.1:19090 \
     -allowed-origins http://localhost:15173,http://127.0.0.1:15173 \
     -insecure

终端三：安装前端依赖并运行开发服务：

.. code-block:: bash

   cd ~/program/github/sdn-web/ui
   pnpm install --frozen-lockfile
   pnpm dev:ele

浏览器打开 ``http://localhost:15173`` 或 ``http://127.0.0.1:15173``，输入对应令牌。
Vite 将 /api 代理到本机 18080，并重写上游 Host，因此 Gateway 显式允许两个开发 Origin，
避免只读页面正常而保存候选返回 origin not allowed。远程开发时需同时调整 Vite 监听与允许的实际页面 Origin，
不能只替换浏览器 IP。浏览器使用真实 Controller API，不以 Vben mock backend 替代。

确认代码后，在项目根目录检查和生成生产资源：

.. code-block:: bash

   cd ~/program/github/sdn-web
   make test
   make build

产物为 bin/sdn-web-gateway 与 ui/apps/web-ele/dist；安装发布见 :doc:`/user/source-install`。
前台 Gateway 和 Vite 都可用 Ctrl+C 停止。发布二进制禁用 CGO，race 测试需要 C 编译器。

前端状态与交互约定
------------------

* ``session.ts`` 仅持有内存 token 和角色。不要改用持久化 token store，也不要把 token 放入 URL 或运行时 config。
* ``api.ts`` 统一 base URL、Authorization、请求和错误解析；页面通过 AbortController 取消不再需要的读取。
* ``changes.vue`` 保存候选 ID、Begin 请求和待确认 Commit 请求到当前标签页的 sessionStorage。必须保留未知提交的原幂等键。
* ``jobs.vue`` 先读取快照，再订阅事件；使用 sequence 去重，断线后查询恢复，并在卸载时取消查询和订阅。
* ``topology.vue`` 把 Controller 返回的图数据交给 G6，保留配置/观测的来源，不在 UI 猜测物理链路。

业务页面应明确区分 loading、空数据、错误、过期数据和成功结果。修改按钮由角色控制显示，但授权必须在服务端实现。

增加一个查询页面
----------------

完整跨项目步骤、字段语义和源码入口见 :doc:`extensions`；下面保留常用入口速查。

1. 确认 Controller 公共 North API 已有对应查询；缺少时先在 Controller 设计和实现语义。
2. 在 ``httpapi`` 中增加路径映射、参数解析、分页/范围上限和错误处理，只做传输适配。
3. 在 ``types.ts`` 与 ``api.ts`` 维护对应类型和调用，保留 Protobuf JSON 的整数/枚举语义。
4. 在 ``views/`` 增加页面，并更新 ``router.ts`` 与布局菜单。优先复用现有 Element Plus 和 Vben 组件。
5. 添加契约/前端验证，更新本项目 :doc:`http-api` 和用户操作说明。

增加一个写操作
--------------

写请求需设计授权、版本前提、幂等键、持久受理与未知结果恢复。Controller 应提供资源语义和任务，而不是让 Gateway 直接执行 Agent 命令。

若增加 Web 回滚重试入口，可使用已有 Controller ``RetryRollback`` 协议，但还需实现 HTTP 映射、admin 权限、原 Job/节点/sequence 展示、明确确认、固定 requestId 与结果查询，并覆盖响应丢失和重复调用测试。当前文档不把它视为已经完成的 Web 功能。

不要把“按钮请求返回 200/202”直接转成“配置成功”。通过任务状态、节点结果和后续观测表达真正完成的阶段。

修改协议时的兼容性
------------------

新增 Protobuf 字段不能复用旧编号；更新 Controller 公开生成代码后，再同步 HTTP 契约和前端类型。现有 JSON 解析拒绝未知字段，前后端协议不一致时会明确失败，需要把版本部署顺序纳入变更。

对新的状态值保留原始字符串并正确展示，不默认解释成成功。新增终态需同步 Controller 语义、前端 ``terminal`` 判断和 SSE 重连测试。大整数 revision/sequence 继续使用字符串/BigInt。

不在本项目实现的能力
--------------------

资源分配、节点 DAG、执行与回滚日志、etcd 写入者控制以及跨节点失败策略归 Controller/Agent。
当前已实现独立资源表单、关系树与运行查询，扩展方式见 :doc:`extensions`。
OIDC、细粒度租户 RBAC、历史指标和多副本容量验证仍需独立实现，不能由 UI 组件存在推断为后端已支持。
