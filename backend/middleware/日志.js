const _path = require("path");

const METHODS_WITH_BODY = ["POST", "PUT", "PATCH"];

// 生成请求ID
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatSize(bytes) {
  if (!bytes) return "0B";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function shouldLogBody(path) {
  if (!path) return false;
  if (path.includes("login")) return false;
  if (path.includes("token")) return false;
  if (path.includes("auth")) return false;
  if (path.includes("password")) return false;
  return true;
}

// 敏感字段过滤
function sanitizeBody(body) {
  if (!body || typeof body !== "object") return body;
  const sanitized = { ...body };
  const sensitiveFields = ["password", "token", "secret", "apiKey", "credential"];
  for (const field of sensitiveFields) {
    if (sanitized[field]) sanitized[field] = "***REDACTED***";
  }
  return sanitized;
}

function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = generateRequestId();
  req.requestId = requestId;
  
  const time = new Date().toLocaleTimeString("zh-CN");
  const originalSend = res.send;

  // 响应体大小统一由 send 统计：Express 的 res.json 会先序列化再调用 res.send，
  // 这里再包一层 json 只会让同一个响应被 stringify 两次。
  let bodySize = 0;
  res.send = function patchedSend(...args) {
    if (args[0] && typeof args[0] === "string") bodySize += args[0].length;
    return originalSend.apply(this, args);
  };

  // 添加请求ID到响应头
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const elapsed = Date.now() - start;
    const methodColor =
      res.statusCode >= 500
        ? "ERROR"
        : res.statusCode >= 400
          ? "WARN"
          : res.statusCode >= 300
            ? "REDIRECT"
            : "INFO";
    
    // 获取用户信息（如果有）
    const userId = req.headers["x-admin-token"] ? "admin" : "anonymous";
    
    console.log(
      `[${time}] [${methodColor}] ${requestId} ${req.method.padEnd(6)} ${req.path.padEnd(32)} ` +
        `→ ${res.statusCode}  ${elapsed}ms  ${formatSize(bodySize)}  ${req.ip || ""}  user:${userId}`,
    );
    
    if (
      METHODS_WITH_BODY.includes(req.method) &&
      req.body &&
      shouldLogBody(req.path)
    ) {
      const sanitizedBody = sanitizeBody(req.body);
      const preview =
        typeof sanitizedBody === "string"
          ? sanitizedBody.slice(0, 120)
          : JSON.stringify(sanitizedBody).slice(0, 120);
      if (preview) {
        console.log(
          `         body: ${preview}${preview.length >= 120 ? "..." : ""}`,
        );
      }
    }
  });

  next();
}

function errorLogger(err, req, res, next) {
  const time = new Date().toLocaleTimeString("zh-CN");
  const requestId = req.requestId || "unknown";
  
  // 错误分类
  const errorType = err.code || err.name || "UNKNOWN";
  
  console.error(
    `[${time}] [ERROR] ${requestId} ${req.method} ${req.path} → ${errorType}: ${err.message || err}`,
  );
  
  // 只在开发环境打印堆栈
  if (process.env.NODE_ENV !== "production" && err.stack) {
    console.error(err.stack.split("\n").slice(0, 5).join("\n"));
  }
  
  next(err);
}

module.exports = { requestLogger, errorLogger };
