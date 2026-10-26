故障排查与恢复
==============

先记下浏览器访问地址、时间、候选 ID、Job ID、节点 UUID 和显示的错误。共享诊断时不要附上访问令牌或完整 Authorization 请求头。

.. contents:: 按现象查找
   :local:
   :depth: 2

无法登录或没有操作按钮
----------------------

* ``401``：确认令牌来自当前环境。新 Docker 使用 ``docker/state/tokens.json``，旧实验使用另一套文件。不要误用 ``agent`` 字段。
* 页面显示“只读”：使用了 viewer 令牌。只读用户没有纳管和提交按钮，修改请求也会在服务端返回 ``403``。
* 刷新后回到登录页：这是当前内存令牌策略；重新登录后仍能查询原持久化任务。
* ``origin not allowed``：核对 UI 的协议、主机和端口，以及 Gateway 来源配置。代理删掉外部 ``28080`` 端口或 HTTPS 终止后未允许来源，都会造成不匹配。

能打开页面，但节点和配置查询失败
--------------------------------

静态页面、Gateway、Controller 是不同组件。页面能加载只说明静态服务可用。

在实验宿主机查询本项目状态和日志：

.. code-block:: bash

   cd ~/program/github/sdn-controller
   python3 docker/manage.py status
   docker logs --tail 100 sdn-docker-gateway
   docker logs --tail 100 sdn-docker-controller

若 Controller 不可达，检查 Gateway endpoint、容器网络、TLS 信任和令牌一致性。``503`` 表示服务不可用；``504`` 表示调用超时。不能把查询失败解释为真实空配置。

节点 DOWN 或纳管失败
--------------------------

先看“最近心跳”和“详情”的 endpoint/instance。``DOWN`` 是管理连接状态，不代表业务配置已被清除。

纳管时版本冲突，需要重新刷新节点并核对实际 Agent 版本。已有配置节点默认不会自动接管；只有核对其来源和基线后才勾选对应选项。通过手工 ``ip`` 或 ``vtysh`` 创建的任意配置不会自动转换为 Controller 资源。

保存或预览失败
--------------

完整 JSON 可包含旧声明式 ``nodes``、``tenants``、``networks`` 与独立资源 ``nodeResources``。
先读取完整当前配置，保留其他节点的资源；同一节点不能同时使用两种模型。
使用正确字段名、真实节点 UUID 和当前存在的端口名。字段错误、缺少引用、重复资源或能力不足会在保存或计划阶段被拒绝。

已有配置上仅粘贴新增对象会遗漏其他资源。先恢复完整配置，再在其中做修改。修改后必须“保存候选”再“预览计划”，不能复用旧计划提交。

提交冲突、超时或响应丢失
------------------------

对于明确的 ``4xx`` 拒绝，页面会查询候选：如果已经关联任务，则找回任务；若未冻结，允许重新预览。基础版本冲突时读取最新配置，在新候选中合并修改。

对于网络断开、``5xx`` 或无法确认候选状态，页面保留原提交键并显示“重试原提交”。使用原请求重试或查询原任务，不重新生成另一份相同变更。Controller 接受后的任务可能仍在执行。

``429`` 可能来自 Gateway 并发上限或请求体过大。单次 JSON 请求体上限为 1 MiB，Controller 持久化存储也有容量边界。降低并发或配置规模；不能仅靠增加浏览器重试次数解决。

任务 PARTIAL 或回滚失败
--------------------------------

检查每个节点的状态和错误。跨节点失败策略为停止后续执行，保留已成功节点；不提供全网原子回滚。``PARTIAL`` 可能同时包含成功节点与失败/回滚失败节点。

若节点为 ``ROLLBACK_FAILED``，先恢复其后端可用性，再通过 Controller 的 ``RetryRollback`` gRPC/CLI 重试原任务的逆序恢复。当前 Web 没有该接口的专用按钮。

管理员在已构建的 Controller 项目目录准备 ``retry-rollback.json``：

.. code-block:: json

   {
     "jobId": "<原任务ID>",
     "nodeId": "<失败节点UUID>",
     "requestId": "<本次恢复的固定请求ID>",
     "expectedJobSequence": "<当前任务sequence>"
   }

在实验宿主机设置 ``SDN_ADMIN_TOKEN`` 为对应环境令牌后执行：

.. code-block:: bash

   cd ~/program/github/sdn-controller
   bin/sdnc -addr 127.0.0.1:29090 -insecure \
     -method RetryRollback -file retry-rollback.json rpc
   bin/sdnc -addr 127.0.0.1:29090 -insecure -job '<原任务ID>' watch
   bin/sdnc -addr 127.0.0.1:29090 -insecure -job '<原任务ID>' job

``expectedJobSequence`` 使用当前 GetJob 返回值，不是任意填 ``0``。相同恢复请求重试保持同一文件和 requestId；请求被版本检查拒绝时，重新核对最新状态。

恢复成功后，失败节点变为 ``FAILED_ROLLED_BACK``，原 Job 仍为 ``FAILED`` 或 ``PARTIAL``，不会自动继续原计划。回到 Web 重新建立候选和计划。如果后端拒绝旧日志/基线不匹配的恢复，需要人工核查；不能把 Task 状态改成成功来解除隔离。

SSE 长时间没有更新
----------------------

先用任务 ID 重新查询。如果查询有进展而订阅不更新，检查反向代理是否关闭缓冲、长连接是否超时、Gateway 的流数量是否达到上限。页面会重连并按事件序号恢复，终态后停止订阅是正常行为。

若查询本身也失败，先恢复 Controller 链路。订阅中断本身不证明任务停止，不能据此重复提交。

拓扑为空或没有 MAC-IP
----------------------------

1. 检查是否已经提交业务配置，空白环境本来就没有租户和主机路由。
2. 点击“采集最新状态”，检查采集时间、过期标记和错误。
3. 查看相关节点 OSPF/BGP EVPN 状态，确认 Underlay 和 EVPN 邻居正常。
4. 确认 PC 已配置 IP/网关并发送流量，使 Leaf 学习本地 MAC 和邻居。
5. 重新采集并核对来源节点、RD、Type 和下一跳。

MAC 老化、邻居状态改变或 EVPN 路由撤销会影响观测结果，Web 没有主动 ARP/ND 保活功能。不要把缓存路由表当作永久端点清单。

持久化与容器重建
----------------

Controller 保存期望配置、候选和 Job；Agent 保存本地事务和身份。数据库持久化不保证容器网络命名空间重建后自动还原 Linux 接口、地址、桥和 veth。

重建环境后先核对实际接口和节点身份，再决定恢复或重建空白实验。当前没有完整自动漂移修复或宿主机重建流程。需要清空时仅使用本项目的 ``docker/manage.py reset``，详见 :doc:`quickstart`；不要删除其他实验的卷或容器。
