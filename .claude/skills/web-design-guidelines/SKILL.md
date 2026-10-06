---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

> [!IMPORTANT]
> **Project overrides (event-platform). Read these before the skill below.**
>
> Vendored from [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/web-design-guidelines) at `063bee9` (MIT). There is one deliberate change to the upstream text, under "Guidelines Source". Upstream fetches the rules from a moving `main` branch on every run. Here they are pinned in `guidelines.md`, copied from [vercel-labs/web-interface-guidelines `command.md`](https://github.com/vercel-labs/web-interface-guidelines/blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md) at `434b7f9` (MIT, see `LICENSE`). Pinning keeps reviews reproducible and stops unreviewed instructions arriving mid-session. To update, re-copy that file at a newer commit and review the diff.
>
> **Precedence.** `spec.md`, `docs/design-system.md` and `docs/card-system.md` win wherever they disagree with the guidelines (`CLAUDE.md §1`). Do not report a finding that would require breaking them:
> - **"Title Case for headings/buttons": not ours.** Product copy is sentence case (design-system §21.1: `Make it yours`, `Try another direction`).
> - **"Dark Mode & Theming": N/A.** App chrome is light-only for MVP (§5.3).
> - **The invitation card is exempt** from "Content Handling" truncation and `line-clamp`, from `text-wrap: balance`/`pretty`, and from fixed-size findings. The browser must never re-wrap or silently truncate card text: line breaks are computed and stored (`spec.md §32 #23`), and card-unit sizes are an allowed exception (design-system §23.2). This covers `src/lib/card/`, `InvitationCard` and the card editor's canvas.
> - **No new dependencies as fixes.** Suggestions such as `nuqs` or `virtua` are proposals, not fixes (`docs/technology-decisions.md`).
> - **Motion findings** are fixed with the motion tokens (§8), never with new values.
>
> Our own accessibility bar adds to these rules: design-system §14 (contrast, focus, keyboard, screen readers, 44 px touch targets) and §15.6a (the guest focus contract).

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the pinned guidelines from the source file below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Read the pinned guidelines before each review (event-platform change: upstream fetches `main` on every run; see the overrides block above):

```
.claude/skills/web-design-guidelines/guidelines.md
```

Do not fetch the remote copy. The file contains all the rules and output format instructions.

## Usage

When a user provides a file or pattern argument:
1. Read the guidelines from the source file above
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
