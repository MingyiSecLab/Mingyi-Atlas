FROM mcr.microsoft.com/playwright:latest

# 安装 CLI 工具并补装 chrome-for-testing
RUN npm install -g @playwright/cli@latest \
    && playwright-cli install-browser chrome-for-testing

WORKDIR /workspace

ENTRYPOINT ["playwright-cli"]