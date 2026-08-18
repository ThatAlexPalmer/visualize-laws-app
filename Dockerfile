# visualizelaws.com — development image (hot-reloading Next.js + Prisma).
# Source is bind-mounted at runtime; node_modules + .next live in named volumes
# (see docker-compose.yml) so the Linux build is not shadowed by the host.
FROM node:24-bookworm-slim

# OpenSSL: the slim image omits it, so Prisma can't detect libssl and warns on
# every query. Install it before `pnpm install` so postinstall `prisma generate`
# picks the correct (debian-openssl-3.0.x) query engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# pnpm installed directly (no corepack).
RUN npm install -g pnpm@9.15.0

WORKDIR /workspace

# Install dependencies against the manifests + prisma schema. The `postinstall`
# hook runs `prisma generate` (downloads the Linux query engine), so the prisma
# schema must be present.
COPY package.json pnpm-lock.yaml ./
COPY data/prisma ./data/prisma
RUN pnpm install --frozen-lockfile

# Entrypoint: wait for db -> migrate -> conditional sample seed -> next dev.
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
