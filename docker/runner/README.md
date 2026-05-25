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
- `nmap`

## 构建

在仓库根目录执行：

```bash
docker build -t pentest-runner:latest -f docker/runner/Dockerfile .
```

## 可调版本

构建时可以覆盖这些参数：

```bash
docker build \
  --build-arg NUCLEI_VERSION=v3.7.1 \
  --build-arg FFUF_VERSION=v2.1.0 \
  --build-arg SUBFINDER_VERSION=v2.13.0 \
  -t pentest-runner:latest \
  -f docker/runner/Dockerfile .
```

## 约定

- 容器工作目录为 `/workspace`
- 任务 workspace 会挂载到 `/workspace`
- 应用侧通过 `.env` 里的 `RUNNER_IMAGE` 指向这个镜像标签
