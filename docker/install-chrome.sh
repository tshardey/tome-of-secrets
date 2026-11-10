#!/usr/bin/env bash
# Installs Google Chrome stable at image build time (see docker/Dockerfile) for
# agent-driven browser automation and Playwright e2e tests.
#
# Chrome rather than Chromium: tests/playwright.config.js uses `channel: 'chrome'`,
# and Chrome's .deb pulls its own runtime libs and lands at /usr/bin/google-chrome-stable,
# the path Puppeteer and Playwright both auto-detect, so one binary serves both consumers.
set -euo pipefail

if ! command -v google-chrome-stable >/dev/null 2>&1; then
  curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends google-chrome-stable
  rm -rf /var/lib/apt/lists/*
fi

# Chrome's sandbox needs unprivileged user namespaces, which containers usually block,
# and chrome-devtools-mcp exposes no flag for passing Chrome args. This shim supplies them.
cat > /usr/local/bin/chrome-for-agents <<'SHIM'
#!/bin/sh
exec /usr/bin/google-chrome-stable --no-sandbox --disable-dev-shm-usage "$@"
SHIM
chmod +x /usr/local/bin/chrome-for-agents
