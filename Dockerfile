FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod=false

COPY . .

RUN pnpm run build

EXPOSE 3000

CMD ["pnpm", "run", "docker-start"]