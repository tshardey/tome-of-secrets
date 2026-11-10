#!/usr/bin/env bash
# Container entrypoint: make sure gems, test dependencies and generated data exist
# for the bind-mounted checkout, then run the requested command.
set -euo pipefail

start_dir=$PWD
cd /workspace

gem_home="${GEM_HOME:-/usr/local/bundle}"

# Named volumes created by an older image (or by Docker before the mount point
# existed) can come up root-owned; hand them to the dev user.
for dir in "$gem_home" /workspace/tests/node_modules "$HOME"; do
  if [ -d "$dir" ] && [ ! -w "$dir" ]; then
    sudo chown -R "$(id -u):$(id -g)" "$dir"
  fi
done

if [ ! -f Gemfile ]; then
  echo "tos-entrypoint: /workspace has no Gemfile. Is TOS_SRC pointing at a Tome of Secrets checkout?" >&2
  exit 1
fi

# Installs hold locks kept in the shared gems volume, so `jekyll` and `dev` (or two
# `dev` runs) starting together never install into the same volume at once.
(
  flock 9
  if ! bundle check >/dev/null 2>&1; then
    echo "tos-entrypoint: installing gems..."
    bundle install
  fi
) 9>"$gem_home/.tos-bundle.lock"

# The jekyll service sets TOS_SKIP_TEST_DEPS=1: it never needs tests/node_modules.
# npm writes node_modules/.package-lock.json on every install; reinstall when the
# lockfile is newer than that marker (or it is missing). `npm ci` keeps the
# committed tests/package-lock.json untouched.
if [ "${TOS_SKIP_TEST_DEPS:-0}" != "1" ]; then
  (
    flock 9
    if [ ! -f tests/node_modules/.package-lock.json ] \
       || [ tests/package-lock.json -nt tests/node_modules/.package-lock.json ]; then
      echo "tos-entrypoint: installing test dependencies (npm ci)..."
      (cd tests && npm ci --no-audit --no-fund)
    fi
  ) 9>"$gem_home/.tos-npm.lock"
fi

# assets/js/character-sheet/data.json-exports.js is git-ignored and required by the site.
# Don't abort on failure, so a broken JSON file still leaves you a shell to fix it in.
if ! node scripts/generate-data.js >/dev/null; then
  echo "tos-entrypoint: WARNING: scripts/generate-data.js failed; fix assets/data/*.json and rerun it." >&2
fi

if [ ! -f _config.supabase.yml ]; then
  echo "tos-entrypoint: WARNING: _config.supabase.yml is missing, so the jekyll service cannot start." >&2
  echo "  Copy _config.supabase.yml.example to _config.supabase.yml and fill it in." >&2
fi

cd "$start_dir"
exec "$@"
