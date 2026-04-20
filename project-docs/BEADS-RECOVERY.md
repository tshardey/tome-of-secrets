# Beads recovery baseline (Tome of Secrets)

This document records how the repository’s Beads tracker was repaired when the embedded Dolt store became unreliable after a Beads CLI upgrade and a fresh dev container.

## What went wrong

- Beads moved to a **Dolt embedded** backend; older assumptions about raw SQLite are obsolete.
- **Embedded mode is single-writer**. Parallel shells or agents issuing `bd` writes can wedge locks.
- Auto-push to `origin` for Dolt data may fail in environments without git credentials (harmless for local work, noisy in logs).

## Recovery procedure (canonical)

Use this order when the tracker misbehaves (hangs on `bd export` / `bd info`, stuck locks):

1. **Stop concurrent writers** — one terminal at a time for `bd` mutations; kill stray `bd` / Dolt processes if needed.
2. **Archive the broken `.beads/` tree** — full copy to a path outside the repo (e.g. `/tmp/beads-archive-<date>`).
3. **Rebuild from git-tracked export** — baseline is [`.beads/issues.jsonl`](../.beads/issues.jsonl):
   ```bash
   mv .beads .beads.pre-recovery-wedged   # or delete after a verified copy exists
   mkdir -p .beads
   cp /path/to/baseline/issues.jsonl .beads/issues.jsonl
   bd init --from-jsonl --skip-agents --skip-hooks
   ```
4. **Refresh the export** after issue changes:
   ```bash
   bd export --no-memories -o .beads/issues.jsonl
   ```
5. **Stage** `.beads/issues.jsonl` for commit with other project changes (maintainer commits).

## Fallback

If the JSONL baseline is too stale, restore from **`.beads/backup/`** inside an archived copy (see archived tree), or re-import from a newer export if another clone has a good `issues.jsonl`.

## When to use server mode

Stay on **embedded** for typical single-agent / single-terminal use. Consider `bd init --server` (or shared server) if you need **multiple concurrent writers** without lock contention.

## Local artifacts (this workspace)

- **Full pre-recovery copy (external):** `/tmp/beads-archive-tome-of-secrets-20260420`
- **In-repo wedged copy (optional):** `.beads.pre-recovery-wedged/` — gitignored; safe to delete after you confirm `/tmp` (or another) backup is enough.

## Note on `bd sync`

Some docs mention `bd sync`; current `bd` versions may use **`bd export`** to refresh `.beads/issues.jsonl` instead. Prefer `bd export -o .beads/issues.jsonl` for git-tracked exports.
