---
name: nuclei
description: "Nuclei CLI parameter reference and usage patterns - YAML-template vulnerability scanning, target input modes, template filters, output formats, rate limits, ProjectDiscovery dashboard upload, and common scan commands."
allowed-tools: Bash Read
metadata:
  subdomain: shared-tool-params
  when_to_use: "nuclei, nuclei scanner, vulnerability scan, template scan, nuclei templates, projectdiscovery, yaml templates, cve scan, dast, oast, interactsh"
  tags: nuclei, projectdiscovery, vulnerability-scanning, templates, yaml, cve, dast, oast
---

# nuclei

Nuclei is a modern, high-performance vulnerability scanner that uses simple YAML-based templates. It helps design custom vulnerability detection scenarios that mimic real-world conditions, reducing false positives by verifying vulnerabilities with realistic steps.

Use this reference when constructing or reviewing `nuclei` commands. The flags below are expanded from `nuclei -h`.

## Capabilities

- Simple YAML format for creating and customizing vulnerability templates.
- Community-contributed templates for trending vulnerabilities.
- Real-world verification flows to reduce false positives.
- Ultra-fast parallel scan processing and request clustering.
- CI/CD integration for vulnerability detection and regression testing.
- Multiple protocol support, including TCP, DNS, HTTP, SSL, WHOIS, JavaScript, Code, and more.
- Integrations with Jira, Splunk, GitHub, Elastic, GitLab, ProjectDiscovery Cloud, APIs, and webhooks.

## Table of Contents

- Get Started
- Installation
- Command Line Flags
- Common Command Combinations
- Single Target Scan
- Scanning Multiple Targets
- Network Scan
- Scanning With a Custom Template
- Connect Nuclei to ProjectDiscovery
- Nuclei Templates and Community
- Template Use Cases

## Get Started

Install Nuclei locally for CLI scanning, or use the ProjectDiscovery cloud tier to store and visualize findings, manage templates, access the latest nuclei templates, and discover/store targets.

Important notes:

- Nuclei is in active development. Review release changelogs before updating because breaking changes can occur.
- Nuclei is primarily built as a standalone CLI tool. Running it as a service can introduce security risks and should be done with additional controls.
- Pro and Enterprise editions are available for teams that need large-scale scans, cloud integrations, Jira/Slack/Linear/API/webhook workflows, executive and compliance reporting, SAML SSO, SOC 2 compliance, regional hosting, and shared workspaces.

## Installation

Nuclei requires Go `>= 1.24.2` for source installation:

```bash
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
```

Installation docs: <https://docs.projectdiscovery.io/tools/nuclei/install>

## Usage

```bash
nuclei [flags]
./nuclei [flags]
```

## Common Command Combinations

Quick, findings-only scan:

```bash
nuclei -u https://example.com -silent
```

High-signal scan for serious findings:

```bash
nuclei -u https://example.com -severity high,critical -silent
```

Scan a target list and write JSONL output:

```bash
nuclei -l urls.txt -jsonl -o nuclei_findings.jsonl
```

Scan only selected tags:

```bash
nuclei -u https://example.com -tags cve,exposure,misconfig
```

Exclude noisy severities or tags:

```bash
nuclei -l urls.txt -es info,low -etags intrusive,dos
```

Run specific template paths:

```bash
nuclei -u https://example.com -t http/cves/ -t ssl/
```

Run a specific template ID or wildcard:

```bash
nuclei -u https://example.com -id cves/2021/CVE-2021-44228
nuclei -u https://example.com -id '*jenkins*'
```

Use authenticated headers:

```bash
nuclei -u https://example.com -H 'Authorization: Bearer <TOKEN>' -H 'Cookie: session=<VALUE>'
```

Use variables consumed by templates:

```bash
nuclei -u https://example.com -V username=admin -V password='<PASSWORD>'
```

Throttle scans for fragile or shared environments:

```bash
nuclei -l urls.txt -rl 20 -c 10 -bs 10 -timeout 15 -retries 2
```

Route traffic through a proxy:

```bash
nuclei -u https://example.com -proxy http://127.0.0.1:8080
```

Store evidence and redact sensitive keys:

```bash
nuclei -u https://example.com -jsonl -o findings.jsonl -sresp -srd nuclei_evidence -rd token,authorization,cookie
```

Export reports:

```bash
nuclei -l urls.txt -me nuclei_report/
nuclei -l urls.txt -se nuclei.sarif
nuclei -l urls.txt -je nuclei.json
```

