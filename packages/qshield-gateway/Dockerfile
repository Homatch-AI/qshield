FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/qshield-core/package.json packages/qshield-core/
COPY packages/qshield-gateway/package.json packages/qshield-gateway/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY packages/qshield-core packages/qshield-core
COPY packages/qshield-gateway packages/qshield-gateway
COPY tsconfig.base.json ./
RUN pnpm -F @qshield/core build && pnpm -F @qshield/gateway build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/qshield-gateway/dist ./dist
COPY --from=builder /app/packages/qshield-gateway/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/qshield-core/dist ./node_modules/@qshield/core/dist
RUN mkdir -p data
EXPOSE 3847
CMD ["node", "dist/server.js"]
