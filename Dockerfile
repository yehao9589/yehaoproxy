FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm rebuild esbuild sharp unrs-resolver workerd

COPY . .
RUN pnpm run build \
    && pnpm prune --prod \
    && pnpm store prune

FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS runtime

WORKDIR /app

ARG APP_VERSION=pre-release
ARG APP_COMMIT=""
ARG IMAGE_REPOSITORY=ghcr.io/yehao9589/yehaoproxy:pre-release

RUN apt-get update \
    && apt-get install -y --no-install-recommends mariadb-client \
    && rm -rf /var/lib/apt/lists/*

# Only runtime artifacts are copied. Source files, development dependencies,
# compilers and package-manager caches stay in the builder image.
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/public ./public
COPY --from=base /app/scripts ./scripts

EXPOSE 3000

ENV NODE_ENV=production
ENV NODE_OPTIONS=--experimental-loader=/app/scripts/cloudflare-node-loader.mjs
ENV APP_VERSION=${APP_VERSION}
ENV APP_COMMIT=${APP_COMMIT}
ENV IMAGE_REPOSITORY=${IMAGE_REPOSITORY}
CMD ["node", "node_modules/vinext/dist/cli.js", "start", "--hostname", "0.0.0.0"]
