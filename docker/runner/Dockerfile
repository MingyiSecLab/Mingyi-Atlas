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
    && python3 -m pip install --no-cache-dir sqlmap \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip

COPY --from=go-tools /out/nuclei /usr/local/bin/nuclei
COPY --from=go-tools /out/ffuf /usr/local/bin/ffuf
COPY --from=go-tools /out/subfinder /usr/local/bin/subfinder

RUN git clone --depth 1 https://github.com/urbanadventurer/WhatWeb.git /opt/whatweb \
    && rm -rf /opt/whatweb/.git \
    && ln -sf /opt/whatweb/whatweb /usr/local/bin/whatweb \
    && gem install addressable --no-document \
    && rm -rf /var/lib/gems/*/cache/*

WORKDIR /workspace
