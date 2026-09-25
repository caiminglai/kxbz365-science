/**
 * 词条路由 —— 同物异名主表的查询与增删改入口，挂在 /api/v1/terms
 * GET / 分页、/search、/recent、/hot、/disciplines、/random、/:id；POST|PUT|DELETE 需 adminAuth
 * 坑：所有具名路径都排在 /:id 之前，一旦把 /hot 之类挪到后面就会被 /:id 截走
 * /search 是唯一 async 的 handler，且 server.js 给它单独叠了 searchRateLimiter（600/分钟）
 * 错误统一按 message 字符串（MISSING_QUERY / NOT_FOUND / MISSING_FIELDS）翻译成状态码
 */

const express = require("express");
const router = express.Router();
const termsService = require("../services/词条");
const { adminAuth } = require("../middleware/安全");

router.get("/", (req, res) => {
  try {
    const { page, pageSize, discipline } = req.query;
    const { terms, total } = termsService.getTerms(page, pageSize, discipline);
    res.json({
      success: true,
      data: {
        terms,
        total,
        page: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 50,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.get("/search", async (req, res) => {
  try {
    const { q, limit } = req.query;
    const result = await termsService.searchTerms(q, limit);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.message === "MISSING_QUERY") {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_QUERY", message: "缺少搜索关键词" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.get("/recent", (req, res) => {
  try {
    const { limit } = req.query;
    const terms = termsService.getRecentTerms(limit);
    res.json({ success: true, data: terms });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.get("/hot", (req, res) => {
  try {
    const terms = termsService.getHotTerms();
    res.json({ success: true, data: terms });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.get("/disciplines", (req, res) => {
  try {
    const disciplines = termsService.getDisciplines();
    res.json({ success: true, data: disciplines });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.get("/random", (req, res) => {
  try {
    const { discipline } = req.query;
    const term = termsService.getRandomTerm(discipline);
    if (!term) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "没有找到词条" },
      });
    }
    res.json({ success: true, data: term });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.get("/:id", (req, res) => {
  try {
    const term = termsService.getTermById(req.params.id);
    res.json({ success: true, data: term });
  } catch (error) {
    if (error.message === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "词条不存在" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.post("/", adminAuth, (req, res) => {
  try {
    const result = termsService.createTerm(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.message === "MISSING_FIELDS") {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "缺少必填字段" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.put("/:id", adminAuth, (req, res) => {
  try {
    const result = termsService.updateTerm(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.message === "NO_FIELDS") {
      return res.status(400).json({
        success: false,
        error: { code: "NO_FIELDS", message: "没有要更新的字段" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.delete("/:id", adminAuth, (req, res) => {
  try {
    const result = termsService.deleteTerm(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

module.exports = router;
