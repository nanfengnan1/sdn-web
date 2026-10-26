# sdn-web 离线镜像包

本包用于 Linux/amd64。需要 Docker、Bash、Python 3、tar、xz 和 sha256sum。
版本、镜像 ID 与配套源码提交以本目录 `manifest.json` 为准。
`docs/html/index.html` 可离线打开；它包含完整用户手册和开发手册。

## 校验和加载

解压前，把下面 PACKAGE 改为下载文件的名称（去掉 `.tar.xz`）：

```bash
PACKAGE=sdn-web-v1.0.1
sha256sum -c "$PACKAGE.tar.xz.sha256"
tar -xJf "$PACKAGE.tar.xz"
cd "$PACKAGE"
bash load-images.sh
```

外层 tar.xz 含文档，需要先解压。`load-images.sh` 校验包内文件后，对 `images/*.tar` 执行 docker load；它不启动容器。无需手工创建 Docker manifest.json。

以下首次启动命令均在解压目录、同一个 Bash 终端执行，具备 Docker 操作权限。
镜像版本从本包清单读取：

```bash
SDN_IMAGE="$(python3 -c 'import json; print(json.load(open("manifest.json"))["images"][0]["reference"])')"
```

## 镜像选择

- `alpine/sdn-web:<版本>`：默认，一个容器运行 Nginx 和 Gateway。
- `alpine/sdn-web-ui:<版本>`：可选，独立 Nginx 前端。
- `alpine/sdn-web-gateway:<版本>`：可选，独立 Gateway。

本包没有 Controller/Agent 镜像。下面使用合并镜像，并连接已有 Controller。

## 首次启动 Web

准备 `web.env`，填入 Controller 的实际凭据，并将示例 Controller 地址改为从容器可达的地址。以下环境文件仅首次创建，避免覆盖已有配置：

```bash
set -eu
test ! -e web.env
umask 077
cat > web.env <<'ENV'
SDN_ADMIN_TOKEN=replace-with-controller-admin-token
SDN_VIEWER_TOKEN=replace-with-controller-viewer-token
ENV
```

编辑 web.env 后再执行启动命令；示例 192.0.2.10 是文档地址，需要替换：

```bash
SDN_CONTROLLER=192.0.2.10:29090
docker run -d --name sdn-web-release --restart unless-stopped \
  --env-file web.env -p 28080:8080 \
  "$SDN_IMAGE" -controller "$SDN_CONTROLLER" -insecure
docker logs sdn-web-release
curl --fail http://127.0.0.1:28080/healthz
```

浏览器打开 `http://Web宿主机IP:28080`，使用上述管理员或只读 token 登录，再检查节点列表和实际查询。healthz 成功不代表 Controller 已连通。跨容器不能使用指向自身的 127.0.0.1 作为 Controller 地址。

默认示例使用实验用 insecure gRPC；TLS、反向代理、SSE 与分离部署见 `docs/html/user/deployment.html`、`docker-deploy.html` 和 `release.html`。
分离部署时，UI 与 Gateway 放到同一 Docker 网络，Gateway 使用 DNS 名/网络别名 `gateway` 并监听 18080；只向宿主机发布 UI 的 8080。`deploy/nginx.conf` 是分离部署参考模板；合并镜像中已将 upstream 改成容器内 127.0.0.1:18080，直接运行合并镜像无需额外挂载此模板。

## 停止、数据和升级

停止本页创建的容器：

```bash
docker stop sdn-web-release
```

重新启动使用 `docker start sdn-web-release`，不要再次随机生成凭据。
配置文件、环境文件及命名卷属于部署方，保留在本机，不要重新打包发布。
升级、备份和回退见 `docs/html/user/release.html`；不要通过删除数据卷完成普通停止或升级。
已有容器与新容器不能同时访问同一数据库目录。

包内 `VERIFICATION.md` 只描述该版本实际完成的验证。Controller/Agent 的持久记录不等于删除容器后自动重建全部 Linux 网络状态，业务接口和网络恢复应单独验证。

