sdn-web 文档
============================================================

.. container:: doc-lead

   独立的 SDN 管理控制台。Vue 静态前端调用 Go Gateway 的 HTTP 接口，Gateway 通过公开 gRPC 接口连接 Controller。

.. container:: doc-cards

   .. container:: doc-card

      :ref:`源码编译与安装 <web-source-install>`

      安装 Go、Node.js 和 pnpm，编译 UI 与 Gateway，安装产物、配置接口地址并启动。

   .. container:: doc-card

      :ref:`Docker 源码镜像部署 <web-docker-deploy>`

      从源码构建默认合并的 Web Alpine 镜像，按需选择独立 UI / Gateway target，或使用整套 Compose 环境。

   .. container:: doc-card

      :doc:`用户指南 <user/index>`

      令牌登录、节点纳管、租户网络配置、计划提交、任务与拓扑查看。

   .. container:: doc-card

      :doc:`开发指南 <developer/index>`

      Vue 页面、Go Gateway、HTTP / gRPC / SSE、扩展开发和测试。

从哪里开始
------------------------------------------------------------

自行部署从上面的编译安装或 Docker 入口开始。已有可用控制台的操作者，直接阅读 :doc:`从空白环境开始 <user/quickstart>`，不需要在浏览器所在电脑安装 Go 或 Node.js。

准备交付版本阅读 :doc:`发布与升级 <user/release>`；新增页面、资源表单或 API 阅读
:doc:`扩展开发流程 <developer/extensions>`。两类手册以当前源码为依据，历史验收报告单独保留。

教程中的 ``<部署服务器IP>`` 请替换为你部署服务的实际地址。
``127.0.0.1`` 表示命令所在机器本身，``controller:19090`` 等容器 DNS
只在对应 Docker 网络内使用，不能直接填入另一台电脑的浏览器。

生成或清理本手册
------------------------------------------------------------

下面命令构建的是 HTML 文档。软件编译、安装、配置和启动请使用上面的部署入口。

首次构建文档先按仓库 ``docs/README.md`` 安装 ``docs/requirements.txt``，
然后在项目目录执行：

.. code-block:: bash

   make -C docs help
   make -C docs html
   # 需要清理生成的文档时执行：
   make -C docs clean

生成入口为 ``docs/html/index.html``，两类手册分别在
``docs/html/user/index.html`` 和 ``docs/html/developer/index.html``。
``clean`` 仅删除文档产物 ``docs/html/`` 与 ``docs/_build/``。
原有 Markdown 设计记录和验收报告继续保留；其中历史环境地址不作为部署参数。

.. toctree::
   :hidden:
   :maxdepth: 2
   :caption: 用户指南

   user/index

.. toctree::
   :hidden:
   :maxdepth: 2
   :caption: 开发指南

   developer/index
