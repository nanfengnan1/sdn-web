IPS 页面与运行状态
===============================

页面复用与数据流
----------------

``views/ips.vue`` 提供独立入口，复用 resource-workspace 的候选、预览、
提交和错误恢复。``resources.ts`` 描述规则/绑定操作与能力门禁，
不在浏览器生成 Lua 或执行设备命令。

.. code-block:: text

   IPS 表单 → Gateway HTTP → Controller 候选/计划/任务
                                      ↓
                              Agent Snort Driver
                                      ↓
                           Redis / confd / Snort / VPP

Gateway 保持既有认证与 HTTP/gRPC 转换，不新增 Redis 连接。
跨节点规划和版本校验归 Controller；Snort 校验、重载确认和 Undo 归 Agent。
部署时三仓库协议应配套更新，旧节点没有对应回滚能力时禁用提交。

实现入口
--------

* router.ts：IPS 页面菜单与路由。
* resources.ts：IPS_RULE、IPS_INTERFACE、SID/方向输入和 snort-ips/v1 能力。
* views/resource-workspace.vue：共享事务流程，ipsOnly 隐藏其他资源分类。
* views/resource-query.vue：IPS 查询不附加不适用的网络过滤条件。
* query-presentation.ts：运行状态、加载代次、基础文件待加载/错误等列。

查询读取实际状态；候选、Desired、任务 SUCCEEDED 与协议最终收敛不是同一概念。
基础 Lua 归宿主机管理员管理，页面只展示其状态，不提供任意 Lua/shell 编辑器。
规则正文作为单行文本提交，最终校验在 Agent 内完成。

测试与镜像
----------

resources.test.ts 覆盖能力门禁与规则输入；
query-presentation.test.ts 覆盖基础配置状态列。端到端脚本
``tests/e2e/snort-ips.cjs`` 只接受隔离测试访问文件，执行真实创建、查询和删除。

.. code-block:: console

   cd ui
   pnpm test
   pnpm typecheck
   pnpm build

从 Web 仓库根目录构建合并镜像：

.. code-block:: console

   docker build --build-arg SOURCE_REVISION="$(git rev-parse HEAD)" \
     -f docker/Dockerfile -t alpine/sdn-web:local ..

最终镜像标签记录 Web 源码 revision；Node 构建阶段执行测试、类型检查及生产构建。
配套运行时架构见 Agent 的 ``docs/developer/ips.rst``；
页面使用步骤见 :doc:`/user/ips`。
