FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --no-audit/--no-fund: faster CI/docker builds; audit locally with npm audit
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# Reuse node_modules from build stage instead of a second full npm install
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
COPY tsconfig.json ./
COPY vite.config.ts ./
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