Upload findings to ProjectDiscovery Cloud dashboard:

```bash
nuclei -l urls.txt -dashboard
```

Update engine and templates:

```bash
nuclei -update
nuclei -update-templates
```

Validate custom templates before running:

```bash
nuclei -validate -t /path/to/templates/
```

Use DAST fuzzing templates with a scoped target:

```bash
nuclei -u https://example.com -dast -fuzz-scope '^https://example\.com/' -fa low
```

## Target

| Flag | Description |
| --- | --- |
| `-u`, `-target string[]` | Target URLs/hosts to scan. |
| `-l`, `-list string` | Path to file containing target URLs/hosts to scan, one per line. |
| `-eh`, `-exclude-hosts string[]` | Hosts to exclude from the input list: IP, CIDR, hostname. |
| `-resume string` | Resume scan from and save to the specified file. Clustering is disabled. |
| `-sa`, `-scan-all-ips` | Scan all IPs associated with a DNS record. |
| `-iv`, `-ip-version string[]` | IP version to scan for hostname: `4`, `6`. Default: `4`. |

## Target Format

| Flag | Description |
| --- | --- |
| `-im`, `-input-mode string` | Input file mode: `list`, `burp`, `jsonl`, `yaml`, `openapi`, `swagger`. Default: `list`. |
| `-ro`, `-required-only` | Use only required fields in input format when generating requests. |
| `-sfv`, `-skip-format-validation` | Skip format validation, such as missing vars, when parsing input file. |

## Templates

| Flag | Description |
| --- | --- |
| `-nt`, `-new-templates` | Run only new templates added in the latest `nuclei-templates` release. |
| `-ntv`, `-new-templates-version string[]` | Run new templates added in a specific version. |
| `-as`, `-automatic-scan` | Automatic web scan using Wappalyzer technology detection to tags mapping. |
| `-t`, `-templates string[]` | Template file or directory to run. Supports comma-separated values and file input. |
| `-turl`, `-template-url string[]` | Template URL or list containing template URLs to run. Supports comma-separated values and file input. |
| `-ai`, `-prompt string` | Generate and run a template using an AI prompt. |
| `-w`, `-workflows string[]` | Workflow file or directory to run. Supports comma-separated values and file input. |
| `-wurl`, `-workflow-url string[]` | Workflow URL or list containing workflow URLs to run. Supports comma-separated values and file input. |
| `-validate` | Validate the passed templates. |
| `-nss`, `-no-strict-syntax` | Disable strict syntax check on templates. |
| `-td`, `-template-display` | Display template content. |
| `-tl` | List all templates matching current filters. |
| `-tgl` | List all available tags. |
| `-sign` | Sign templates with private key from `NUCLEI_SIGNATURE_PRIVATE_KEY`. |
| `-code` | Enable loading code protocol-based templates. |
| `-dut`, `-disable-unsigned-templates` | Disable running unsigned templates or templates with mismatched signature. |
| `-esc`, `-enable-self-contained` | Enable loading self-contained templates. |
| `-egm`, `-enable-global-matchers` | Enable loading global matchers templates. |
| `-file` | Enable loading file templates. |

## Filtering

| Flag | Description |
| --- | --- |
| `-a`, `-author string[]` | Run templates by author. Supports comma-separated values and file input. |
| `-tags string[]` | Run templates by tags. Supports comma-separated values and file input. |
| `-etags`, `-exclude-tags string[]` | Exclude templates by tags. Supports comma-separated values and file input. |
| `-itags`, `-include-tags string[]` | Execute tags even if they are excluded by default or configuration. |
| `-id`, `-template-id string[]` | Run templates by template IDs. Supports comma-separated values, file input, and wildcards. |
| `-eid`, `-exclude-id string[]` | Exclude templates by template IDs. Supports comma-separated values and file input. |
| `-it`, `-include-templates string[]` | Template file or directory to execute even if excluded by default or configuration. |
| `-et`, `-exclude-templates string[]` | Template file or directory to exclude. Supports comma-separated values and file input. |
| `-em`, `-exclude-matchers string[]` | Template matchers to exclude in results. |
| `-s`, `-severity value[]` | Run templates by severity: `info`, `low`, `medium`, `high`, `critical`, `unknown`. |
| `-es`, `-exclude-severity value[]` | Exclude templates by severity: `info`, `low`, `medium`, `high`, `critical`, `unknown`. |
| `-pt`, `-type value[]` | Run templates by protocol type: `dns`, `file`, `http`, `headless`, `tcp`, `workflow`, `ssl`, `websocket`, `whois`, `code`, `javascript`. |
| `-ept`, `-exclude-type value[]` | Exclude templates by protocol type: `dns`, `file`, `http`, `headless`, `tcp`, `workflow`, `ssl`, `websocket`, `whois`, `code`, `javascript`. |
| `-tc`, `-template-condition string[]` | Run templates by expression condition. |

