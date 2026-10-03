FROM node:24-bookworm-slim AS build
WORKDIR /opt/commerce
ENV MEDUSA_DISABLE_TELEMETRY=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json medusa-config.ts ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /opt/commerce
ENV NODE_ENV=production \
    MEDUSA_DISABLE_TELEMETRY=true \
    COMMERCE_OPERATING_MODE=management \
    COMMERCE_TAX_POLICY_CONFIRMED=false \
    PORT=9000
COPY --from=build --chown=node:node /opt/commerce/.medusa/server/ ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node scripts/preflight.mjs scripts/start-production.mjs ./scripts/
USER node
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-production.mjs"]
