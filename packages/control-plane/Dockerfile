FROM node:22-alpine AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/control-plane/package.json ./packages/control-plane/

# Install only control-plane deps (production)
RUN pnpm install --filter @openclaw/control-plane --frozen-lockfile

# Copy source and build
COPY packages/control-plane ./packages/control-plane
RUN pnpm --filter @openclaw/control-plane run build

# Runtime image
FROM node:22-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/control-plane/package.json ./packages/control-plane/

RUN pnpm install --filter @openclaw/control-plane --frozen-lockfile --prod

COPY --from=base /app/packages/control-plane/dist ./packages/control-plane/dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "packages/control-plane/dist/index.js"]
