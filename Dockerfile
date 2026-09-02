FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

FROM base AS build-deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm rebuild esbuild sharp unrs-resolver workerd

FROM build-deps AS build

COPY . .
RUN pnpm run build

# 生产依赖独立成稳定层。普通业务代码变化时不会重新生成 node_modules。
FROM base AS prod-deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
    && pnpm rebuild esbuild sharp unrs-resolver workerd \
    && pnpm store prune

FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends mariadb-client \
    && rm -rf /var/lib/apt/lists/*

# 依赖层与应用产物分开，后续普通更新只需拉取较小的应用层。
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts

EXPOSE 3000

# 版本信息放在稳定依赖层之后，提交号变化不会让系统组件和依赖层失效。
ARG APP_VERSION=v1.0.0
ARG APP_COMMIT=""
ARG IMAGE_REPOSITORY=ghcr.io/yehao9589/yehaoproxy:v1.0.0

ENV NODE_ENV=production
ENV NODE_OPTIONS=--experimental-loader=/app/scripts/cloudflare-node-loader.mjs
ENV APP_VERSION=${APP_VERSION}
ENV APP_COMMIT=${APP_COMMIT}
ENV IMAGE_REPOSITORY=${IMAGE_REPOSITORY}
CMD ["node", "node_modules/vinext/dist/cli.js", "start", "--hostname", "0.0.0.0"]
