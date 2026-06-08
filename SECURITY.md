# Security Policy

Mingyi Atlas includes tooling for authorized security assessment. Security reports and security-tool contributions must be handled carefully.

## Reporting a Vulnerability

Do not open a public issue for vulnerabilities that could put users at risk.

Report security issues privately to the maintainers. If no private channel is listed for your deployment or fork, create a minimal public issue asking for a security contact without including exploit details, secrets, target data, logs, or proof-of-concept payloads.

Please include:

- Affected version or commit.
- A concise description of the issue.
- Impact and affected component.
- Reproduction steps using a local or synthetic target when possible.
- Any logs or artifacts with secrets removed.

## Supported Versions

Security fixes target the latest published version and the current `main` branch unless a maintainer announces otherwise.

## Security Tooling Boundaries

Pentest mode is for authorized testing only. Contributions must preserve these boundaries:

- No destructive actions by default.
- No brute force, credential theft, credential dumping, persistence, malware behavior, denial of service, or unauthorized exploitation.
- No hash cracking, key recovery, or wordlist attacks in built-in tools.
- No SSRF probes against metadata services, localhost, or internal addresses unless explicitly authorized and represented in scope.
- No active request-smuggling payloads in default tooling. Passive assessment is acceptable.
- Network tools must be scope-gated, timeout-limited, and output-bounded.
- Browser/container tools must capture artifacts without leaking private data into the repository.

## Secrets and Sensitive Data

Never commit:

- API keys, OAuth tokens, session cookies, private keys, or passwords.
- Real customer data, target data, or pentest artifacts.
- Screenshots, browser traces, or container outputs from private systems.
- `.mingyi-atlas/` runtime state unless a fixture is intentionally sanitized and documented.

## Dependency Security

When updating dependencies:

- Prefer minimal updates with a clear reason.
- Run the relevant tests and `pnpm check`.
- Note security implications in the PR description when the update affects auth, MCP, browser/container execution, permissions, or pentest tooling.
