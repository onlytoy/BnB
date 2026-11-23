FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node server ./server
COPY --chown=node:node client ./client

USER node
EXPOSE 3001
CMD ["node", "server/index.js"]