## Output

| Flag | Description |
| --- | --- |
| `-o`, `-output string` | Output file to write found issues/vulnerabilities. |
| `-sresp`, `-store-resp` | Store all requests/responses passed through nuclei to output directory. |
| `-srd`, `-store-resp-dir string` | Store all requests/responses to a custom directory. Default: `output`. |
| `-silent` | Display findings only. |
| `-nc`, `-no-color` | Disable ANSI color output. |
| `-j`, `-jsonl` | Write output in JSON Lines format. |
| `-irr`, `-include-rr -omit-raw` | Include request/response pairs in JSON, JSONL, and Markdown outputs for findings only. Deprecated; use `-omit-raw`. Default: `true`. |
| `-or`, `-omit-raw` | Omit request/response pairs in JSON, JSONL, and Markdown outputs for findings only. |
| `-ot`, `-omit-template` | Omit encoded template in JSON and JSONL output. |
| `-nm`, `-no-meta` | Disable printing result metadata in CLI output. |
| `-ts`, `-timestamp` | Enable printing timestamp in CLI output. |
| `-rdb`, `-report-db string` | Nuclei reporting database. Always use this to persist report data. |
| `-ms`, `-matcher-status` | Display match failure status. |
| `-me`, `-markdown-export string` | Directory to export results in Markdown format. |
| `-se`, `-sarif-export string` | File to export results in SARIF format. |
| `-je`, `-json-export string` | File to export results in JSON format. |
| `-jle`, `-jsonl-export string` | File to export results in JSON Lines format. |
| `-rd`, `-redact string[]` | Redact keys from query parameters, request headers, and body. |

## Configurations

| Flag | Description |
| --- | --- |
| `-config string` | Path to nuclei configuration file. |
| `-tp`, `-profile string` | Template profile config file to run. |
| `-tpl`, `-profile-list` | List community template profiles. |
| `-fr`, `-follow-redirects` | Enable following redirects for HTTP templates. |
| `-fhr`, `-follow-host-redirects` | Follow redirects on the same host. |
| `-mr`, `-max-redirects int` | Maximum redirects to follow for HTTP templates. Default: `10`. |
| `-dr`, `-disable-redirects` | Disable redirects for HTTP templates. |
| `-rc`, `-report-config string` | Nuclei reporting module configuration file. |
| `-H`, `-header string[]` | Custom header/cookie for all HTTP requests in `header:value` format. Supports CLI and file input. |
| `-V`, `-var value` | Custom vars in `key=value` format. |
| `-r`, `-resolvers string` | File containing resolver list for nuclei. |
| `-sr`, `-system-resolvers` | Use system DNS resolving as error fallback. |
| `-dc`, `-disable-clustering` | Disable request clustering. |
| `-passive` | Enable passive HTTP response processing mode. |
| `-fh2`, `-force-http2` | Force HTTP/2 connection on requests. |
| `-ev`, `-env-vars` | Enable environment variables in templates. |
| `-cc`, `-client-cert string` | PEM client certificate file for authenticating against scanned hosts. |
| `-ck`, `-client-key string` | PEM client key file for authenticating against scanned hosts. |
| `-ca`, `-client-ca string` | PEM client certificate authority file for authenticating against scanned hosts. |
| `-sml`, `-show-match-line` | Show match lines for file templates. Works with extractors only. |
| `-ztls` | Use ztls library with autofallback to standard one for TLS 1.3. Deprecated; autofallback to ztls is enabled by default. |
| `-sni string` | TLS SNI hostname to use. Default: input domain name. |
| `-dka`, `-dialer-keep-alive value` | Keep-alive duration for network requests. |
| `-lfa`, `-allow-local-file-access` | Allow file payload access anywhere on the system. |
| `-lna`, `-restrict-local-network-access` | Block connections to local/private networks. |
| `-i`, `-interface string` | Network interface to use for network scan. |
| `-at`, `-attack-type string` | Payload combination type: `batteringram`, `pitchfork`, `clusterbomb`. |
| `-sip`, `-source-ip string` | Source IP address to use for network scan. |
| `-rsr`, `-response-size-read int` | Maximum response size to read, in bytes. |
| `-rss`, `-response-size-save int` | Maximum response size to save, in bytes. Default: `1048576`. |
| `-reset` | Remove all nuclei configuration and data files, including `nuclei-templates`. |
| `-tlsi`, `-tls-impersonate` | Enable experimental ClientHello/JA3 TLS randomization. |
| `-hae`, `-http-api-endpoint string` | Experimental HTTP API endpoint. |

