# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg transcodes animated collectibles; without it they render static.
RUN apk add --no-cache ffmpeg
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Nitro display-name fonts, embedded per card at render time.
COPY assets ./assets
# Only written when ENABLE_VIEWS=true. Created here so a named volume mounted
# over it inherits the ownership instead of landing root-owned under USER node.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
