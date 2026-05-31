# Runner Image

这个目录存放渗透测试 runner 镜像定义。

## 用途

镜像提供任务运行时需要的基础 CLI 工具，供 `RunnerService` 以 `docker run` / `docker exec` 的方式调用。

当前镜像包含：

- `nuclei`
- `ffuf`
- `subfinder`
- `whatweb`
- `sqlmap`
- `wpscan`
- `tplmap`
- `jwt_tool`
- `nmap`

## 构建

在仓库根目录执行：

```bash
docker build -t pentest-runner:latest -f containers/runner/Dockerfile .
```

或使用 Makefile：

```bash
make runner
```

## 可调版本

构建时可以覆盖这些参数：

```bash
docker build \
  --build-arg NUCLEI_VERSION=v3.7.1 \
  --build-arg FFUF_VERSION=v2.1.0 \
  --build-arg SUBFINDER_VERSION=v2.13.0 \
  --build-arg WPSCAN_UPDATE_DB=1 \
  -t pentest-runner:latest \
  -f containers/runner/Dockerfile .
```

`WPSCAN_UPDATE_DB` 控制是否在镜像构建阶段预更新 WPScan 数据库：

- `WPSCAN_UPDATE_DB=1`：默认值。构建镜像时执行 `wpscan --update`，把数据库预置到 `/opt/wpscan-home/.wpscan`。
- `WPSCAN_UPDATE_DB=0`：跳过构建期数据库更新，适合无网络、离线构建或只想快速构建基础工具镜像的环境。

使用 Makefile 时可以这样覆盖：

```bash
make runner WPSCAN_UPDATE_DB=0
```

运行时应用侧仍会给 WPScan 自动追加 `--no-update`，避免 benchmark 或工具调用过程中卡在外部数据库下载。镜像内的 `wpscan` wrapper 会在启动时把预置数据库从 `/opt/wpscan-home/.wpscan` 复制到可写的 `$HOME/.wpscan`，配合只读根文件系统和 `HOME=/tmp` 使用。

## 约定

- 容器工作目录为 `/workspace`
- 任务 workspace 会挂载到 `/workspace`
- 应用侧通过 `.env` 里的 `RUNNER_IMAGE` 指向这个镜像标签
- 应用侧以只读根文件系统运行容器，并把 `HOME` / XDG cache/config 指向 `/tmp`，用于兼容 `wpscan` 等需要初始化本地缓存目录的工具
