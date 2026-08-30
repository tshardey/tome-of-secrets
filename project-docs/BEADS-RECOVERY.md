# Beads recovery baseline (Tome of Secrets)

How to diagnose and repair this repository's Beads tracker. Two separate incidents are recorded here (2026-04-20 and 2026-08-29); both began the same way — **a `bd` CLI upgrade arriving with a rebuilt dev container**.

> **Read this before running any repair command.** The single most damaging mistake in this repo's history was reaching for `bd init` when the right command was `bd bootstrap`. See [Never run `bd init` here](#never-run-bd-init-here).

## Background

- Beads uses a **Dolt embedded** backend under `.beads/embeddeddolt/`; older assumptions about raw SQLite are obsolete.
- **Embedded mode is single-writer.** Parallel shells or agents issuing `bd` writes can wedge locks.
- The database is **remote-backed**: `origin = git+https://github.com/tshardey/tome-of-secrets.git`, with Dolt data stored on the git remote under the ref `refs/dolt/data` (separate from ordinary branches).
- `.beads/issues.jsonl` is a **git-tracked export**, not the source of truth. It is only as fresh as the last `bd export`.

## Triage: identify which failure you have

Run `bd list`. Match the output below.

| Symptom | Failure | Go to |
|---|---|---|
| `column "..." could not be found in any table in scope`; warning about *N* pending schema migrations (`v23 -> v53`) | **Schema skew** — CLI upgraded past the stored schema | [Scenario A](#scenario-a-schema-skew-after-a-cli-upgrade) |
| `bd dolt push` fails: `unknown push error; no common ancestor` | **Forked history** — local and remote are unrelated databases | [Scenario B](#scenario-b-forked-history-no-common-ancestor) |
| Hangs on `bd export` / `bd info`; stuck locks | **Wedged locks** | [Scenario C](#scenario-c-wedged-locks) |

**Before any repair, snapshot the tree** — every procedure below assumes you can roll back:

```bash
cp -a .beads /tmp/beads-snapshot-$(date +%Y%m%d-%H%M%S)
```

## Never run `bd init` here

`bd init` creates a **brand-new Dolt history**. Because this repo's database is remote-backed, a fresh history shares no common ancestor with `refs/dolt/data`, so:

- `bd dolt push` fails permanently with `no common ancestor`, and
- any issue present on the remote but absent from the JSONL you rebuilt from is **silently dropped**.

This is not hypothetical. The 2026-04-20 recovery rebuilt with `bd init --from-jsonl` from a JSONL baseline that was already a few days stale. That forked the tracker and orphaned **7 issues** (3 of them open, including a P1) which survived only on the remote until 2026-08-29.

**Use `bd bootstrap` instead.** It clones the existing history from the remote and preserves ancestry. It never deletes issues.

## Scenario A: schema skew after a CLI upgrade

The `bd` binary is newer than the stored schema, so its SQL references columns that do not exist yet. Reads fail; **writes are blocked**. `bd` deliberately refuses to auto-migrate a remote-backed database, because two clones migrating independently forks the schema unrecoverably (upstream #4259).

Decide **who the designated migrator is** — exactly one machine may migrate.

**If this is the only clone (normal case for this project):**

```bash
BD_ALLOW_REMOTE_MIGRATE=1 bd migrate
bd list && bd ready                  # verify reads recover
bd dolt push                         # publish the migrated schema
```

**If another machine already migrated and pushed:** adopt its database instead of migrating here.

```bash
bd export --all -o /tmp/local-before-bootstrap.jsonl   # save local-only work first
bd bootstrap                                            # re-clone; REPLACES the local DB
```

If `bd dolt push` fails with `no common ancestor`, go to Scenario B — do **not** force push yet.

## Scenario B: forked history (`no common ancestor`)

Local and remote are independent databases. `bd dolt push --force` will resolve it, but **only after you prove local is a superset of the remote** — otherwise the force push permanently destroys remote-only issues.

### 1. Inspect the remote without touching your working copy

```bash
git clone https://github.com/tshardey/tome-of-secrets.git /tmp/remote-probe
cd /tmp/remote-probe && bd bootstrap --yes
# if the clone reports pending migrations, migrate the throwaway copy:
BD_ALLOW_REMOTE_MIGRATE=1 bd migrate --sandbox
```

Always pass `--sandbox` in the probe clone. It disables Dolt auto-push, so the throwaway copy can never write back to the remote.

### 2. Diff the two issue sets

> **Gotcha:** `bd list --all --json` is **capped by default** and will silently under-report. On 2026-08-29 the capped diff showed *zero* differences while 7 issues were actually remote-only. **Always pass `--limit 10000`.**

```bash
ids() { bd list --all --limit 10000 --json "$@" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);(a.issues||a).forEach(i=>console.log(i.id))})' \
  | sort; }

cd /workspaces/tome-of-secrets && ids > /tmp/local-ids.txt
cd /tmp/remote-probe          && ids --sandbox > /tmp/remote-ids.txt

comm -23 /tmp/remote-ids.txt /tmp/local-ids.txt   # remote-only -> WOULD BE LOST
```

### 3. Rescue remote-only issues before pushing

If that list is non-empty, import them so local becomes a true superset:

```bash
cd /tmp/remote-probe && bd export --all --sandbox -o /tmp/remote-full.jsonl
# filter /tmp/remote-full.jsonl down to the remote-only ids, then:
cd /workspaces/tome-of-secrets && bd import /tmp/remote-only.jsonl
```

Re-run the diff. **Proceed only when the remote-only list is empty.**

### 4. Push and verify against a fresh clone

```bash
bd dolt push --force
git ls-remote origin refs/dolt/data                 # ref should have moved
git clone https://github.com/tshardey/tome-of-secrets.git /tmp/verify && cd /tmp/verify && bd bootstrap --yes
bd list --all --sandbox                             # counts must match local
```

A fresh `bd bootstrap` that completes **without** a migration warning confirms the migrated schema reached the remote. Never trust `Push complete.` alone.

## Scenario C: wedged locks

1. **Stop concurrent writers** — one terminal at a time for `bd` mutations; kill stray `bd` / Dolt processes.
2. **Snapshot `.beads/`** (see above).
3. Retry the operation. If the database is genuinely unusable, prefer **`bd bootstrap`** to adopt the remote history. Rebuilding from JSONL via `bd init --from-jsonl` is a **last resort** — it forks the history (see [above](#never-run-bd-init-here)) and loses anything newer on the remote. If you must, first complete the Scenario B diff so you know exactly what you are dropping.

## Routine hygiene

- **Refresh the git-tracked export whenever issue state changes**, then stage it for the maintainer's commit:
  ```bash
  bd export --no-memories -o .beads/issues.jsonl
  ```
  A stale export is what turned the 2026-04-20 recovery into data loss. It had drifted **4 months** by 2026-08-29.
- **Periodic backups** are enabled (`backup.enabled=true`, `backup.interval=15m`) and write Dolt archives to `.beads/backup/`. That directory is gitignored — it is local-machine recovery only, not off-machine.
- `.beads` should be mode `700` (`chmod 700 .beads`) or `bd` warns on every invocation.

## When to use server mode

Stay on **embedded** for typical single-agent / single-terminal use. Consider `bd init --server` (or a shared server) only if you need **multiple concurrent writers** without lock contention.

## Incident log

### 2026-08-29 — schema skew (v23 → v53) plus a latent fork

- **Trigger:** dev container rebuilt; `bd` upgraded to **1.2.2** while the database sat at schema **v23** (30 pending migrations). All reads failed, writes blocked.
- **Repair:** designated-migrator path — `BD_ALLOW_REMOTE_MIGRATE=1 bd migrate`, verified reads/writes, then `bd dolt push`.
- **Complication:** the push failed with `no common ancestor`, exposing the fork left by the 2026-04-20 recovery. The remote's Dolt data was frozen at ~2026-04-17 and held **7 issues absent locally** (`yzok` P1, `4yqq`, `g5ex` open; `fz4`, `fn5j`, `l75b`, `2tqp` closed).
- **Resolution:** imported the 7 from a sandboxed probe clone (184 → **191** issues), confirmed local was a strict superset, then `bd dolt push --force`. Verified against a fresh clone: 191/191, ID sets identical both directions, `refs/dolt/data` `4b6d472` → `c63c0f7`.
- **Lessons:** the capped-JSONL gotcha in Scenario B step 2; and that `bd init --from-jsonl` was the original fault, now replaced by `bd bootstrap` throughout this document.

### 2026-04-20 — wedged store after CLI upgrade

- Rebuilt with `bd init --from-jsonl` from a stale baseline. Resolved the immediate wedge but **forked the Dolt history** and orphaned 7 issues; not detected until 2026-08-29.
- Pre-recovery copy: `/tmp/beads-archive-tome-of-secrets-20260420` (ephemeral; likely gone after container rebuilds).

## Note on `bd sync`

Some older docs mention `bd sync`; current `bd` uses **`bd export`** to refresh `.beads/issues.jsonl`. Prefer `bd export --no-memories -o .beads/issues.jsonl`.