## Interactsh

| Flag | Description |
| --- | --- |
| `-iserver`, `-interactsh-server string` | Interactsh server URL for self-hosted instance. Default: `oast.pro,oast.live,oast.site,oast.online,oast.fun,oast.me`. |
| `-itoken`, `-interactsh-token string` | Authentication token for self-hosted Interactsh server. |
| `-interactions-cache-size int` | Number of requests to keep in the interactions cache. Default: `5000`. |
| `-interactions-eviction int` | Seconds to wait before evicting requests from cache. Default: `60`. |
| `-interactions-poll-duration int` | Seconds to wait before each interaction poll request. Default: `5`. |
| `-interactions-cooldown-period int` | Extra time for interaction polling before exiting. Default: `5`. |
| `-ni`, `-no-interactsh` | Disable Interactsh server for OAST testing and exclude OAST-based templates. |

## Fuzzing

| Flag | Description |
| --- | --- |
| `-ft`, `-fuzzing-type string` | Override fuzzing type set in template: `replace`, `prefix`, `postfix`, `infix`. |
| `-fm`, `-fuzzing-mode string` | Override fuzzing mode set in template: `multiple`, `single`. |
| `-fuzz` | Enable loading fuzzing templates. Deprecated; use `-dast`. |
| `-dast` | Enable/run DAST fuzz templates. |
| `-dts`, `-dast-server` | Enable DAST server mode for live fuzzing. |
| `-dtr`, `-dast-report` | Write DAST scan report to file. |
| `-dtst`, `-dast-server-token string` | DAST server token. Optional. |
| `-dtsa`, `-dast-server-address string` | DAST server address. Default: `localhost:9055`. |
| `-dfp`, `-display-fuzz-points` | Display fuzz points in output for debugging. |
| `-fuzz-param-frequency int` | Frequency of uninteresting parameters before skipping. Default: `10`. |
| `-fa`, `-fuzz-aggression string` | Fuzzing aggression level controlling payload count: `low`, `medium`, `high`. Default: `low`. |
| `-cs`, `-fuzz-scope string[]` | In-scope URL regex followed by the fuzzer. |
| `-cos`, `-fuzz-out-scope string[]` | Out-of-scope URL regex excluded by the fuzzer. |

## Uncover

| Flag | Description |
| --- | --- |
| `-uc`, `-uncover` | Enable uncover engine. |
| `-uq`, `-uncover-query string[]` | Uncover search query. |
| `-ue`, `-uncover-engine string[]` | Uncover search engine: `shodan`, `censys`, `fofa`, `shodan-idb`, `quake`, `hunter`, `zoomeye`, `netlas`, `criminalip`, `publicwww`, `hunterhow`, `google`. Default: `shodan`. |
| `-uf`, `-uncover-field string` | Fields to return: `ip`, `port`, `host`. Default: `ip:port`. |
| `-ul`, `-uncover-limit int` | Number of uncover results to return. Default: `100`. |
| `-ur`, `-uncover-ratelimit int` | Override rate limit of engines with unknown rate limit. Default: `60 req/min`. |

## Rate Limit

| Flag | Description |
| --- | --- |
| `-rl`, `-rate-limit int` | Maximum requests per second. Default: `150`. |
| `-rld`, `-rate-limit-duration value` | Rate-limit duration window. Default: `1s`. |
| `-rlm`, `-rate-limit-minute int` | Maximum requests per minute. Deprecated. |
| `-bs`, `-bulk-size int` | Maximum hosts analyzed in parallel per template. Default: `25`. |
| `-c`, `-concurrency int` | Maximum templates executed in parallel. Default: `25`. |
| `-hbs`, `-headless-bulk-size int` | Maximum headless hosts analyzed in parallel per template. Default: `10`. |
| `-headc`, `-headless-concurrency int` | Maximum headless templates executed in parallel. Default: `10`. |
| `-jsc`, `-js-concurrency int` | Maximum JavaScript runtimes executed in parallel. Default: `120`. |
| `-pc`, `-payload-concurrency int` | Maximum payload concurrency for each template. Default: `25`. |
| `-prc`, `-probe-concurrency int` | HTTP probe concurrency with httpx. Default: `50`. |
| `-tlc`, `-template-loading-concurrency int` | Maximum concurrent template loading operations. Default: `50`. |

