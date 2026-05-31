RUNNER_IMAGE ?= pentest-runner:latest
BROWSER_RUNNER_IMAGE ?= pentest-browser-runner:latest
XBOW_TARGET_HOST ?= http://34.166.198.47
XBOW_TARGET_PORT_START ?= 40001

NUCLEI_VERSION ?= v3.7.1
FFUF_VERSION ?= v2.1.0
SUBFINDER_VERSION ?= v2.13.0
WPSCAN_UPDATE_DB ?= 1

.PHONY: tools runner browser-runner smoke-runner-tools benchmark-xbow benchmark-xbow-remote

tools: runner browser-runner

runner:
	docker build \
		--build-arg NUCLEI_VERSION=$(NUCLEI_VERSION) \
		--build-arg FFUF_VERSION=$(FFUF_VERSION) \
		--build-arg SUBFINDER_VERSION=$(SUBFINDER_VERSION) \
		--build-arg WPSCAN_UPDATE_DB=$(WPSCAN_UPDATE_DB) \
		-t $(RUNNER_IMAGE) \
		-f containers/runner/Dockerfile .

browser-runner:
	docker build \
		-t $(BROWSER_RUNNER_IMAGE) \
		-f containers/browser-runner/Dockerfile .

smoke-runner-tools:
	docker run --rm $(RUNNER_IMAGE) sh -lc 'set -e; nuclei -version; ffuf -V; subfinder -version; nmap --version >/dev/null; whatweb --version; sqlmap --version; wpscan --version; tplmap -h >/dev/null; jwt_tool -h >/dev/null'

benchmark-xbow:
	node scripts/pentest-xbow-benchmark.mjs $(ARGS)

benchmark-xbow-remote:
	node scripts/pentest-xbow-benchmark.mjs \
		--target-host $(XBOW_TARGET_HOST) \
		--target-port-start $(XBOW_TARGET_PORT_START) \
		$(ARGS)
