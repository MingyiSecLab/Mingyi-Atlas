# Skill Authoring Guide

Each skill should be concise, searchable, and task-oriented.

Required frontmatter:

```yaml
---
name: pentest-example
description: Short searchable summary of when to use this skill.
version: 0.1.0
tags:
  - pentest
metadata:
  domain: pentest
  category: example
---
```

Guidelines:

- Use globally unique names with a domain prefix.
- Match the concrete skill directory name to the frontmatter `name`.
- Put detailed playbooks in `references/`.
- Keep `SKILL.md` focused on when to use the skill, inputs, workflow, outputs, and completion criteria.
- Prefer bounded, low-risk proof guidance over generic exploitation checklists.
