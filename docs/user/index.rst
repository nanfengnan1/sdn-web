用户指南
========

.. container:: doc-lead

   sdn-web 是 SDN Fabric 管理控制台。通过浏览器查看节点、编辑租户网络、预览下发计划，并追踪 Controller 和各 Agent 的执行结果。

还没有部署服务，请先选择下面的安装入口。已有控制台时阅读 :doc:`quickstart`；日常操作者无需安装 Go、Node.js 或 pnpm。

.. container:: doc-cards

   .. container:: doc-card

      :ref:`web-source-install`

      安装工具和依赖，编译 Vue 与 Gateway，安装文件，配置 Nginx 并启动验证。

   .. container:: doc-card

      :ref:`web-docker-deploy`

      从源码制作镜像，初始化令牌、端口和存储，启动完整 Compose 环境。

.. list-table:: 按任务阅读
   :header-rows: 1
   :widths: 40 60

   * - 想要做什么
     - 阅读内容
   * - 编译、安装并部署源码版本
     - :doc:`source-install`
   * - 构建镜像并部署容器版本
     - :doc:`docker-deploy`
   * - 制作发布包、交付镜像、升级和回滚
     - :doc:`release`
   * - 登录并跑通空白实验
     - :doc:`quickstart`
   * - 理解访问令牌、节点状态和纳管
     - :doc:`nodes-access`
   * - 新增租户、BD、VXLAN 或修改网络
     - :doc:`configuration`
   * - 查看执行结果和 EVPN 观测
     - :doc:`jobs-topology`
   * - 自己部署前端与 Gateway
     - :doc:`deployment`
   * - 处理权限、冲突、超时和回滚问题
     - :doc:`troubleshooting`

控制台提供按 Agent 的独立资源表单，见 :doc:`resources`；完整 JSON 编辑器继续作为高级入口。配置下发使用持久化任务，浏览器关闭不会取消已经受理的任务。

.. toctree::
   :maxdepth: 2

   deployment
   release
   quickstart
   nodes-access
   configuration
   resources
   jobs-topology
   troubleshooting
