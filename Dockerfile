# Builds the Angular SSR app, then runs it with a minimal production image.
# Written explicitly because Railway's auto-detected build assumed this was a
# plain static SPA and looked for output at /app/browser, when Angular's real
# build output is nested at dist/my-portfolio/browser and dist/my-portfolio/server.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/my-portfolio/server/server.mjs"]
