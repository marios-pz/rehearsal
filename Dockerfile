# syntax=docker/dockerfile:1

# Node 24 is the current Active LTS line. Alpine keeps the image minimal.
ARG NODE_VERSION=24-alpine

# ---- build: full deps, compile the SvelteKit app -------------------------
# `npm run build` must not need a database; it only runs vite.
FROM node:${NODE_VERSION} AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm test
RUN npm run build

# ---- prod-deps: install only what runs in production ----------------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: minimal final image -----------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# adapter-node output, prod-only node_modules, and everything `npm start`
# needs. That is the unit tests, the db bootstrap gate and the immutable
# migrations, in that order: prestart runs the tests, bootstrap migrates,
# then the server comes up. bootstrap.js reads src/lib/data/*.json
# (countries, geo) at runtime, and the tests read the rest of src/lib, so
# the sources ship as well as the build.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY scripts ./scripts
COPY drizzle ./drizzle
COPY test ./test
COPY src/lib ./src/lib
COPY static/instruments ./static/instruments

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["npm", "start"]
