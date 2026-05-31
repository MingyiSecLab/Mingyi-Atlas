# Browser Runner Image

这个目录存放浏览器 runner 镜像定义。

## 用途

镜像提供浏览器运行时，既可以直接作为 CLI 使用，也可以作为长驻浏览器容器使用，例如：

- `playwright-cli open`
- `playwright-cli click`
- `playwright-cli fill`
- 多步登录、会话保持、页面导航

## 直接 CLI 使用

镜像默认 entrypoint 是：

```bash
playwright-cli
```

因此可以直接这样跑一次性命令：

```bash
docker run --rm -v "$(pwd):/workspace" -w /workspace pentest-browser-runner:latest open https://example.com --browser=chromium
```

## 长驻容器使用

应用侧的 `run_browser_cli` 工具会为每个任务启动一个长驻浏览器容器，覆盖默认 entrypoint 为 `sleep infinity`，再通过 `docker exec` 进入容器执行多步 `playwright-cli` 命令。任务结束时调用 `action=close` 销毁该容器。

这样可以保留：

- 浏览器 session
- cookie
- 页面状态
- 多步交互上下文

示例：

```bash
docker run -d --name mastracode-browser-task1 --entrypoint sleep pentest-browser-runner:latest infinity
docker exec mastracode-browser-task1 playwright-cli open https://example.com --browser=chromium
docker exec mastracode-browser-task1 playwright-cli snapshot
docker rm -f mastracode-browser-task1
```

## 构建

在仓库根目录执行：

```bash
docker build -t pentest-browser-runner:latest -f containers/browser-runner/Dockerfile .
```

## 约定

- 容器工作目录为 `/workspace`
- 任务 workspace 会挂载到 `/workspace`
- 应用侧可以通过 `.env` 中的 `BROWSER_RUNNER_IMAGE` 指向这个镜像标签