## Optimizations

| Flag | Description |
| --- | --- |
| `-timeout int` | Timeout in seconds. Default: `10`. |
| `-retries int` | Retry count for failed requests. Default: `1`. |
| `-ldp`, `-leave-default-ports` | Leave default HTTP/HTTPS ports, such as `host:80` and `host:443`. |
| `-mhe`, `-max-host-error int` | Maximum errors for a host before skipping scan. Default: `30`. |
| `-te`, `-track-error string[]` | Add errors to the max-host-error watchlist. Supports standard and file input. |
| `-nmhe`, `-no-mhe` | Disable skipping host based on errors. |
| `-project` | Use a project folder to avoid sending the same request multiple times. |
| `-project-path string` | Set project path. Default: `/tmp`. |
| `-spm`, `-stop-at-first-match` | Stop processing HTTP requests after first match. May break template/workflow logic. |
| `-stream` | Stream mode: start processing without sorting input. |
| `-ss`, `-scan-strategy value` | Scan strategy: `auto`, `host-spray`, `template-spray`. Default: `auto`. |
| `-irt`, `-input-read-timeout value` | Timeout on input read. Default: `3m0s`. |
| `-nh`, `-no-httpx` | Disable httpx probing for non-URL input. |
| `-no-stdin` | Disable stdin processing. |

## Headless

| Flag | Description |
| --- | --- |
| `-headless` | Enable templates that require headless browser support. Root user on Linux disables sandbox. |
| `-page-timeout int` | Seconds to wait for each page in headless mode. Default: `20`. |
| `-sb`, `-show-browser` | Show the browser on screen when running headless templates. |
| `-ho`, `-headless-options string[]` | Start headless Chrome with additional options. |
| `-sc`, `-system-chrome` | Use locally installed Chrome instead of nuclei-installed Chrome. |
| `-cdpe`, `-cdp-endpoint string` | Use remote browser via Chrome DevTools Protocol endpoint. |
| `-lha`, `-list-headless-action` | List available headless actions. |

## Debug

| Flag | Description |
| --- | --- |
| `-debug` | Show all requests and responses. |
| `-dreq`, `-debug-req` | Show all sent requests. |
| `-dresp`, `-debug-resp` | Show all received responses. |
| `-p`, `-proxy string[]` | HTTP/SOCKS5 proxy list. Supports comma-separated values or file input. |
| `-pi`, `-proxy-internal` | Proxy all internal requests. |
| `-ldf`, `-list-dsl-function` | List supported DSL function signatures. |
| `-tlog`, `-trace-log string` | File to write sent request trace log. |
| `-elog`, `-error-log string` | File to write sent request error log. |
| `-version` | Show nuclei version. |
| `-hm`, `-hang-monitor` | Enable nuclei hang monitoring. |
| `-v`, `-verbose` | Show verbose output. |
| `-profile-mem string` | Generate memory heap profile and trace files. |
| `-vv` | Display templates loaded for scan. |
| `-svd`, `-show-var-dump` | Show variables dump for debugging. |
| `-vdl`, `-var-dump-limit int` | Limit number of characters in variable dump. Default: `255`. |
| `-ep`, `-enable-pprof` | Enable pprof debugging server. |
| `-tv`, `-templates-version` | Show installed `nuclei-templates` version. |
| `-hc`, `-health-check` | Run diagnostic check up. |

## Update

| Flag | Description |
| --- | --- |
| `-up`, `-update` | Update nuclei engine to latest released version. |
| `-ut`, `-update-templates` | Update `nuclei-templates` to latest released version. |
| `-ud`, `-update-template-dir string` | Custom directory to install/update `nuclei-templates`. |
| `-duc`, `-disable-update-check` | Disable automatic nuclei/templates update check. |

## Honeypot

| Flag | Description |
| --- | --- |
| `-hpd`, `-honeypot-detect` | Detect potential honeypot hosts based on match concentration. |
| `-hpt`, `-honeypot-threshold int` | Distinct template IDs required to flag a honeypot host. Default: `15`. |
| `-shp`, `-suppress-honeypot` | Suppress output for flagged honeypot hosts. |

