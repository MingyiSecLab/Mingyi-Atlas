# Skills Design

Mingyi Atlas skills are organized for runtime discovery by agents and for future extraction into an independent skill pack repository.

## Layout

```text
packages/skills/skills/<domain>/<skill-name>/SKILL.md
```

The domain path is for humans and package organization. The concrete skill directory name must match the `name` field in `SKILL.md`, such as `packages/skills/skills/pentest/injection/SKILL.md` with `name: injection`.

## Loading Priority

The intended runtime priority is:

1. Workspace skills
2. Global skills
3. Built-in skills from `packages/skills/skills`

Workspace and global skills should be able to override built-in defaults.
