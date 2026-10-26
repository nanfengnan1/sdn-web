选择部署方式与地址
========================================

sdn-web 包含两个独立构建和运行单元：Vue 静态前端与 Go Gateway。
Gateway 连接 Controller 公共 gRPC API，不直接访问 Agent 或数据库。

.. container:: doc-cards

   .. container:: doc-card

      :ref:`web-source-install`

      准备工具、安装依赖、编译产物、安装文件，再启动 Gateway 与 Nginx。

   .. container:: doc-card

      :ref:`web-docker-deploy`

      从三个项目的源码制作镜像，启动包含 Web、Controller 和 Agent 的完整实验。

已有服务时阅读 :doc:`quickstart`。生成手册的 ``make -C docs html``
只编译文档，不会编译或启动 Web 应用。

部署地址如何填写
----------------------------------------

所有 ``<部署服务器IP>`` 都表示 **浏览器可以访问的 Web 部署服务器 IP**；
将占位符替换后，例如使用 ``http://<部署服务器IP>:28080``。不要原样输入尖括号。

* 浏览器与服务器不在同一台机器时，浏览器里的 127.0.0.1 指浏览器所在电脑。
* Gateway 的 ``-controller`` 填写 Gateway 进程可以连接的 Controller 地址。
* 默认 Docker 的 Nginx 与 Gateway 同处 Web 容器，上游为容器内 ``127.0.0.1:18080``；Gateway 连接 ``controller:19090``。
* ``controller:19090`` 仅在对应 Compose 管理网中可解析；选择独立 UI / Gateway 部署时，按实际网络配置上游地址。
* 前后端分机部署时，运行时 config.js 的 API 地址必须可被浏览器访问，Gateway 需允许前端实际 Origin。
* Web 部署 IP、监听地址和 EVPN 业务 VTEP 地址用途不同。替换部署 IP 不需要改动实验的 10.255.0.x 业务规划。

.. list-table:: 默认端口对照
   :header-rows: 1

   * - 部署方式
     - 浏览器入口
     - Gateway 到 Controller
   * - 源码：Nginx + Gateway
     - ``http://<部署服务器IP>:8080``
     - 同机示例 127.0.0.1:19090
   * - 源码：Gateway 临时托管前端
     - ``http://<部署服务器IP>:18080``
     - 同机示例 127.0.0.1:19090
   * - 完整 Docker 实验
     - ``http://<部署服务器IP>:28080``
     - 容器内 controller:19090
   * - 源码 Gateway 对接同机 Docker Controller
     - 由前端部署方式决定
     - 宿主机 127.0.0.1:29090

截图来自历史实验，截图内 IP、UUID 和配置结果不能直接作为新部署参数。

.. toctree::
   :maxdepth: 1
   :hidden:

   source-install
   docker-deploy
