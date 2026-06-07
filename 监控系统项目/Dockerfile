FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3030

COPY package.json ./
COPY server.js ./
COPY public ./public
COPY scripts ./scripts
COPY data ./data

EXPOSE 3030

CMD ["node", "server.js"]
