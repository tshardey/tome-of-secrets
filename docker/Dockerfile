# Tome of Secrets development image: Ruby/Jekyll, Node (Jest + Playwright), gh,
# Supabase CLI, Google Chrome and the Claude Code CLI.
#
# Used by ../docker-compose.yml. The repository is bind-mounted at /workspace at
# runtime, so nothing from the repo is baked in; gems and tests/node_modules live
# in named volumes and are installed by docker/entrypoint.sh on first start.
#
# Bump the pinned versions below deliberately and rebuild: `docker compose build`.

ARG RUBY_VERSION=3.3.13
ARG NODE_VERSION=26.13.0

FROM node:${NODE_VERSION}-bookworm-slim AS node

FROM ruby:${RUBY_VERSION}-bookworm

ARG GH_VERSION=2.103.3
ARG SUPABASE_VERSION=3.1.0
ARG CLAUDE_CODE_VERSION=2.1.322
ARG USERNAME=dev
ARG USER_UID=1000
ARG USER_GID=1000

# Node LTS: copy the official binaries rather than overlaying /usr/local wholesale,
# which would clobber the Ruby install that also lives there.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && node --version && npm --version

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates curl git gnupg less sudo \
 && rm -rf /var/lib/apt/lists/*

# GitHub CLI and Supabase CLI from their pinned release .debs.
RUN set -eux; cd /tmp; \
    curl -fsSLO "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.deb"; \
    curl -fsSLO "https://github.com/supabase/cli/releases/download/v${SUPABASE_VERSION}/supabase_${SUPABASE_VERSION}_linux_amd64.deb"; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ./gh_*.deb ./supabase_*.deb; \
    rm -rf /tmp/*.deb /var/lib/apt/lists/*; \
    gh --version; supabase --version

# Google Chrome stable + the `chrome-for-agents` shim.
COPY install-chrome.sh /tmp/install-chrome.sh
RUN bash /tmp/install-chrome.sh && rm /tmp/install-chrome.sh && google-chrome-stable --version

RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" && npm cache clean --force

# Non-root user (passwordless sudo, as in the old devcontainer). The volume mount
# points are created here, owned by that user, so fresh named volumes inherit it.
RUN groupadd --gid "${USER_GID}" "${USERNAME}" \
 && useradd --uid "${USER_UID}" --gid "${USER_GID}" --create-home --shell /bin/bash "${USERNAME}" \
 && echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${USERNAME}" \
 && chmod 0440 "/etc/sudoers.d/${USERNAME}" \
 && mkdir -p /workspace/tests/node_modules "/home/${USERNAME}/.claude" \
 && chown -R "${USER_UID}:${USER_GID}" /usr/local/bundle /workspace "/home/${USERNAME}"

COPY --chmod=0755 entrypoint.sh /usr/local/bin/tos-entrypoint

USER ${USERNAME}
WORKDIR /workspace
EXPOSE 4000 35729

ENTRYPOINT ["tos-entrypoint"]
CMD ["bash"]
