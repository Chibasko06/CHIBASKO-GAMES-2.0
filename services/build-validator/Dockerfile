FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY scripts/build-validator.mjs ./scripts/build-validator.mjs
COPY services/build-validator ./services/build-validator
COPY lib/game-distribution ./lib/game-distribution
RUN node scripts/build-validator.mjs

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production GAME_BUILDS_SCRATCH_DIR=/scratch
WORKDIR /app
COPY --from=build --chown=node:node /build/.distribution/validator/ ./
RUN mkdir /scratch && chown node:node /scratch
USER node
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node","/app/healthcheck.mjs"]
CMD ["node","--max-old-space-size=768","/app/main.mjs"]
