# sdn-web 文档系统

要编译和安装 **sdn-web 应用**，阅读[源码安装部署](user/source-install.rst)或[Docker 部署](user/docker-deploy.rst)；准备发布包、镜像及升级回滚见[发布指南](user/release.rst)。本页的 `html` / `clean` 只构建和清理手册。

用户手册与开发手册使用 Sphinx，内容组织和命令约定与 `sdn-agent` 对齐，阅读样式沿用原有 `route-ovs/docs` 参考。每个项目的构建配置、模板、静态资源和内容均独立维护，构建不依赖其他项目的文档目录或生成产物。

- [用户指南源文件](user/index.rst)
- [开发指南源文件](developer/index.rst)
- [页面、资源和 API 扩展流程](developer/extensions.rst)
- 现有 `.md` 设计记录、协议说明和验收报告保留在此目录。

## 查看帮助

在 `docs/` 目录执行 `make help`，或在项目根目录执行：

```bash
make -C docs help
```

帮助不需要 Sphinx 或 Python。默认目标仍为 `html`；`make -C docs` 会构建文档。

## 构建 HTML

Linux/macOS，Python 3.10+、GNU Make。在项目根目录运行：

```bash
python3 -m venv .venv-docs
. .venv-docs/bin/activate
python -m pip install -r docs/requirements.txt
make -C docs html
```

Windows 可使用 Python，省去 Make：

```powershell
py -m venv .venv-docs
.venv-docs\Scripts\python.exe -m pip install -r docs/requirements.txt
.venv-docs\Scripts\python.exe -m sphinx -W --keep-going -n -a -b html docs docs/html
```

打开 `docs/html/index.html`。两类手册分别在 `docs/html/user/index.html` 和 `docs/html/developer/index.html`。发布时复制整个 `html/`，不能只复制单个页面。搜索、样式和脚本均使用本地静态资源。

## 清理

```bash
make -C docs clean
```

Windows 等价命令：

```powershell
py docs/_scripts/clean.py
```

只删除本项目文档构建产物 `docs/html/` 和 `docs/_build/`；不会清除源码、图片、Markdown 文档、应用数据、容器或虚拟环境。脚本拒绝清理指向外部路径的符号链接。

## 编辑规则

新增页面放入 `user/` 或 `developer/`，并加入所属 `index.rst` 的 toctree。页面内链接使用 Sphinx 的 `:doc:` 或 `:ref:`，截图放在 `_static/images/`。代码示例写明运行位置，令牌使用占位符。

`html` 构建默认开启严格引用检查，任何 Sphinx 警告都会使命令失败。此文档系统提供 `help`、`html`、`clean` 三个 Make 目标，不包含 PDF 或自动版本归档。独立文档包的手工制作和预览见[发布指南](user/release.rst)。
