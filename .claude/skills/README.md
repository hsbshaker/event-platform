# Vendored skills

Project skills for Claude Code. Each skill directory holds a `SKILL.md` and is loaded automatically in every session on this repository. They are copied from upstream at a pinned commit and reviewed in full before commit. They are not installed with `npx skills add`, so nothing here changes until someone updates it on purpose.

Each `SKILL.md` begins with a **project overrides** block, the only addition to the upstream text (plus the pinned guidelines source in `web-design-guidelines`). The block records where the skill yields to `spec.md`, `docs/design-system.md` and `docs/card-system.md`. When to use each skill is set out in `CLAUDE.md §6.1`.

| Skill | Upstream | Commit | Licence |
| --- | --- | --- | --- |
| `design-taste-frontend` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) `skills/taste-skill` | `ce26fc25c0e5e8cab638f883de62d9a86ee5e45b` | MIT |
| `redesign-existing-projects` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) `skills/redesign-skill` | `ce26fc25c0e5e8cab638f883de62d9a86ee5e45b` | MIT |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `skills/web-design-guidelines` | `063bee94c3f4df8453406c830b0a7df0f2860278` | MIT |
| ↳ `guidelines.md` | [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) `command.md` | `434b7f91364665f2f733b310ec54809bf8f37937` | MIT |
| `playwright-cli` | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) `skills/playwright-cli` | `b85c7a736bb473bf55b584e54a09ffa698d6d871` | Apache-2.0 |

## Not installed from taste-skill, and why

`Leonxlnx/taste-skill` ships 13 skills. Only the two above were taken:

- `taste-skill-v1` and `gpt-tasteskill`: an older version of `design-taste-frontend` and a GPT/Codex variant.
- `soft-skill`, `minimalist-skill`, `brutalist-skill` and `stitch-skill`: each imposes its own look, competing with the one `docs/design-system.md` already fixes.
- `image-to-code-skill`, `imagegen-frontend-web`, `imagegen-frontend-mobile` and `brandkit`: image-generation workflows. They conflict with the imagery rule (design-system §15.11, `spec.md §32 #31`) and could be confused with the card artwork pipeline.
- `output-skill`: about output completeness, not UI quality.

## Updating a skill

1. Clone the upstream repository and diff the skill directory against the pinned commit above.
2. Read every changed line before copying. Skills are instructions to the agent.
3. Copy the new files over, then put the project overrides block back immediately after the frontmatter. In `web-design-guidelines`, also keep the "Guidelines Source" section pointing at `guidelines.md`.
4. Re-check the overrides against the current `docs/design-system.md`, and update the commit in this table.
