FROM node:24.22.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @openai/codex@0.167.0
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
USER node
