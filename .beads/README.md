# Beads - AI-Native Issue Tracking

Welcome to Beads! This repository uses **Beads** for issue tracking - a modern, AI-native tool designed to live directly in your codebase alongside your code.

## Tome of Secrets — agent workflow

This repo’s full agent guide is [`AGENTS.md`](../AGENTS.md). Beads rules here are **mandatory** for coding agents.

### Claim work

1. **Before coding:** Ensure the work exists as one or more Beads issues (`bd create`, `bd dep add` as needed). Do not start implementation on an untracked slice of work.
2. **When you start:** Mark the issue **`in_progress`** so others do not duplicate it:
   ```bash
   bd update <issue-id> --status in_progress
   ```

### Keep beads granular

- If an issue is **too broad** or mixes unrelated outcomes, **split it**: create child issues and link them with `bd dep add <child> <parent>`.
- **Rule of thumb:** if the next piece of work will take **more than ~3 minutes** and is not already represented, **create or refine a Bead** before doing it. Small exploratory spikes can stay in a single issue if the description is explicit.

### Definition of done

Close an issue (**`done`**) only when **all** of the following are true:

1. **Automated quality gates pass** — e.g. `cd tests && npm test`, and `cd tests && npm run validate-data` whenever `assets/data/` changed.
2. **Subagent pre-commit review passed** for **code** changes (JavaScript, behavior-changing HTML/CSS, scripts) — per [`AGENTS.md`](../AGENTS.md). Editorial-only Markdown may omit the review if no contracts or behavior change.

Documentation-only tasks still need accurate content and correct links; use judgment on whether a quick peer/subagent pass adds value.

### Heavy or full test runs

Delegate **full suite** or long-running checks to a **subagent** when it keeps the main session responsive; the primary agent remains responsible for fixing failures.

### Catalog / effects work

When adding deterministic bonuses or items, follow the **TCG modifier pipeline** in [`project-docs/ADR-003-tcg-modifier-pipeline.md`](../project-docs/ADR-003-tcg-modifier-pipeline.md) and [`project-docs/EXTENDING-THE-CODEBASE.md`](../project-docs/EXTENDING-THE-CODEBASE.md).

### Sync with git

After local work, use `bd sync` before push so issue state travels with commits (see [`AGENTS.md`](../AGENTS.md) “Landing the Plane”).

## What is Beads?

Beads is issue tracking that lives in your repo, making it perfect for AI coding agents and developers who want their issues close to their code. No web UI required - everything works through the CLI and integrates seamlessly with git.

**Learn more:** [github.com/steveyegge/beads](https://github.com/steveyegge/beads)

## Quick Start

### Essential Commands

```bash
# Create new issues
bd create "Add user authentication"

# View all issues
bd list

# View issue details
bd show <issue-id>

# Update issue status
bd update <issue-id> --status in_progress
bd update <issue-id> --status done

# Sync with git remote
bd sync
```

### Working with Issues

Issues in Beads are:
- **Git-native**: Stored in `.beads/issues.jsonl` and synced like code
- **AI-friendly**: CLI-first design works perfectly with AI coding agents
- **Branch-aware**: Issues can follow your branch workflow
- **Always in sync**: Auto-syncs with your commits

## Why Beads?

✨ **AI-Native Design**
- Built specifically for AI-assisted development workflows
- CLI-first interface works seamlessly with AI coding agents
- No context switching to web UIs

🚀 **Developer Focused**
- Issues live in your repo, right next to your code
- Works offline, syncs when you push
- Fast, lightweight, and stays out of your way

🔧 **Git Integration**
- Automatic sync with git commits
- Branch-aware issue tracking
- Intelligent JSONL merge resolution

## Get Started with Beads

Try Beads in your own projects:

```bash
# Install Beads
curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# Initialize in your repo
bd init

# Create your first issue
bd create "Try out Beads"
```

## Learn More

- **Documentation**: [github.com/steveyegge/beads/docs](https://github.com/steveyegge/beads/tree/main/docs)
- **Quick Start Guide**: Run `bd quickstart`
- **Examples**: [github.com/steveyegge/beads/examples](https://github.com/steveyegge/beads/tree/main/examples)

---

*Beads: Issue tracking that moves at the speed of thought* ⚡
