/**
 * 同物异名 - 后端入口
 * 启动: npm start
 * 开发: npm run dev (Node.js 18+ --watch)
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const compression = require("compression");

// 安全中间件
const {
  securityHeaders,
  bodySizeLimit,
  rateLimiter,
  searchRateLimiter,
  adminRateLimiter,
  sqlInjectionCheck,
} = require("./middleware/安全");
const { requestLogger, errorLogger } = require("./middleware/日志");

const db = require("./db/入口");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 性能层 - 响应压缩（Gzip/Brotli，放在最外层以压缩所有响应）=====
app.use(
  compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  }),
);

// ===== 安全层 =====
app.use(rateLimiter); // 通用限流：1000请求/分钟
app.use(securityHeaders); // 安全响应头
app.use(bodySizeLimit); // 请求大小限制
app.use(sqlInjectionCheck); // SQL注入检测

// ===== CORS =====
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [
        process.env.FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:3001",
      ].filter(Boolean);
      // 允许无origin（curl/Postman）
      if (!origin || allowed.some((a) => origin === a)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-token"],
  }),
);

// ===== JSON 解析（limit 与 bodySizeLimit 保持一致：1MB）=====
app.use(express.json({ limit: "1mb" }));

// ===== 请求日志（带响应状态+耗时+响应体大小）=====
app.use(requestLogger);

// ===== 公开路由（活跃，不需要认证）=====

// 搜索接口更严格限流：600请求/分钟（叠加在通用限流之上）
app.use("/api/v1/terms/search", searchRateLimiter);

app.use("/api/v1/terms", require("./routes/词条")); // 词条：列表/搜索/详情/学科
app.use("/api/v1/submissions", require("./routes/用户提交")); // 用户提交的同物异名
app.use("/api/v1/graph", require("./routes/知识图谱")); // 知识图谱：nodes + links
app.use("/api/v1/comparisons", require("./routes/概念对比")); // 概念对比
app.use("/api/v1/scenarios", require("./routes/情景还原")); // 情景还原
app.use("/api/v1/career", require("./routes/职业解构")); // 职业解构
app.use("/api/v1/industry", require("./routes/产业岗位")); // 产业岗位
app.use("/api/v1/antibody", require("./routes/概念抗体")); // 概念抗体
app.use("/api/v1/concept-antibodies", require("./routes/概念抗体公开")); // 概念抗体（前台只读区块，只回启用条目）
app.use("/api/v1/stats", require("./routes/统计")); // 统计 + 健康检查 + 用户反馈
app.use("/api/v1/jobs", require("./routes/高薪技术岗")); // 高薪技术岗（前端动态获取数据）
app.use("/api/v1/semantics", require("./routes/语义")); // 语义词典（同义/反义/简称/上下位）
app.use("/api/v1/domains", require("./routes/学科词库")); // 学科词库（19学科分表 7841 词）
app.use("/api/v1/community", require("./routes/社区协作")); // 社区协作（学科映射+纠错建议）

// ===== 公开路由：AI 问答（AI接口更严格限流：10请求/分钟，防止API额度被耗尽）=====
const aiRateLimiter = require("./middleware/安全").createRateLimiter(10, 60 * 1000, "ai");
app.use("/api/v1/ai", aiRateLimiter);
app.use("/api/v1/ai", require("./routes/AI问答"));

// ===== SEO 服务端渲染层 =====
// 位置是硬约束：必须早于下面的 express.static(distPath) 与 SPA 兜底 app.get("*")。
// 兜底会把任何未命中的 GET 伪装成 200 的 index.html（实测：挂载前
// GET /t/化学/功率 返回 200 + text/html + 1262 字节的 index.html），
// 那样 /t/ 下所有词条页都会被搜索引擎收成同一个重复页。
// 前缀是 /t 与两条精确路径，与 /api/v1/... 的现有挂载互不影响。
app.use("/t", require("./routes/着陆页")); // 词条着陆页：/t/<学科>/<名称>
app.use("/", require("./routes/站点文件")); // /sitemap.xml + /robots.txt

// ===== 管理路由（活跃，需要 x-admin-token）=====
// 注意：先注册具体子路由，最后注册通用 admin 路由，避免被截获

// ===== 管理接口统一更严格限流：300请求/分钟（叠加在通用限流之上）
app.use("/api/v1/admin", adminRateLimiter);

app.use("/api/v1/admin/career", require("./routes/职业解构")); // 职业解构管理
app.use("/api/v1/admin/industry", require("./routes/产业岗位")); // 产业岗位管理
app.use("/api/v1/admin/antibody", require("./routes/概念抗体")); // 概念抗体管理
app.use("/api/v1/admin/concept-antibodies", require("./routes/概念抗体管理")); // 概念抗体管理（admin.html 页签，须早于通用 admin 路由）
app.use("/api/v1/admin/jobs", require("./routes/高薪技术岗")); // 高薪技术岗管理
app.use("/api/v1/admin/reload-db", require("./routes/重载数据库")); // 重载数据库
app.use("/api/v1/admin", require("./routes/管理")); // 词条/学科/备份/仪表盘

// ===== 管理后台页面（简易HTML管理界面）=====

const adminHtmlPath = path.join(__dirname, "public", "admin.html");
if (fs.existsSync(adminHtmlPath)) {
  app.get("/admin", (req, res) => {
    res.type("html");
    res.sendFile(adminHtmlPath);
  });
}

// 概念抗体管理页面
const antibodyPath = path.join(__dirname, "public", "antibody.html");
if (fs.existsSync(antibodyPath)) {
  app.get("/admin/antibody", (req, res) => {
    res.type("html");
    res.sendFile(antibodyPath);
  });
}

// 职业解构管理页面
const careerPath = path.join(__dirname, "public", "career.html");
if (fs.existsSync(careerPath)) {
  app.get("/admin/career", (req, res) => {
    res.type("html");
    res.sendFile(careerPath);
  });
}

// 高薪技术岗管理页面
const jobsPath = path.join(__dirname, "public", "jobs.html");
if (fs.existsSync(jobsPath)) {
  app.get("/admin/jobs", (req, res) => {
    res.type("html");
    res.sendFile(jobsPath);
  });
}

// ===== 静态文件（前端dist目录）- 仅在非API请求时使用 =====

const distPath = path.join(__dirname, "..", "app", "dist");
if (fs.existsSync(distPath)) {
  // 注意：express.static 必须放在 API 路由之后，并且 app.get('*') 不能拦截 /api/* 请求
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    // 排除 API 请求，让它落到下面的 404 处理器
    if (req.path.startsWith("/api/")) {
      return next();
    }
    // 带扩展名却没被 express.static 命中 = 文件真的不存在，必须交给下面的 404 处理器。
    // 否则微信业务域名校验文件（WW_verify_xxx.txt）缺失时会被 index.html 顶替成 200，平台侧误判校验通过。
    if (/\.[a-zA-Z0-9]{1,8}$/.test(req.path)) {
      return next();
    }
    res.type("html");
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "接口不存在", path: req.path },
  });
});

// ===== 错误处理 =====
app.use(errorLogger);

// Error code to status code mapping
const ERROR_MAP = {
  'MISSING_PARAM': { status: 400, code: 'BAD_REQUEST' },
  'MISSING_FIELDS': { status: 400, code: 'BAD_REQUEST' },
  'MISSING_QUERY': { status: 400, code: 'BAD_REQUEST' },
  'MISSING_ID': { status: 400, code: 'BAD_REQUEST' },
  'MISSING_STATUS': { status: 400, code: 'BAD_REQUEST' },
  'MISSING_CSV': { status: 400, code: 'BAD_REQUEST' },
  'INVALID_PARAM': { status: 400, code: 'BAD_REQUEST' },
  'INVALID_ORDER': { status: 400, code: 'BAD_REQUEST' },
  'VALIDATION_ERROR': { status: 400, code: 'BAD_REQUEST' },
  'NO_FIELDS': { status: 400, code: 'BAD_REQUEST' },
  'NOT_FOUND': { status: 404, code: 'NOT_FOUND' },
  'UNAUTHORIZED': { status: 401, code: 'UNAUTHORIZED' },
  'RATE_LIMITED': { status: 429, code: 'RATE_LIMITED' },
  'DUPLICATE_KEY': { status: 409, code: 'DUPLICATE_KEY' },
  'HAS_TERMS': { status: 400, code: 'BAD_REQUEST' },
};

app.use((err, req, res, _next) => {
  const requestId = req.requestId || "unknown";
  
  // 错误分类和状态码映射
  let statusCode = 500;
  let errorCode = "INTERNAL_ERROR";
  let message = "服务器内部错误";
  
  // 根据错误前缀匹配状态码
  let matched = false;
  if (err.message) {
    for (const [prefix, config] of Object.entries(ERROR_MAP)) {
      if (err.message.startsWith(prefix)) {
        statusCode = config.status;
        errorCode = config.code;
        if (prefix === 'NOT_FOUND') message = '资源不存在';
        else if (prefix === 'UNAUTHORIZED') message = '未授权访问';
        else if (prefix === 'RATE_LIMITED') message = '请求过于频繁';
        else message = err.message;
        matched = true;
        break;
      }
    }
  }
  if (!matched) {
    statusCode = 500;
    errorCode = 'INTERNAL_ERROR';
    message = '服务器内部错误';
  }
  
  // 生产环境不返回详细错误信息
  const errorDetail = process.env.NODE_ENV === "production" 
    ? { code: errorCode, message }
    : { code: errorCode, message, requestId, detail: err.message };
  
  console.error(`[Server Error] ${requestId}: ${err.message}`);
  
  res.status(statusCode).json({
    success: false,
    error: errorDetail,
  });
});

// ===== 全局错误处理（模块作用域）=====
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection] at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Uncaught Exception]", error);
  try {
    db.closeDb();
  } catch (e) {
    // 忽略关闭错误
  }
  process.exit(1);
});

// ===== 启动 =====
async function startServer() {
  try {
    await db.initDB();

    // 进程退出时关闭数据库连接
    process.on("SIGINT", async () => {
      console.log("\n[Server] 正在关闭数据库...");
      db.closeDb();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      console.log("\n[Server] 正在关闭数据库...");
      db.closeDb();
      process.exit(0);
    });

    app.listen(PORT, () => {
      console.log("");
      console.log("╔══════════════════════════════════════════╗");
      console.log("║     同物异名 - 后端服务已启动           ║");
      console.log("║     安全加固版 v1.0                     ║");
      console.log("╠══════════════════════════════════════════╣");
      console.log(`║  API地址: http://localhost:${PORT}/api/v1    ║`);
      console.log(
        `║  健康检查: http://localhost:${PORT}/api/v1/stats/health ║`,
      );
      console.log("╠══════════════════════════════════════════╣");
      console.log("║  公开接口:                              ║");
      console.log("║    GET  /api/v1/terms          词条列表 ║");
      console.log("║    GET  /api/v1/terms/:id      单个词条 ║");
      console.log("║    GET  /api/v1/terms/search   搜索词条 ║");
      console.log("║    GET  /api/v1/graph/nodes    图谱节点 ║");
      console.log("║    GET  /api/v1/graph/links    图谱关系 ║");
      console.log("║    GET  /api/v1/comparisons    概念对比 ║");
      console.log("║    GET  /api/v1/scenarios      情景还原 ║");
      console.log("║    GET  /api/v1/stats          统计数据 ║");
      console.log("╠══════════════════════════════════════════╣");
      console.log("║  管理接口（需x-admin-token）:           ║");
      console.log("║    GET  /api/v1/admin/terms    词条管理 ║");
      console.log("║    POST /api/v1/admin/terms    批量创建 ║");
      console.log("║    PUT  /api/v1/admin/terms/:id 修改    ║");
      console.log("║    DEL  /api/v1/admin/terms/:id 删除    ║");
      console.log("║    POST /api/v1/admin/backup   备份数据 ║");
      console.log("║    GET  /api/v1/admin/dashboard 统计面板║");
      console.log("╚══════════════════════════════════════════╝");
      console.log("");
    });
  } catch (error) {
    console.error("[Startup Error]", error);
    process.exit(1);
  }
}

startServer();
