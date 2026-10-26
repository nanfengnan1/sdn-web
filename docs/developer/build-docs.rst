维护用户与开发文档
==================

文档内容组织和命令约定与 ``sdn-agent`` 对齐，阅读样式保留原有 ``route-ovs/docs`` 参考。
配置与资源独立保存在本项目，构建不依赖其他项目文档目录或生成的 HTML。

目录结构
--------

.. code-block:: text

   docs/
     Makefile               help, html (default), clean
     requirements.txt       pinned Sphinx/theme
     conf.py                Chinese documentation configuration
     index.rst              home
     user/                  task-based usage guides
     developer/             architecture, contract and development
     _static/               local styles, scripts and screenshots
     _templates/            reading layout
     _scripts/clean.py      confined generated-output cleanup
     html/                  generated site, not source

原有 Markdown 设计记录、HTTP 说明和验收报告保留。Sphinx 正式阅读入口按 ``user`` 和 ``developer`` 两类组织；如引用旧记录，用下载链接或说明其项目相对路径，避免 HTML 中失效的仓库相对链接。

构建与清理
----------

在 ``docs/`` 内执行 ``make help``，或在项目根目录执行 ``make -C docs help``。
帮助只需要 Make 和 shell，不需要安装 Sphinx；默认 ``make -C docs`` 仍构建 HTML。

Python 3.10+ 与 GNU Make 环境下，在项目根目录执行：

.. code-block:: bash

   python3 -m venv .venv-docs
   . .venv-docs/bin/activate
   python -m pip install -r docs/requirements.txt
   make -C docs html

打开 ``docs/html/index.html``，两类手册分别位于 ``docs/html/user/index.html`` 和 ``docs/html/developer/index.html``。发布时复制整个 ``html/``，包含本地 CSS、JS、图片和搜索资源。

.. code-block:: bash

   make -C docs clean

``clean`` 只删除本项目文档 ``html/`` 和 ``_build/``。它不删除文档源、图片、Markdown 记录、虚拟环境、应用数据库或 Docker 资源。文档 Makefile 提供 help、html、clean，不提供 PDF 或自动版本归档。
手工归档整个 HTML 目录见 :doc:`/user/release`。

可以覆盖 ``SPHINXBUILD``、``SPHINXOPTS`` 和 ``PYTHON``，例如在未激活虚拟环境时执行
``make -C docs html SPHINXBUILD=../.venv-docs/bin/sphinx-build``。

Windows 可直接调用 Python：

.. code-block:: powershell

   py -m venv .venv-docs
   .venv-docs\Scripts\python.exe -m pip install -r docs/requirements.txt
   .venv-docs\Scripts\python.exe -m sphinx -W --keep-going -n -a -b html docs docs/html
   py docs/_scripts/clean.py

写作与审核
----------

1. 新页面放在 ``user/`` 或 ``developer/``，加入所属 ``index.rst`` 的 toctree。
2. 用户页按照任务写：准备条件、入口/按钮、步骤、成功标志、失败后下一步。按钮名称应与真实 UI 一致。
3. 开发页以实际源码和协议为依据，区分已实现功能与后续计划。新增 HTTP 能力同步 :doc:`http-api`。
4. 页面链接用 ``:doc:`` 或 ``:ref:``，截图放 ``_static/images/``；附上 alt 和说明。
5. 命令写明执行目录和环境，令牌用占位符，截图不包含凭据。状态截图标明采集时点，不让旧 UUID 成为配置模板。
6. 运行严格 HTML 构建，检查中文导航、代码块、表格、图示和搜索。警告视为失败，需要修复而不是关闭检查。

更改职责、HTTP 路由或字段时，同步架构、契约、扩展流程和用户操作页；更改构建产物、
镜像 target 或启动参数时，同步源码安装、Docker 部署和发布页。README 链接到已提交的
``.rst`` 源文件，保证尚未构建 HTML 的仓库读者也能找到文档。

与网络功能测试的边界
--------------------

文档改动使用 Sphinx 构建和页面检查即可。只有代码或测试本身发生需要验证的行为变更时，再在专用环境运行相应源码/网络测试。构建文档和 ``clean`` 不应启动、重配或清空用户正在手测的网络。
