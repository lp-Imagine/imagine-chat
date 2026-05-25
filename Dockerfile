FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY client/package*.json client/

RUN npm ci && cd client && npm ci

COPY . .

RUN npm run build:server && npm run build:client

RUN rm -rf client/node_modules && npm ci --omit=dev

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
