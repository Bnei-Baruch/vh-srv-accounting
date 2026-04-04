FROM node:24-alpine AS builder

ARG GIT_SHA=local

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:24-alpine

RUN apk --no-cache add curl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Copy SQL migrations into dist so they're available at runtime
COPY src/db/migrations ./dist/db/migrations

ENV GIT_SHA=${GIT_SHA}

EXPOSE 8190

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8190/health || exit 1

CMD ["node", "dist/index.js"]
