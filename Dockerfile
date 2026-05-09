FROM node:22-alpine

RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm run build

EXPOSE 3000
CMD ["node", "dist/main"]
