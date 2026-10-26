# 验证方式

Go Gateway 的测试使用可控 Controller 客户端，覆盖凭据透传、只读权限、
Protobuf JSON uint64、固定提交键、路径/字段校验、上游错误、超时、并发限额、
SSE 游标/分帧和断连取消。它们验证传输契约，不代替真实 Controller 测试。

前端 Vitest 覆盖 UTF-8 分块、跨 chunk SSE、重复事件/大整数游标、HTTP 环境 UUID、
明确拒绝与未知结果区分、任务详情刷新合并及销毁。`vue-tsc` 检查业务页面与真实
Vben 类型；生产 build 使用固定的上游版本和 pnpm lockfile。

```sh
make test
make build
```

完整联调由总体项目的独立测试任务执行并记录，包含 Web -> Gateway -> Controller
-> Agent -> Linux/FRR 的真实 EVPN 实验。没有运行过的测试不能在文档中标为通过。

浏览器操作入口：

- `#/login`：`访问令牌` 输入框、`连接控制台` 按钮；刷新页面后需要重新输入。
- `#/nodes`：`详情`、`纳管`、`确认纳管`；默认不允许接管已有配置。
- `#/desired`：租户、L2VNI、节点目标配置及完整 JSON。
- `#/changes`：`新建候选`、`完整资源配置 JSON`、`保存候选`、`预览计划`、
  `提交配置`（确认框）；失败后保留编辑内容和必要的幂等键。
- `#/jobs?id=<job-id>`：任务查询、节点进度、事件记录。
- `#/topology`：`查询缓存`、`采集最新状态`；G6 图、观测时间、EVPN 路由。

主要测试定位使用可访问名称，不依赖 Vben 内部 CSS。生产静态文件输出路径为
`ui/apps/web-ele/dist`。浏览器基线为桌面 Chromium；大规模拓扑和多副本负载测试
尚需专门的容量方案，不能从本轮功能测试推导容量。
