开发指南
========

.. container:: doc-lead

   本手册以当前实现为准，说明 Vue 前端、Go Gateway 与 Controller 公共 API 的边界，以及请求、认证、幂等和任务订阅约定。

sdn-web 独立构建与部署。业务规则、资源编译、任务持久化和 Agent 调度归 Controller；本项目负责用户交互和 HTTP/gRPC 协议适配。

首次搭建请先读 :doc:`源码编译、安装与部署 </user/source-install>`，镜像方式见 :doc:`/user/docker-deploy`。
需要修改代码并启动 Vite / Gateway 开发进程时，直接进入 :doc:`development`。
制作包含合并、UI 和 Gateway 镜像的离线包，以及发布 tag / GitHub Release，见 :doc:`release`。

.. toctree::
   :maxdepth: 2

   architecture
   http-api
   development
   extensions
   testing
   release
   build-docs

建议按 :doc:`architecture` → :doc:`http-api` → :doc:`development` → :doc:`extensions`
→ :doc:`testing` → :doc:`build-docs` 阅读。设计页给出组件、状态归属和请求时序；
扩展页把需求落到源码入口和验证要求，供开发者或其他 AI 继续工作。页面操作说明在 :doc:`/user/index`。

保留资料可下载：:download:`架构设计原稿 <../../agent.md>`、:download:`原 HTTP 契约 <../http-api.md>`、:download:`Docker 验收记录 <../docker-validation.md>`。原有 Markdown 报告记录对应时点的验证，不替代本次改动的回归结果。
