/**
 * ============================================================
 *  SEO 着陆页 —— GET /t/<学科>/<名称>
 * ============================================================
 *
 *  这个文件干什么：
 *    给每个词条产出一份服务端渲染的语义化 HTML，让术语内容有一条不经
 *    JS 就能被抓到的路径。站点本体是 React SPA，爬虫抓 / 只拿得到空壳
 *    index.html，不做这一层，词库里 900+ 条术语等于对搜索引擎不存在。
 *
 *  为什么它必须挂在 server.js 的 express.static 与 SPA 兜底之前：
 *    server.js 末尾的 app.get("*") 会把任何未命中的 GET 伪装成 200 的
 *    index.html。/t/xxx 一旦落到兜底，所有词条页都会被收成同一个软 404 /
 *    重复页，比压根没有这个 URL 更糟。判据只能看 Content-Type 和字节数，
 *    状态码在兜底面前没有意义。
 *
 *  坑（都是实测出来的，不是假设）：
 *    1. 名称里带斜杠。977 条里 136 条名称含 "/"（如「表面张力/界面能」），
 *       用 /t/:学科/:名称 这种单段参数会直接漏掉 14% 的词条。所以这里不吃
 *       req.params，改成从 req.originalUrl 取 /t/ 之后的完整原始路径，按
 *       第一个 "/" 切段：第一段一定是学科（实测 0 个学科含 "/"），其余拼回
 *       名称。必须"先切段、再逐段解码"，反过来会让名称里的 %2F 提前解开、
 *       切错位置。
 *    2. 只解码一次。req.originalUrl 是 Node 交给 Express 的原始请求行，
 *       未经解码，所以这里手动 decodeURIComponent 是正确的；再解第二次就会
 *       把「50%25」这类值解坏。非法百分号转义统一当 404 处理，不抛 500。
 *    3. 出自数据库的字符串一律走 转义HTML，包括拼进 <title>、meta 和 JSON-LD
 *       的。实测 名称/本质/提示 三列里已有 7 行含 "<"，这不是理论风险。
 *    4. JSON-LD 内联在 <script> 里，"<" ">" "&" 必须再转成 \u00XX，否则内容
 *       出现 "</script>" 就会提前闭合标签。
 *    5. canonical 一律用 着陆页路径() 重新生成，不回显请求路径。这样
 *       /t/化学/表面张力/界面能 和 /t/化学/%E8%A1%A8...%2F... 两种拼法会归一
 *       到同一个 canonical，不会自己跟自己抢收录。
 * ============================================================
 */

const { prepare } = require("../db/入口");

/** 站点名，拼 <title> 与 DefinedTermSet 用 */
const 站点名 = "同物异名";

/** 着陆页内联的上架概念抗体条数；只为给爬虫一个相关内容锚点，全量内联会把页面撑大 */
const 最多抗体数 = 3;

/** 别名展示上限。跨学科别名 是自由 JSON 文本，脏数据里可能挂很长的数组 */
const 最多别名数 = 10;

/** meta description 的目标长度（按码点算，Google 中文摘要大致吃 120~160） */
const 摘要长度 = 150;

// ==================== 转义 ====================

const HTML转义表 = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * 整站着陆页唯一的 HTML 转义入口。
 * null / undefined 一律当空串：页面里漏出字面量 "undefined"/"null" 是真实事故。
 */
