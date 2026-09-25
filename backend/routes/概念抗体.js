const express = require("express");
const router = express.Router();
const antibodyService = require("../services/概念抗体");
const { adminAuth } = require("../middleware/安全");

// Obsidian 同步（非阻塞）
let obsidianSync = null;
try {
  obsidianSync = require("../services/Obsidian同步");
} catch { /* 同步服务不可用 */ }

function syncAntibodyToObsidian(abId) {
  if (!obsidianSync) return;
  try {
    const { prepare } = require("../db/入口");
    const raw = prepare(
      `SELECT a.*, t.学科, t.名称 as 词条名称
       FROM 概念抗体 a LEFT JOIN 词条 t ON a.词条ID = t.词条ID
       WHERE a.抗体ID = ?`
    ).get(abId);
    if (raw) obsidianSync.writeAntibodyToObsidian(raw);
  } catch (e) {
    console.warn("[Obsidian Sync] 概念抗体回写失败:", e.message);
  }
}
function deleteAntibodyObsidian(abId) {
  if (!obsidianSync) return;
  try {
    const { prepare } = require("../db/入口");
    const info = prepare(
      `SELECT a.抗体标题, t.学科
       FROM 概念抗体 a LEFT JOIN 词条 t ON a.词条ID = t.词条ID
       WHERE a.抗体ID = ?`
    ).get(abId);
    if (info) obsidianSync.deleteAntibodyFromObsidian(info);
  } catch (e) {
    console.warn("[Obsidian Sync] 概念抗体删除回写失败:", e.message);
  }
}

router.get("/", (req, res) => {
  try {
    const { term_id, category } = req.query;
    const antibodies = antibodyService.getAntibodies(term_id, category);
    res.json({ success: true, data: antibodies });
  } catch (error) {
    console.error("[Antibody Error]", error);
    res.status(500).json({
      success: false,
      error: { code: "ANTIBODY_ERROR", message: error.message },
    });
  }
});

router.get("/categories", (req, res) => {
  try {
    const categories = antibodyService.getCategories();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "GET_CATEGORIES_ERROR", message: error.message } });
  }
});

router.get("/export/csv", adminAuth, (req, res) => {
  try {
    const { term_id, category } = req.query;
    // 导出是备份用途，下架条目必须一起带走，所以显式传 includeDisabled
    const list = antibodyService.getAntibodies(term_id, category, true);
    const csv = antibodyService.toCSV(list);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="antibody_${ts}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "EXPORT_ERROR", message: error.message } });
  }
});

router.post("/import/csv", adminAuth, (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content) {
      return res
        .status(400)
        .json({ success: false, error: { code: "MISSING_CSV", message: "请提供 CSV 内容" } });
    }
    const list = antibodyService.parseCSV(content);
    if (!Array.isArray(list) || list.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: { code: "EMPTY_CSV", message: "没有可导入的数据" } });
    }
    const result = antibodyService.batchCreate(list);
    res.json({ success: true, data: { ...result, total: list.length } });
  } catch (error) {
    console.error("[Antibody Import Error]", error);
    res.status(500).json({ success: false, error: { code: "IMPORT_ERROR", message: error.message } });
  }
});

router.post("/", adminAuth, (req, res) => {
  try {
    const result = antibodyService.createAntibody(req.body);
    syncAntibodyToObsidian(result.id);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.message === "MISSING_FIELDS") {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "缺少必要字段" },
      });
    }
    console.error("[Antibody Create Error]", error);
    res.status(500).json({
      success: false,
      error: { code: "ANTIBODY_CREATE_ERROR", message: error.message },
    });
  }
});

router.delete("/:id", adminAuth, (req, res) => {
  try {
    // 先查询信息（用于删除 Obsidian 文件）
    deleteAntibodyObsidian(req.params.id);
    const result = antibodyService.deleteAntibody(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("[Antibody Delete Error]", error);
    res.status(500).json({
      success: false,
      error: { code: "ANTIBODY_DELETE_ERROR", message: error.message },
    });
  }
});

module.exports = router;
