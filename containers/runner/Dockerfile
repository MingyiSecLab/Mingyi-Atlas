FROM ubuntu:22.04 AS go-tools

ARG TARGETARCH
ARG NUCLEI_VERSION=v3.7.1
ARG FFUF_VERSION=v2.1.0
ARG SUBFINDER_VERSION=v2.13.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN case "${TARGETARCH}" in \
        amd64) TOOL_ARCH="amd64" ;; \
        arm64) TOOL_ARCH="arm64" ;; \
        *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && mkdir -p /out /tmp/tools \
    && curl -fsSL "https://github.com/projectdiscovery/nuclei/releases/download/${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION#v}_linux_${TOOL_ARCH}.zip" -o /tmp/tools/nuclei.zip \
    && unzip -q /tmp/tools/nuclei.zip -d /tmp/tools/nuclei \
    && install /tmp/tools/nuclei/nuclei /out/nuclei \
    && curl -fsSL "https://github.com/ffuf/ffuf/releases/download/${FFUF_VERSION}/ffuf_${FFUF_VERSION#v}_linux_${TOOL_ARCH}.tar.gz" -o /tmp/tools/ffuf.tar.gz \
    && tar -xzf /tmp/tools/ffuf.tar.gz -C /tmp/tools \
    && install /tmp/tools/ffuf /out/ffuf \
    && curl -fsSL "https://github.com/projectdiscovery/subfinder/releases/download/${SUBFINDER_VERSION}/subfinder_${SUBFINDER_VERSION#v}_linux_${TOOL_ARCH}.zip" -o /tmp/tools/subfinder.zip \
    && unzip -q /tmp/tools/subfinder.zip -d /tmp/tools/subfinder \
    && install /tmp/tools/subfinder/subfinder /out/subfinder

FROM ubuntu:22.04

ARG WPSCAN_UPDATE_DB=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    dnsutils \
    net-tools \
    iputils-ping \
    jq \
    git \
    unzip \
    python3 \
    python3-pip \
    nmap \
    ruby \
    ruby-dev \
    build-essential \
    pkg-config \
    && python3 -m pip install --no-cache-dir sqlmap \
    && gem install wpscan --no-document \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip

RUN set -eux; \
    mv /usr/local/bin/wpscan /usr/local/bin/wpscan-real; \
    mkdir -p /opt/wpscan-home; \
    if [ "$WPSCAN_UPDATE_DB" = "1" ]; then \
      HOME=/opt/wpscan-home /usr/local/bin/wpscan-real --update --no-banner; \
    fi; \
    printf '%s\n' \
      '#!/bin/sh' \
      'set -eu' \
      ': "${HOME:=/tmp}"' \
      'export HOME' \
      'if [ ! -d "$HOME/.wpscan" ] && [ -d /opt/wpscan-home/.wpscan ]; then' \
      '  mkdir -p "$HOME"' \
      '  cp -a /opt/wpscan-home/.wpscan "$HOME/.wpscan"' \
      'fi' \
      'exec /usr/local/bin/wpscan-real "$@"' \
      > /usr/local/bin/wpscan; \
    chmod +x /usr/local/bin/wpscan; \
    rm -rf /root/.wpscan

COPY --from=go-tools /out/nuclei /usr/local/bin/nuclei
COPY --from=go-tools /out/ffuf /usr/local/bin/ffuf
COPY --from=go-tools /out/subfinder /usr/local/bin/subfinder

RUN git clone --depth 1 https://github.com/urbanadventurer/WhatWeb.git /opt/whatweb \
    && rm -rf /opt/whatweb/.git \
    && ln -sf /opt/whatweb/whatweb /usr/local/bin/whatweb \
    && gem install addressable --no-document \
    && rm -rf /var/lib/gems/*/cache/*

RUN git clone --depth 1 https://github.com/epinna/tplmap.git /opt/tplmap \
    && git clone --depth 1 https://github.com/ticarpi/jwt_tool.git /opt/jwt_tool \
    && python3 -m pip install --no-cache-dir PyYAML requests -r /opt/jwt_tool/requirements.txt \
    && printf '%s\n' '#!/bin/sh' 'exec python3 /opt/tplmap/tplmap.py "$@"' > /usr/local/bin/tplmap \
    && printf '%s\n' '#!/bin/sh' 'exec python3 /opt/jwt_tool/jwt_tool.py "$@"' > /usr/local/bin/jwt_tool \
    && chmod +x /usr/local/bin/tplmap /usr/local/bin/jwt_tool \
    && rm -rf /opt/tplmap/.git /opt/jwt_tool/.git /root/.cache/pip

WORKDIR /workspace
