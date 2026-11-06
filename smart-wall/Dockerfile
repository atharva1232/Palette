FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
ENV MONGOMS_DISABLE_POSTINSTALL=1
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIRECTORY=/app/.data BACKUP_DIR=/app/.backups
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir .data .backups && chown node:node .data .backups
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "scripts/mean-server.mjs", "--production"]
