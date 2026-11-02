FROM node:24-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter happy-server build
RUN APP_ENV=production pnpm --filter happy-app exec expo export --platform web --output-dir /opt/webapp

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/packages/happy-server /repo/packages/happy-server
COPY --from=builder /repo/packages/happy-wire /repo/packages/happy-wire
COPY --from=builder /opt/webapp /opt/webapp
COPY deploy/entrypoint.mjs /opt/entrypoint.mjs
ENV NODE_ENV=production DATA_DIR=/data PGLITE_DIR=/data/pglite HAPPY_STATIC_DIR=/opt/webapp HOST=0.0.0.0 PORT=3005
EXPOSE 3005
VOLUME /data
WORKDIR /repo/packages/happy-server
ENTRYPOINT ["node", "/opt/entrypoint.mjs"]
