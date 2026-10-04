# Signs Around You · آيات حولك — production image (Next.js app + seed tooling).
# Built by deploy/docker-compose.yml; see deploy/README.md.

FROM node:22-bookworm-slim AS build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The pinned Quran / hadith / translation sources are downloaded on the host before the build
# (install.sh runs prep/fetch_sources.sh, sha256-checked), so the image needs no OS packages or extra downloads.
RUN test -s prep/data/raw/quran_kfgqpc_hafs_v18.json \
    || (echo "Missing prep/data/raw: run 'bash prep/fetch_sources.sh' (or 'npm run data:fetch') before building." && exit 1)
# Vendor the generated concept images so the app works offline and on venue Wi-Fi (falls back to the CDN if unreachable).
RUN npm run assets:fetch || echo "concept images: CDN unreachable, the app will load them remotely"
RUN npx next build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=build /app /app
RUN chmod +x deploy/entrypoint.sh deploy/healthcheck.mjs && mkdir -p /data/uploads
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=240s --retries=5 CMD ["node", "deploy/healthcheck.mjs"]
CMD ["deploy/entrypoint.sh"]