## Statistics

| Flag | Description |
| --- | --- |
| `-stats` | Display statistics about running scan. |
| `-sj`, `-stats-json` | Display statistics in JSON Lines format. |
| `-si`, `-stats-interval int` | Seconds between statistics updates. Default: `5`. |
| `-mp`, `-metrics-port int` | Port to expose nuclei metrics on. Default: `9092`. |
| `-hps`, `-http-stats` | Enable HTTP status capturing. Experimental. |

## Cloud

| Flag | Description |
| --- | --- |
| `-auth` | Configure ProjectDiscovery Cloud API key. Default: `true`. |
| `-tid`, `-team-id string` | Upload scan results to given team ID. Optional. Default: `none`. |
| `-cup`, `-cloud-upload` | Upload scan results to ProjectDiscovery Cloud dashboard. Deprecated; use `-dashboard`. |
| `-sid`, `-scan-id string` | Upload scan results to existing scan ID. Optional. |
| `-sname`, `-scan-name string` | Scan name to set. Optional. |
| `-pd`, `-dashboard` | Upload/view nuclei results in ProjectDiscovery Cloud dashboard. |
| `-pdu`, `-dashboard-upload string` | Upload/view nuclei results file, JSONL, in ProjectDiscovery Cloud dashboard. |

## Authentication

| Flag | Description |
| --- | --- |
| `-sf`, `-secret-file string[]` | Path to config file containing secrets for authenticated scan. |
| `-ps`, `-prefetch-secrets` | Prefetch secrets from secrets file. |

Headers in secrets files preserve exact casing, which is useful for case-sensitive APIs.

## Examples

Run nuclei on a single host:

```bash
nuclei -target example.com
```

Run nuclei with specific template directories:

```bash
nuclei -target example.com -t http/cves/ -t ssl
```

Run nuclei against a list of hosts:

```bash
nuclei -list hosts.txt
```

Run nuclei with JSON output:

```bash
nuclei -target example.com -json-export output.json
```

Run nuclei with sorted Markdown output using environment variables:

```bash
MARKDOWN_EXPORT_SORT_MODE=template nuclei -target example.com -markdown-export nuclei_report/
```

## Single Target Scan

Perform a quick scan against one web application:

```bash
nuclei -target https://example.com
```

## Scanning Multiple Targets

Provide a file containing multiple URLs or hosts:

```bash
nuclei -list urls.txt
```

## Network Scan

Scan an entire subnet for network-related issues, such as open ports or misconfigured services:

```bash
nuclei -target 192.168.1.0/24
```

## Scanning With a Custom Template

Create a YAML template that defines the request and matching logic, then run it with `-t`:

```bash
nuclei -u https://example.com -t /path/to/your-template.yaml
```

## Connect Nuclei to ProjectDiscovery

Run scans locally and upload results to the ProjectDiscovery Cloud dashboard for analysis and remediation:

```bash
nuclei -target https://example.com -dashboard
```

The dashboard upload feature can be used without a subscription. See ProjectDiscovery documentation for the full setup guide.

## Nuclei Templates and Community

Nuclei templates are YAML files that define how requests are sent and how responses are processed. This gives Nuclei a simple, human-readable extension model for building custom checks quickly.

Templates are open source and community-developed by security researchers. They commonly include metadata such as severity, detection methods, and vulnerability context so findings can be identified and communicated consistently.

ProjectDiscovery also provides a free AI-powered Nuclei Templates Editor for trying template ideas online.

## Template Use Cases

| Use case | Example template category |
| --- | --- |
| Detect known CVEs | CVE templates, such as Log4Shell checks |
| Identify out-of-band vulnerabilities | Blind SQL injection via OOB |
| SQL injection detection | Generic SQL injection |
| Cross-site scripting | Reflected XSS detection |
| Default or weak passwords | Default credentials checks |
| Secret files or data exposure | Sensitive file disclosure |
| Open redirects | Open redirect detection |
| Subdomain takeovers | Subdomain takeover templates |
| Security misconfigurations | Unprotected Jenkins console |
| Weak SSL/TLS configurations | SSL certificate expiry |
| Misconfigured cloud services | Open S3 bucket detection |
| Remote code execution | RCE detection templates |
| Directory traversal | Path traversal detection |
| File inclusion vulnerabilities | Local/remote file inclusion |

Additional documentation: <https://docs.projectdiscovery.io/getting-started/running>
