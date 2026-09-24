/**
 * 安全中间件
 * 防止常见攻击：洪水攻击、SQL注入、暴力破解、信息泄露
 */

// ===== 1. 请求限流（防止洪水攻击）=====
// 注意：此限流器基于内存 Map，仅在单进程模式下有效。
// 如果多实例部署（容器副本数 >1），需改用 Redis 等共享存储（如 rate-limit-redis）。

const requestCounts = new Map(); // IP → { count, resetTime }
const blockedIPs = new Set(); // 被封禁的IP黑名单

const RATE_LIMIT_WINDOW = 60 * 1000; // 60秒窗口
const RATE_LIMIT_MAX = 1000; // 每窗口最多1000请求（开发环境放宽）
const BLOCK_DURATION = 60 * 1000; // 超频封禁1分钟

// 定时清理过期的请求记录（防止内存泄漏）
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, record] of requestCounts) {
      if (now > record.resetTime + RATE_LIMIT_WINDOW) {
        requestCounts.delete(ip);
      }
    }
  },
  5 * 60 * 1000,
); // 每5分钟清理一次

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;

  // 检查黑名单
  if (blockedIPs.has(ip)) {
    return res.status(403).json({
      success: false,
      error: { code: "BLOCKED", message: "请求过于频繁，请1分钟后再试" },
    });
  }

  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    // 新窗口
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  } else {
    record.count++;
    if (record.count > RATE_LIMIT_MAX) {
      blockedIPs.add(ip);
      setTimeout(() => blockedIPs.delete(ip), BLOCK_DURATION);
      console.warn(`[SECURITY] IP ${ip} 请求超限，已封禁1分钟`);
      return res.status(429).json({
        success: false,
        error: { code: "RATE_LIMITED", message: "请求过于频繁，已临时封禁" },
      });
    }
  }

  next();
}

// 工厂函数 - 创建独立计数的限流中间件
function createRateLimiter(maxRequests, windowMs, label) {
  const counts = new Map();
  const blocked = new Set();
  const blockDuration = 10 * 60 * 1000;

  return function limiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;

    if (blocked.has(ip)) {
      return res.status(403).json({
        success: false,
        error: { code: "BLOCKED", message: "请求过于频繁，请10分钟后再试" },
      });
    }

    const now = Date.now();
    const record = counts.get(ip);

    if (!record || now > record.resetTime) {
      counts.set(ip, { count: 1, resetTime: now + windowMs });
    } else {
      record.count++;
      if (record.count > maxRequests) {
        blocked.add(ip);
        setTimeout(() => blocked.delete(ip), blockDuration);
        console.warn(`[SECURITY][${label}] IP ${ip} 请求超限，已封禁10分钟`);
        return res.status(429).json({
          success: false,
          error: { code: "RATE_LIMITED", message: "请求过于频繁，已临时封禁" },
        });
      }
    }

    next();
  };
}

// 搜索专用：600请求/分钟
const searchRateLimiter = createRateLimiter(600, 60 * 1000, "search");

// 管理接口专用：300请求/分钟
const adminRateLimiter = createRateLimiter(300, 60 * 1000, "admin");

// ===== 2. 安全响应头（防止信息泄露）=====

function securityHeaders(req, res, next) {
  // 禁止浏览器猜测Content-Type
  res.setHeader("X-Content-Type-Options", "nosniff");
  // 禁止嵌入iframe（防止点击劫持）
  res.setHeader("X-Frame-Options", "DENY");
  // XSS保护
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // 不暴露服务器信息
  res.removeHeader("X-Powered-By");
  // 控制 Referer 头，防止泄露内部路径
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // 限制浏览器功能（摄像头、麦克风、地理位置等）
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // 防止跨窗口泄漏（配合 COEP 可启用 crossOriginIsolated）
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
}

// ===== 3. 请求大小限制（防止超大请求攻击）=====

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

function bodySizeLimit(req, res, next) {
  const contentLength = parseInt(req.headers["content-length"] || "0");
  if (contentLength > MAX_BODY_SIZE) {
    return res.status(413).json({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE", message: "请求体过大，最大1MB" },
    });
  }
  next();
}

// ===== 4. 简单Token认证（管理员接口用）=====

const crypto = require("crypto");

function adminAuth(req, res, next) {
  const token = req.headers["x-admin-token"];
  const validToken = process.env.ADMIN_TOKEN;

  if (!validToken) {
    return res.status(500).json({
      success: false,
      error: { code: "ADMIN_NOT_CONFIGURED", message: "管理员未配置" },
    });
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "管理员Token无效" },
    });
  }

  // 使用 timingSafeEqual 防止时序攻击
  const tokenBuf = Buffer.from(token);
  const validBuf = Buffer.from(validToken);
  if (tokenBuf.length !== validBuf.length || !crypto.timingSafeEqual(tokenBuf, validBuf)) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "管理员Token无效" },
    });
  }

  next();
}

// ===== 5. SQL注入检测（额外防护层）=====
// 注意：仅检查 URL 参数和路径参数，不检查请求体。
// 请求体已由参数化查询保护，且正文中可能包含合法的 SQL 关键词（如词条解释）。

const SQL_INJECTION_PATTERNS = [
  // 单引号+SQL关键词组合（编码或未编码）
  /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
  /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
  /((\%27)|(\'))union/i,
  /exec(\s|\+)+(s|x)p\w+/i,
  // UNION SELECT（URL中不应出现）
  /UNION\s+SELECT/i,
  // 分号后跟SQL命令（URL中不应出现）
  /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)\s/i,
];

function sqlInjectionCheck(req, res, next) {
  const checkValue = (value) => {
    if (typeof value !== "string") return false;
    return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
  };

  const checkObject = (obj) => {
    if (!obj) return false;
    for (const key of Object.keys(obj)) {
      if (checkValue(obj[key]) || checkValue(key)) return true;
    }
    return false;
  };

  // 仅检查 query 和 params，不检查 body
  if (checkObject(req.query) || checkObject(req.params)) {
    console.warn(`[SECURITY] SQL注入尝试: ${req.ip} ${req.path}`);
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_INPUT", message: "输入包含非法字符" },
    });
  }

  next();
}

module.exports = {
  rateLimiter,
  createRateLimiter,
  searchRateLimiter,
  adminRateLimiter,
  securityHeaders,
  bodySizeLimit,
  adminAuth,
  sqlInjectionCheck,
};
