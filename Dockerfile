FROM docker.m.daocloud.io/library/node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm rebuild esbuild sharp unrs-resolver workerd

COPY . .

EXPOSE 3000

CMD ["pnpm", "exec", "vinext", "dev", "--hostname", "0.0.0.0"]
