# 阶段1：构建前端
FROM node:24-slim AS frontend-builder

WORKDIR /app-frontend
COPY app/package*.json ./
RUN npm install --registry=https://registry.npmmirror.com
COPY app/ ./
RUN npx vite build

# 阶段2：编译后端原生依赖
# better-sqlite3 v13 在本环境无匹配预编译包，需 python3/make/g++ 从源码编译。
# 工具链只存在于本中间阶段，不进最终运行镜像。
FROM node:24-slim AS backend-deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package*.json ./
RUN npm install --registry=https://registry.npmmirror.com

# 阶段3：运行镜像（干净，不含编译工具链，省 ~293MB）
FROM node:24-slim

WORKDIR /app
# 先拷入已编译好的 Linux 版 node_modules
COPY --from=backend-deps /app/node_modules ./node_modules
# .dockerignore 已排除 backend/node_modules 与 backend/bin，不会覆盖上面的依赖，
# 也不会把 124MB 的 meilisearch.exe(win 二进制) 拖进镜像
COPY backend/ ./

COPY --from=frontend-builder /app-frontend/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000
CMD ["node", "server.js"]
