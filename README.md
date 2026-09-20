# 同物异名(科学不装)

跨学科概念还原库 -- 将复杂世界的专业术语翻译成人能理解的结构.

## 技术栈

- 前端:React 19 + TypeScript + Vite 7 + Tailwind CSS + D3.js + Framer Motion
- 后端:Express.js + better-sqlite3(SQLite 主库)+ Meilisearch（**未启用**,实际走 SQLite LIKE）+ OpenAI API（Neo4j 图数据库方向**已放弃**,仅残留代码）
- 部署:Docker Compose + Caddy（Let's Encrypt 自动续期）— 本地已整站验证,**服务器迁移待执行**;线上当前仍是 Nginx + PM2

## 目录结构

```
├── app/                # React 前端
│   └── src/
│       ├── api/        # API 客户端封装
│       ├── components/ # React 组件
│       ├── hooks/      # 自定义 Hooks
│       ├── pages/      # 页面组件
│       └── sections/   # 页面区块
├── backend/            # Express 后端
│   ├── db/             # 数据库层
│   ├── routes/         # 路由
│   ├── services/       # 业务逻辑
│   ├── middleware/      # 中间件
│   ├── utils/          # 工具函数
│   └── server.js       # 入口
├── data/               # 数据库文件（三个独立 .db 文件）
│   ├── 同物异名.db     # 主数据库 SQLite(精加工工作台)
│   ├── 学科词库.db     # 学科词库 (19 表 / 7,841 行)
│   └── 语义词典.db     # 语义词典 (4 表 / 8,598 行)
└── docs/               # 项目文档
```

## 快速启动

```bash
# 后端(国内用户推荐用镜像源加速)
cd backend && npm install --registry=https://registry.npmmirror.com && npm start
# → http://localhost:3000

# Neo4j 图数据库(可选,默认未启用;图数据库方向已搁置)
# 如需实验:安装 Neo4j 4.4、配置 .env 的 NEO4J_PASSWORD,再 cd backend && npm run sync:neo4j

# 前端(新终端)
cd app && npm install --registry=https://registry.npmmirror.com && npm run dev
# → http://localhost:3001

# 搜索:Meilisearch 未启用(exe 已删除),默认走 SQLite LIKE 查询
# services/Meilisearch服务.js 探测不到 7700 端口时自动回退,无需任何启动步骤
```

访问:http://localhost:3001/twym/

## 文档

- [项目总览](./docs/项目总览.md) -- 技术栈、目录结构、数据库概览、npm scripts
- [代码参考](./docs/代码参考.md) -- 前后端架构、数据库设计、依赖、错误码
- [部署运维](./docs/部署运维.md) -- 服务器部署、Docker Compose + Caddy 配置、问题排查
- [API 接口文档](./docs/API接口文档.md) -- REST API 端点参考

## 许可证

MIT
