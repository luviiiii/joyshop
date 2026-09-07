FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# IMPORTANT:
# Render only injects dashboard environment variables into the
# RUNNING container by default — not into the `docker build`
# process itself. Since `pnpm run build` (vite build) happens
# during the build step below, it needs SHOPIFY_APP_URL to be
# explicitly forwarded as a build argument, or vite.config.js's
# `base` setting silently falls back to "/" and every asset URL
# ends up relative instead of pointing at this app's real domain.
ARG SHOPIFY_APP_URL
ENV SHOPIFY_APP_URL=$SHOPIFY_APP_URL

RUN corepack enable
RUN corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --dangerously-allow-all-builds

COPY . .

RUN pnpm run build

EXPOSE 3000

CMD ["pnpm", "run", "docker-start"]