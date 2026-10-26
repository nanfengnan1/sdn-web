# Docker 版 Web 验收

本文是特定测试环境的历史验收记录，保留当时的 IP 和结果。新部署请使用自己的服务器 IP，并按[当前 Docker 部署手册](html/user/docker-deploy.html)操作；不要把本报告地址当作固定服务入口。

本次从 Vue/Go 源码构建独立的 Alpine UI 和 Gateway 镜像，运行在独立 `sdn-docker` Compose 环境，入口为 `http://10.8.126.103:28080`。

10 项真实浏览器测试全部通过，包含配置提交、版本冲突、任务事件、权限和拓扑。Nginx 转发 Host 时保留外部端口，修复了首次测试发现的 Origin 拒绝问题。最终已清空测试业务，额外的只读浏览器测试确认 3 个节点未纳管、无租户/网络、无任务，等待手动测试。

- [完整 Docker 验收报告](../../sdn-controller/docs/docker-validation.md)
- [Docker 构建说明](../docker/README.md)
- [浏览器功能测试](../tests/e2e/browser.cjs)
- [清空后只读测试](../tests/e2e/clean.cjs)

浏览器脚本通过 `SDN_WEB_URL`、`SDN_TEST_TOKENS`、`SDN_TEST_ARTIFACTS` 指向本环境，不覆盖旧实验的报告。
