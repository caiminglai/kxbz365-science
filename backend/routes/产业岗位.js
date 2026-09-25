/**
 * 产业岗位路由 —— 产业链拆解（产业 / 环节 / 岗位）的 HTTP 入口
 * GET / 产业列表；GET /:id 产业详情（industry + links + roles）；POST / 新增；DELETE /:id 删除
 * server.js 把同一份 router 挂两处：/api/v1/industry（公开读）与 /api/v1/admin/industry（管理写）
 * POST/DELETE 都显式挂了 middleware/安全 的 adminAuth（校验 x-admin-token），新写接口漏挂等于把写库公开
 * 本层只做 try/catch + {success,error} 包装，SQL 和级联删除全在 services/产业岗位
 */

const express = require("express");
const router = express.Router();
const industryService = require("../services/产业岗位");
const { adminAuth } = require("../middleware/安全");

router.get("/", (req, res) => {
  try {
    const industries = industryService.getIndustries();
    res.json({ success: true, data: industries });
  } catch (error) {
    console.error("[Industry Error]", error);
    res.status(500).json({
      success: false,
      error: { code: "INDUSTRY_ERROR", message: error.message },
    });
  }
});

router.get("/:id", (req, res) => {
  try {
    const detail = industryService.getIndustryDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "产业不存在" },
      });
    }
    res.json({ success: true, data: detail });
  } catch (error) {
    console.error("[Industry Detail Error]", error);
    res.status(500).json({
      success: false,
      error: { code: "INDUSTRY_DETAIL_ERROR", message: error.message },
    });
  }
});

router.post("/", adminAuth, (req, res) => {
  try {
    const result = industryService.createIndustry(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.message === "MISSING_FIELDS") {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "缺少必要字段" },
      });
    }
    console.error("[Industry Create Error]", error);
    res.status(500).json({
      success: false,
      error: { code: "INDUSTRY_CREATE_ERROR", message: error.message },
    });
  }
});

router.delete("/:id", adminAuth, (req, res) => {
  try {
    const result = industryService.deleteIndustry(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("[Industry Delete Error]", error);
    res.status(500).json({
      success: false,
      error: { code: "INDUSTRY_DELETE_ERROR", message: error.message },
    });
  }
});

module.exports = router;
