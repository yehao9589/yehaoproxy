FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm rebuild esbuild sharp unrs-resolver workerd

COPY . .
RUN pnpm run build

FROM base AS runtime

ARG APP_VERSION=pre-release
ARG APP_COMMIT=""
ARG IMAGE_REPOSITORY=ghcr.io/yehao9589/yehaoproxy:pre-release

RUN apt-get update \
    && apt-get install -y --no-install-recommends mariadb-client \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 3000

ENV NODE_ENV=production
ENV NODE_OPTIONS=--experimental-loader=/app/scripts/cloudflare-node-loader.mjs
ENV APP_VERSION=${APP_VERSION}
ENV APP_COMMIT=${APP_COMMIT}
ENV IMAGE_REPOSITORY=${IMAGE_REPOSITORY}
CMD ["node", "node_modules/vinext/dist/cli.js", "start", "--hostname", "0.0.0.0"]
