# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS development
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        openssl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node . .
RUN npx prisma generate && chown node:node /app

ENV NODE_ENV=development \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

USER node
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

FROM node:22-bookworm-slim AS builder
WORKDIR /app
# Prisma detects the OpenSSL ABI during client generation; without the openssl package it can
# fall back to an OpenSSL 1.1 query engine that cannot run in the Debian Bookworm runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so the build needs the
# real .env. It is mounted as a BuildKit secret so it never lands in an image layer or the cache.
# The secret is removed inside the same RUN: `next build` copies .env into the standalone
# output, and a later `rm` would not erase it from this layer.
RUN --mount=type=secret,id=web_env,target=/app/.env,required=true \
    npm run build && rm -f /app/.next/standalone/.env

FROM node:22-bookworm-slim AS runner
WORKDIR /app
# ffmpeg/ffprobe (libx264 + libwebp) compress uploads; Prisma needs openssl.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        openssl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The standalone server binds to $HOSTNAME, which Docker sets to the container id; without this
# it listens only on the container IP and nothing can reach it on loopback (healthcheck included).
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The generated Prisma client/query engine is not always picked up by Next's file tracing.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