function 转义HTML(值) {
  if (值 === null || 值 === undefined) return "";
  return String(值).replace(/[&<>"']/g, (字符) => HTML转义表[字符]);
}

/**
 * JSON-LD 序列化。
 * JSON.stringify 只保证 JSON 合法，不保证在 <script> 里合法：
 * 这里额外掐掉 < > & 与 U+2028/U+2029（后两个在 JSON 字符串里合法、
 * 在 JS 源码里却是行终止符）。替换写的是 \u00XX 转义序列，解码后值不变。
 */
function 序列化JSON_LD(值) {
  return JSON.stringify(值)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// ==================== URL ====================

/** Host / X-Forwarded-Host 都来自客户端，只放行合法主机名字符，异常值一律不回显 */
const 合法主机 = /^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;

function 取首值(头) {
  const 值 = Array.isArray(头) ? 头[0] : 头;
  return String(值 === undefined || 值 === null ? "" : 值).split(",")[0].trim();
}

/**
 * 站点绝对前缀，例如 http://127.0.0.1:3000
 *
 * 刻意不读 process.env.FRONTEND_URL：那个变量在本仓是 Vite 开发服务器端口
 * （实测 .env 里是 http://localhost:3001，vite.config.ts 的 server.port 也是
 * 3001），线上由 Caddy 直接反代到本服务的 3000，拿它拼 canonical 会指向一个
 * 不存在的端口。这里按请求走，X-Forwarded-* 优先，兼容本机与备案域名两种部署。
 */
function 站点根(req) {
  const 转发协议 = 取首值(req.headers["x-forwarded-proto"]);
  const 协议 = 转发协议 === "https" || req.secure ? "https" : "http";
  const 主机 = 取首值(req.headers["x-forwarded-host"]) || 取首值(req.headers.host);
  if (!合法主机.test(主机)) {
    return `${协议}://localhost:${process.env.PORT || 3000}`;
  }
  return `${协议}://${主机}`;
}

/**
 * (学科, 名称) → /t/<编码学科>/<编码名称>
 *
 * encodeURIComponent 把空格编成 %20、中文编成 UTF-8 百分号序列，与本页解析
 * 时"先按 / 切段、再逐段 decode"严格互逆：名称里的 "/" 会被编成 %2F，留在同
 * 一段里，不会被当成路径分隔符。
 * 站点文件.js 生成 sitemap 时必须复用这个函数，两边各写一遍编码规则迟早会对不上。
 */
function 着陆页路径(学科, 名称) {
  return (
    "/t/" + encodeURIComponent(String(学科)) + "/" + encodeURIComponent(String(名称))
  );
}

/** SPA 里承载该词条的交互页 */
function 学科页路径(学科) {
  return "/discipline/" + encodeURIComponent(String(学科));
}

/**
 * 从原始请求行拆出 (学科, 名称)。
 * 返回 null 表示这不是一条合法的着陆页路径，调用方直接给 404。
 */
function 解析路径段(req) {
  const 原始 = String(req.originalUrl || req.url || "");
  const 路径 = 原始.split("?")[0].split("#")[0];
  const 前缀 = "/t/";
  if (!路径.startsWith(前缀)) return null;

  let 剩余 = 路径.slice(前缀.length);
  // 实测没有任何名称以 "/" 结尾，所以尾部斜杠可以安全剥掉，
  // 让 /t/数学/功率/ 这种爬虫爱加的写法不至于变成另一套 URL
  剩余 = 剩余.replace(/\/+$/, "");
  if (!剩余) return null;

  const 第一段 = 剩余.indexOf("/");
  if (第一段 <= 0) return null;

  const 原始段 = [剩余.slice(0, 第一段), 剩余.slice(第一段 + 1)];
  const 解码段 = 原始段.map(解码一次);
  if (解码段.some((段) => 段 === null || 段.trim() === "")) return null;

  return { 学科: 解码段[0], 名称: 解码段[1] };
}

/** 解码一次；非法百分号转义不是词条，按不存在处理 */
function 解码一次(段) {
  try {
    return decodeURIComponent(段);
  } catch {
    return null;
  }
}

// ==================== 数据 ====================

/**
 * 只取渲染要用的列。别名/抗体各自有专门的取法，不在这里 SELECT *
 *
 * ORDER BY 不是可选的：实测 977 行里有 10 组 (学科,名称) 重复，而且组内
 * 本质/翻译/提示 三列都各不相同。不写排序时 LIMIT 1 取到哪一行取决于物理行序，
 * 一次 VACUUM 或索引计划变化就会让同一 URL 换成另一份正文；而 站点文件.js 的
 * sitemap 是按 MAX(热度)/MAX(创建时间) 聚合的，这里用同一套优先级才能对上。
 */
function 查词条(学科, 名称) {
  return prepare(
    `SELECT 词条ID as id, 学科 as discipline, 名称 as name, 翻译 as translation,
            本质 as essence, 提示 as tip, 跨学科别名 as aliases, 创建时间 as created_at
     FROM 词条
     WHERE 学科 = ? AND 名称 = ?
     ORDER BY 热度 DESC, 创建时间 DESC, 词条ID ASC
     LIMIT 1`,
  ).get(学科, 名称);
}

/** 是否启用 为 NULL 视为上架，与 services/概念抗体维护.js 的公开口径保持一致 */
function 查抗体(词条ID) {
  return prepare(
    `SELECT 抗体标题 as title, 抗体类别 as category, 抗体描述 as description
     FROM 概念抗体
     WHERE 词条ID = ? AND COALESCE(是否启用, 1) <> 0
     ORDER BY 创建时间 DESC
     LIMIT ?`,
  ).all(词条ID, 最多抗体数);
}

/**
 * 跨学科别名 现网有两种历史形状：字符串数组（实测绝大多数）和
 * {discipline,name} 对象数组（services/词条.js 的写入路径产出的那种）。
 * 这里只认非空字符串，其余丢掉——别名只是 alternateName，不值得为它冒
 * 整页 500 的风险，也绝不拿它拼站内链接（别名文本不保证对应真实词条）。
 */
function 解析别名(原文) {
  if (!原文 || typeof 原文 !== "string") return [];
  let 数组;
  try {
    数组 = JSON.parse(原文);
  } catch {
    return [];
  }
  if (!Array.isArray(数组)) return [];
  return 数组
    .filter((项) => typeof 项 === "string" && 项.trim() !== "")
    .map((项) => 项.trim())
    .slice(0, 最多别名数);
}

// ==================== 渲染 ====================

/** 按码点截断，避免把 emoji / 生僻字的代理对切一半 */
function 截断(文本, 限) {
  const 码点 = Array.from(String(文本));
  if (码点.length <= 限) return String(文本);
  return 码点.slice(0, 限 - 1).join("") + "…";
}

/** 数据库正文可能带换行；逐段转义后再包 <p>，杜绝把 \n 直接糊进 HTML */
function 渲染段落(文本) {
  const 段列表 = String(文本)
    .split(/\r?\n+/)
    .map((段) => 段.trim())
    .filter(Boolean);
  if (段列表.length === 0) return "";
  return 段列表.map((段) => `<p>${转义HTML(段)}</p>`).join("");
}

/**
 * 纯渲染函数：数据全部由调用方传进来，不碰数据库。
 * 这样"上架抗体"这条现网还没数据的路径可以在探针里直接构造数据验证。
 */
function 渲染页面(词条, 抗体列表, 站点) {
  const 学科 = 词条.discipline || "";
  const 名称 = 词条.name || "";
  const 翻译 = 词条.translation || "";
  const 本质 = 词条.essence || "";
  const 提示 = 词条.tip || "";
  const 别名 = 解析别名(词条.aliases);

  const canonical = 站点 + 着陆页路径(学科, 名称);
  const 学科地址 = 站点 + 学科页路径(学科);

  const 标题文本 = 翻译 ? `${名称}（${翻译}）` : 名称;
  const 页面标题 = `${标题文本}是什么意思 - ${学科}术语 - ${站点名}`;

  const 摘要源 = 本质 || 提示 || 翻译 || `${标题文本}的解释`;
  const 摘要 = 截断(摘要源.replace(/\s+/g, " "), 摘要长度);

  // ---- JSON-LD ----
  const 词条对象 = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": canonical,
    name: 名称,
    description: 摘要,
    url: canonical,
    inDefinedBy: {
      "@type": "DefinedTermSet",
      name: `${站点名} · ${学科}`,
      url: 学科地址,
    },
  };
  if (翻译) 词条对象.alternateName = [翻译, ...别名];
  else if (别名.length) 词条对象.alternateName = 别名;
  if (抗体列表.length > 0) {
    // 上架的概念抗体就是"围绕这个术语的一页解释"，按 SubjectPage 的用法挂在 subjectOf 上
    词条对象.subjectOf = 抗体列表.map((抗体, 序) => ({
      "@type": "WebPage",
      "@id": `${canonical}#antibody-${序 + 1}`,
      name: 抗体.title || "",
      description: 抗体.description || "",
      category: 抗体.category || "",
    }));
  }

  // ---- 可见正文 ----
  const 别名块 = 别名.length
    ? `<h2>也叫</h2><ul>${别名.map((项) => `<li>${转义HTML(项)}</li>`).join("")}</ul>`
    : "";

  const 提示块 = 提示 ? `<h2>怎么理解</h2>${渲染段落(提示)}` : "";

  const 抗体块 = 抗体列表.length
    ? `<h2>常见误解</h2><ul>${抗体列表
        .map(
          (抗体) =>
            `<li><strong>${转义HTML(抗体.title)}</strong>${
              抗体.description ? `：${转义HTML(抗体.description)}` : ""
            }</li>`,
        )
        .join("")}</ul>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${转义HTML(页面标题)}</title>
<meta name="description" content="${转义HTML(摘要)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${转义HTML(canonical)}">
<style>body{margin:0 auto;padding:24px 16px;max-width:34em;font:16px/1.8 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#1f2328}h1{font-size:1.6em;margin:.2em 0 .1em}h2{font-size:1.05em;margin:1.6em 0 .3em;color:#57606a}a{color:#0b6cba}ul{padding-left:1.3em}.sub{color:#57606a;margin:.1em 0 1.2em}</style>
</head>
<body>
<main>
<article>
<h1>${转义HTML(名称)}</h1>
${翻译 ? `<p class="sub">${转义HTML(学科)} · ${转义HTML(翻译)}</p>` : `<p class="sub">${转义HTML(学科)}</p>`}
<h2>术语解释</h2>
${渲染段落(本质)}
${提示块}
${别名块}
${抗体块}
<p><a href="${转义HTML(学科页路径(学科))}">在交互版里浏览「${转义HTML(学科)}」的全部词条 →</a></p>
</article>
</main>
<script type="application/ld+json">${序列化JSON_LD(词条对象)}</script>
</body>
</html>
`;
}

// ==================== 响应 ====================

/**
 * 查无此词条必须是真 404。
 * 响应体是 text/plain 的一句中文，不是 JSON，也不能被 SPA 兜底换成 index.html。
 */
function 未找到(res) {
  res.status(404).type("text/plain; charset=utf-8").send("没有这个词条。");
}

/** 数据库异常同理：给一个真状态码的真页面，别把 500 也伪装成 200 */
function 服务不可用(res) {
  res.status(500).type("text/plain; charset=utf-8").send("服务暂时不可用。");
}

/**
 * 入口用的是函数式中间件，而不是 router.get("*", ...)。
 *
 * 原因实测出来的：Express 在为路由做参数匹配时，会先把整段路径
 * decodeURIComponent 一遍，遇到 /t/%E8%A1%A8%E9%9D 这种被截断的转义序列，
 * 会在进我 handler 之前就抛错，再被 server.js 的错误处理压成
 * 500 + application/json（当时实测：status=500 bytes=85）。
 * 挂成 app.use("/t", fn) 的纯中间件后，路径不进 path-to-regexp、不被预解码，
 * 解码时机完全由 解析路径段() 掌控，非法转义才能按设计回真 404。
 */
function 着陆页中间件(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const 段 = 解析路径段(req);
  if (!段) return 未找到(res);

  let 词条;
  try {
    词条 = 查词条(段.学科, 段.名称);
  } catch (错误) {
    console.error("[着陆页][查询失败]", 错误.message);
    return 服务不可用(res);
  }
  if (!词条) return 未找到(res);

  let 抗体列表 = [];
  try {
    抗体列表 = 查抗体(词条.id);
  } catch (错误) {
    // 抗体是锦上添花，取不到就把这一区块省掉，不能因此不出整页
    console.error("[着陆页][抗体查询失败]", 错误.message);
  }

  const html = 渲染页面(词条, 抗体列表, 站点根(req));
  res
    .status(200)
    .set("Cache-Control", "public, max-age=300")
    .type("text/html; charset=utf-8")
    .send(html);
}

module.exports = 着陆页中间件;

// 站点文件.js 与自测探针复用同一套编码/转义口径，避免两份实现漂移
module.exports.转义HTML = 转义HTML;
module.exports.序列化JSON_LD = 序列化JSON_LD;
module.exports.站点根 = 站点根;
module.exports.着陆页路径 = 着陆页路径;
module.exports.解析别名 = 解析别名;
module.exports.渲染页面 = 渲染页面;
module.exports.解析路径段 = 解析路径段;
