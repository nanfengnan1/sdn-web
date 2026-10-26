# 独立资源工作台验证记录

日期：2026-10-25。此记录区分本地契约/组件检查和真实 Linux/FRR 整网结果。

| 范围 | 命令或脚本 | 结果 |
| --- | --- | --- |
| Gateway（10 项测试） | `go test -race ./...`、`go vet ./...` | 通过 |
| UI（13 项单测） | `pnpm test` | 通过 |
| Vue 类型与生产构建 | `pnpm typecheck`、`pnpm build` | 通过 |
| 严格 HTML 手册 | `make -C docs html` | 通过 |
| Chromium 组件（8 项） | `tests/e2e/resource-components.cjs` | 通过；0 pageerror |
| 真实隔离环境资源表单（7 项） | `tests/e2e/resources.cjs` | 通过；0 pageerror；Linux/FRR 实际执行 |

Gateway 新增测试验证资源路径/body 一致性、只读用户拒绝、false/0 presence、
Import 原幂等键和版本、查询参数拒绝，以及 RPC 错误不伪装为空结果。
UI 单测覆盖自然键操作、VRF 后续绑定不重建租户、双栈协议字段、BD 策略、
能力约束和空租户/未绑定资源树。

浏览器组件检查使用生产 UI 与本机模拟 Controller 契约，不连接 Agent。
报告：[resource-component-results.json](../artifacts/components/resource-component-results.json)。
已验证稀疏表单 false/0、保留可选 VRF 身份、草稿版本推进、Plan 展示、查询错误、
切换节点与不支持能力、viewer 和无浏览器脚本错误。
组件结果不能替代真实网络配置和转发测试。

真实环境首次操作暴露 Element Plus 2.14 InputNumber 的 ARIA 状态滞后：
无候选时挂载为禁用，新建候选后原生输入已启用，但 ``aria-disabled`` 未更新。
已按有效禁用状态重建数字控件并保留表单模型，增加浏览器回归验证初始禁用到启用；
未使用强制填写绕过可访问性检查。早期脚本的节点角色假设、异步下拉时序也已修正，
失败报告由测试脚本归档保留。

真实表单脚本要求显式的隔离环境 URL 与凭据路径，分三笔事务验证：
空租户 → 添加 BD/地址 → 添加三层 BD/VXLAN 并绑定 L3VNI。
它使用专用 `WEB-TEST` 对象，保留现场供排查，由隔离环境生命周期统一清理。

最终真实验收在 `sdn-resource-it` 隔离环境的 `38080` 入口完成，三笔 Job 均成功。
验证了原 VRF 始终只有一份，租户/BD/三层接口关系树正确、查询有真实来源和采集时间、
未知接口返回显式错误、viewer 没有修改入口。没有修改现有 `sdn-docker` 或其他实验环境。
结果：[resource-browser-results.json](../../sdn-controller/artifacts/resources/resource-browser/resource-browser-results.json)。
截图：[resources-tenant-tree.png](../../sdn-controller/artifacts/resources/resource-browser/resources-tenant-tree.png)。
完整 IPv4/IPv6、OSPFv2/v3、BGP/EVPN Type-2/3/5、CRUD 与 CLI 的整网证据由
Controller 项目的资源验收记录维护；本表的浏览器用例不单独声称覆盖所有协议组合。
