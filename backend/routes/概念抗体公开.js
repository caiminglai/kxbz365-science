/**
 * 概念抗体公开只读端点 —— 供前台 /antibody 页的「实战抗体库」区块取数
 *
 * 免鉴权，所以只回白名单字段且只回启用条目：本站出过匿名路由把内部字段
 * 整份吐出去的事，这里一律显式列名，不用 SELECT *，也不透传任何错误细节。
 */
const express = require("express");
const router = express.Router();
const service = require("../services/概念抗体维护");

/** 匿名接口不设上限的话，条目一多就是免费的大体积响应 */
const 单次最大条数 = 50;

router.get("/", (req, res) => {
  try {
    let 条目 = service.列公开条目();
    const 请求条数 = Number.parseInt(req.query.limit, 10);
    if (Number.isInteger(请求条数) && 请求条数 > 0) {
      条目 = 条目.slice(0, Math.min(请求条数, 单次最大条数));
    } else {
      条目 = 条目.slice(0, 单次最大条数);
    }
    res.json({ success: true, data: 条目 });
  } catch (error) {
    console.error("[概念抗体公开][列表失败]", error);
    res.status(500).json({
      success: false,
      error: { code: "ANTIBODY_LIST_ERROR", message: "暂时无法获取概念抗体" },
    });
  }
});

module.exports = router;
