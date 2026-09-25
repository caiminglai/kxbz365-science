/**
 * ============================================================
 *  站点文件 —— /sitemap.xml 与 /robots.txt
 * ============================================================
 *
 *  这个文件干什么：
 *    给搜索引擎两个入口。sitemap 把 /t/ 着陆页全量交出去，robots 划清
 *    可抓与不可抓的边界。两者都是每次请求现算，不落地成静态文件——
 *    词库一直在改，落地的文件迟早和库不一致。
 *
 *  为什么它必须挂在 server.js 的 express.static 与 SPA 兜底之前：
 *    server.js 的兜底对带扩展名的路径会 next() 到 JSON 404，所以改之前
 *    /robots.txt 与 /sitemap.xml 实测都是 404 + application/json。挂在
 *    静态资源之后则会被 express.static 抢先（dist 下若哪天真有一个
 *    robots.txt，路由就永远不生效）。
 *
 *  坑：
 *    1. <loc> 必须与 /t/ 路由实际接受的字符串逐字节一致，所以这里复用
 *       着陆页.js 导出的 着陆页路径() 与 站点根()，不在此重写编码规则。
 *    2. 词条表里 (学科,名称) 有重复行（实测 977 行 / 967 个不同组合），
 *       不去重就会往 sitemap 里写重复 URL，属于明确的 sitemap 质量问题。
 *       GROUP BY 去重，<lastmod> 取组内最大值。
 *    3. 词条表没有"更新时间"列，只有 创建时间。所以 <lastmod> 只能用
 *       组内 MAX(创建时间)，含义是"这个页面上最新一条数据的落库日期"，
 *       不是编辑时间；格式只到 YYYY-MM-DD，因为库里的值不带时区，
 *       硬编一个 Z 或 +08:00 都是假信息。
 *    4. 站点绝对前缀按请求算，绝不写死域名：本机 127.0.0.1:3000 与线上
 *       备案域名要出各自的正确 URL。
 * ============================================================
 */

const express = require("express");
const router = express.Router();
const { prepare } = require("../db/入口");
const { 转义HTML, 站点根, 着陆页路径 } = require("./着陆页");

/**
 * sitemap 条数上限。
 *
 * 协议上限是 50000 条 / 未压缩 50MB（sitemaps.org），这里取 5000 的理由：
 *   - 现网实测 977 条，5000 留了 5 倍余量，短期内不会真的截断；
 *   - 这份文件每次请求都全量重算并整体吐出，5000 条 ≈ 1MB 量级，仍是
 *     搜索引擎一次抓取能舒服吃下的规模；
 *   - 真要过万，正确做法是拆 sitemap index + 分片文件，而不是把这个常量
 *     继续往上调，所以它同时是一个"该分片了"的显式提醒。
 * 超限时按 热度 DESC、创建时间 DESC 截断：优先把热门词条留在里面。
 */
const 最大条目数 = 5000;

/** 只取到日；库里是 "YYYY-MM-DD HH:MM:SS" 且不带时区 */
function 取日期(值) {
  const 文本 = String(值 === null || 值 === undefined ? "" : 值);
  return /^\d{4}-\d{2}-\d{2}/.test(文本) ? 文本.slice(0, 10) : "";
}

/** 去重后的着陆页清单，按热度→时间排序并截断 */
function 列出着陆页() {
  return prepare(
    `SELECT 学科 as discipline, 名称 as name,
            MAX(热度) as hot, MAX(创建时间) as updated
     FROM 词条
     GROUP BY 学科, 名称
     ORDER BY hot DESC, updated DESC
     LIMIT ?`,
  ).all(最大条目数);
}

router.get("/sitemap.xml", (req, res) => {
  let 条目;
  try {
    条目 = 列出着陆页();
  } catch (错误) {
    console.error("[站点文件][sitemap失败]", 错误.message);
    return res.status(500).type("text/plain; charset=utf-8").send("sitemap 暂不可用。");
  }

  const 站点 = 站点根(req);
  const 地址列表 = 条目
    .map((行) => {
      const loc = 站点 + 着陆页路径(行.discipline, 行.name);
      const 日 = 取日期(行.updated);
      return (
        "  <url>\n" +
        `    <loc>${转义HTML(loc)}</loc>\n` +
        (日 ? `    <lastmod>${日}</lastmod>\n` : "") +
        "  </url>"
      );
    })
    .join("\n");

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    地址列表 +
    "\n</urlset>\n";

  res
    .status(200)
    .set("Cache-Control", "public, max-age=3600")
    .type("application/xml; charset=utf-8")
    .send(xml);
});

router.get("/robots.txt", (req, res) => {
  const 站点 = 站点根(req);
  // 着陆页是这次做的全部意义所在，显式 Allow 一遍，免得日后有人加 Disallow: /
  // 把 /t/ 顺手关掉。公开只读 API 同样放开：内容就是词条正文，被抓走无害。
  const 正文 = [
    "# 同物异名 - 术语学习站",
    "",
    "User-agent: *",
    "Allow: /t/",
    "Allow: /api/v1/",
    "# 管理后台页面与写接口，不需要也不应该被收录",
    "Disallow: /admin",
    "Disallow: /api/v1/admin",
    "",
    "# Sitemap 的路径部分固定为 /sitemap.xml；",
    "# 协议要求这一行必须是绝对 URL，所以域名跟着请求走，这里不写死。",
    `Sitemap: ${站点}/sitemap.xml`,
    "",
  ].join("\n");

  res
    .status(200)
    .set("Cache-Control", "public, max-age=3600")
    .type("text/plain; charset=utf-8")
    .send(正文);
});

module.exports = router;
