# Web 完整联调记录

以下是历史测试环境的记录，具体 IP 和端口保留用于追溯。新部署使用自己的服务器 IP，入口与安装步骤见[当前部署手册](html/user/deployment.html)。

日期：2026-10-25。独立 Gateway、Vue 前端与真实 Controller/Agent/Linux/FRR
已完成端到端验收。Web 地址：`http://10.8.126.103:18080`。

- Gateway：7 个顶层 Go 测试、race、vet、构建通过，交付 binary 使用 `CGO_ENABLED=0` 静态构建。
- Vue：7 个单元测试、类型检查、Vben Element Plus 生产构建通过。
- 真实浏览器：10 项通过，包含真实配置候选/409 恢复/提交/任务恢复/G6/viewer 403。
- 总体源码检查 11 阶段、真实网络/API 17 项通过；网络配置来自实际 Web HTTP 接口。

[完整验收报告](../../sdn-controller/docs/validation.md)、
[机器可读汇总](../../sdn-controller/artifacts/validation-summary.json)、
[浏览器结果](../../sdn-controller/artifacts/browser-results.json)。

截图：[节点](../../sdn-controller/artifacts/ui-nodes.png)、
[租户与网络](../../sdn-controller/artifacts/ui-desired.png)、
[计划预览](../../sdn-controller/artifacts/ui-plan.png)、
[任务详情](../../sdn-controller/artifacts/ui-job.png)、
[三节点真实配置任务](../../sdn-controller/artifacts/ui-provision-job.png)、
[拓扑](../../sdn-controller/artifacts/ui-topology.png)、
[viewer](../../sdn-controller/artifacts/ui-viewer.png)。

浏览器为 headless Chrome 155.0.8059.86，访问实际 HTTP 实验地址；没有模拟接口。
任务详情刷新、事件处理和版本冲突均调用实际 Controller。
报告中没有明文凭据，浏览器刷新后需重新输入令牌。

运行方式：[tests/e2e/README.md](../tests/e2e/README.md)。凭据读取相邻 Controller
`lab/state/tokens.json`；测试只向专用实验提交无变化配置。

页面当前使用结构化 JSON 编辑完整候选；独立租户向导、OIDC/细粒度租户权限、
多副本压测、移动端和超大拓扑容量测试尚未包含在本轮范围。
