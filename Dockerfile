# ---- 构建前端 ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# ---- 运行时（server.mjs 仅用 node 内置模块，无需 node_modules）----
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.mjs skills.mjs ./
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
