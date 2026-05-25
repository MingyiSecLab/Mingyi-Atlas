# Mingyi Atlas Skills

Built-in security skills for Mingyi Atlas.

This package is the development home for runtime skills that can be loaded by the TUI and pentest agents. The runtime entrypoint is:

```text
packages/skills/skills
```

Skills are organized by domain:

```text
skills/
  pentest/
  shared/
  ctf/
  reverse/
```

Each concrete skill lives in its own folder and contains a `SKILL.md` file.

