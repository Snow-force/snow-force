FROM node:24.22.1-bookworm-slim
WORKDIR /controller
COPY apps/super-agent/package.json apps/super-agent/package-lock.json ./
RUN npm ci --omit=dev
COPY apps/super-agent/*.mjs ./
COPY . /source
RUN tar -czf /opt/source.tar.gz -C /source . && rm -rf /source
ENV SOURCE_ARCHIVE=/opt/source.tar.gz
ENV NEXT_TELEMETRY_DISABLED=1
USER node
CMD ["node", "cloud-controller.mjs"]
