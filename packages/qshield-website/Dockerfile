FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package.json ./

RUN npm install --omit=dev express

EXPOSE 3000
CMD ["node", "server.js"]
