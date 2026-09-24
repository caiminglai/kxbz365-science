const express = require("express");
const router = express.Router();
const adminService = require("../services/管理");
const dataQualityService = require("../services/数据质量");
const { adminAuth } = require("../middleware/安全");
const fs = require("fs");
const path = require("path");

// Obsidian 同步（非阻塞，失败不影响管理操作）
let obsidianSync = null;
try {
  obsidianSync = require("../services/Obsidian同步");
} catch {
  console.warn("[Obsidian Sync] 同步服务加载失败，DB→Obsidian 自动回写已禁用");
}
function syncTermToObsidian(termId) {
  if (!obsidianSync) return;
  try {
    const { prepare } = require("../db/入口");
    const raw = prepare("SELECT * FROM 词条 WHERE 词条ID = ?").get(termId);
    if (raw) obsidianSync.writeTermToObsidian(raw);
  } catch (e) {
    console.warn("[Obsidian Sync] 词条回写失败:", e.message);
  }
}
function deleteTermObsidian(termInfo) {
  if (!obsidianSync) return;
  try {
    obsidianSync.deleteTermFromObsidian(termInfo);
  } catch (e) {
    console.warn("[Obsidian Sync] 词条删除回写失败:", e.message);
  }
}

router.use(adminAuth);

// 输入验证辅助函数
function validateRequired(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length > 0) {
    return `缺少必要字段: ${missing.join(", ")}`;
  }
  return null;
}

router.get("/terms", (req, res) => {
  try {
    const { page, pageSize, search, discipline } = req.query;
    const { terms, total } = adminService.getAdminTerms(
      page,
      pageSize,
      search,
      discipline,
    );
    res.json({
      success: true,
      data: {
        terms,
        total,
        page: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 20,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

// 自动生成下一个词条ID（根据学科前缀）
router.get("/terms/next-id", (req, res) => {
  try {
    const { discipline } = req.query;
    if (!discipline) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_DISCIPLINE", message: "缺少学科参数" },
      });
    }
    const { prepare } = require("../db/入口");
    // 学科 → ID前缀映射
    const prefixMap = {
      '数学': 'm', '计算机': 'c', '经济学': 'e',
      '医学心理': 'd', '法律政策': 'l', '控制论': 'b',
      '跨学科': 'x', '物理学': 'p', '化学': 'ch', '生物学': 'bio',
    };
    const prefix = prefixMap[discipline] || discipline.charAt(0).toLowerCase();
    const safePrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rows = prepare(
      "SELECT 词条ID FROM 词条 WHERE 词条ID LIKE ?"
    ).all(prefix + '%');
    
    let maxNum = 0;
    let maxDigits = 3; // 默认3位数字
    const numRegex = new RegExp('^' + safePrefix + '(\\d+)$');
    
    for (const row of rows) {
      const match = row.词条ID.match(numRegex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
          maxDigits = match[1].length;
        } else if (num === maxNum && match[1].length > maxDigits) {
          maxDigits = match[1].length;
        }
      }
    }
    
    const nextNum = maxNum + 1;
    const nextId = prefix + String(nextNum).padStart(maxDigits, '0');
    
    res.json({ success: true, data: { nextId, discipline, prefix } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.get("/terms/export/csv", (req, res) => {
  try {
    const { discipline } = req.query;
    const terms = adminService.getTermsByDiscipline(discipline || null);
    const csv = adminService.termsToCsv(terms);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="terms_${ts}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "EXPORT_ERROR", message: error.message } });
  }
});

router.post("/terms/import/csv", (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || typeof content !== "string") {
      return res
        .status(400)
        .json({ success: false, error: { code: "MISSING_CSV", message: "请提供 CSV 内容" } });
    }
    const list = adminService.parseCsvToTerms(content);
    if (!Array.isArray(list) || list.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: { code: "EMPTY_CSV", message: "没有可导入的数据" } });
    }
    const normalized = list.map((item, idx) => ({
      id: item.id || item.term_id || `auto_${Date.now()}_${idx}`,
      discipline: item.discipline || "跨学科",
      name: item.name || item.term || "",
      translation: item.translation || item.translate || "",
      essence: item.essence || item.description || "",
      tip: item.tip || item.hint || "",
      hot:
        item.hot === "是" ||
        item.hot === 1 ||
        item.hot === "1" ||
        item.hot === true ||
        item.hot === "true",
    }));
    const result = adminService.batchCreateTerms(normalized);
    res.json({ success: true, data: { ...result, total: list.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "IMPORT_ERROR", message: error.message } });
  }
});

router.post("/terms", (req, res) => {
  try {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_BODY", message: "请求体必须是非空数组" },
      });
    }
    // 验证每个词条至少有 name 字段
    const invalid = req.body.filter((t) => !t.name || typeof t.name !== "string");
    if (invalid.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_FIELDS", message: "每个词条必须包含 name 字段（字符串类型）" },
      });
    }
    const result = adminService.batchCreateTerms(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.put("/terms/:id", (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_FIELDS", message: "没有要更新的字段" },
      });
    }
    const result = adminService.updateAdminTerm(req.params.id, req.body);
    syncTermToObsidian(req.params.id);
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

router.delete("/terms/:id", (req, res) => {
  try {
    // 先查询词条信息（用于删除 Obsidian 文件）
    let termInfo = null;
    if (obsidianSync) {
      const { prepare } = require("../db/入口");
      termInfo = prepare("SELECT 名称, 学科 FROM 词条 WHERE 词条ID = ?").get(req.params.id);
    }
    const result = adminService.deleteAdminTerm(req.params.id);
    deleteTermObsidian(termInfo);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.get("/terms/:id/history", (req, res) => {
  try {
    const data = adminService.getTermHistory(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.post("/graph/links", (req, res) => {
  try {
    const { sourceId, targetId, label } = req.body;
    if (!sourceId || !targetId) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "缺少 sourceId 或 targetId" },
      });
    }
    const result = adminService.addGraphLink(sourceId, targetId, label);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.delete("/graph/links", (req, res) => {
  try {
    const { source, target } = req.query;
    if (!source || !target) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "缺少 source 或 target 参数" },
      });
    }
    const result = adminService.deleteGraphLink(source, target);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.get("/disciplines", (req, res) => {
  try {
    const disciplines = adminService.getDisciplines();
    res.json({ success: true, data: disciplines });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.post("/disciplines", (req, res) => {
  try {
    const result = adminService.createDiscipline(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.message === "MISSING_FIELDS") {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "缺少必要字段" },
      });
    }
    if (error.message === "DUPLICATE_KEY") {
      return res.status(400).json({
        success: false,
        error: { code: "DUPLICATE_KEY", message: "学科名称已存在" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.put("/disciplines/order", (req, res) => {
  try {
    const { order } = req.body;
    const result = adminService.updateDisciplineOrder(order);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.message === "INVALID_ORDER") {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ORDER", message: "排序数据格式错误" },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.put("/disciplines/:id", (req, res) => {
  try {
    const result = adminService.updateDiscipline(req.params.id, req.body);
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

router.delete("/disciplines/:id", (req, res) => {
  try {
    const result = adminService.deleteDiscipline(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.message.startsWith("HAS_TERMS:")) {
      const count = error.message.split(":")[1];
      return res.status(400).json({
        success: false,
        error: {
          code: "HAS_TERMS",
          message: `该学科下还有 ${count} 个词条，无法删除`,
        },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.post("/backup", async (req, res) => {
  try {
    // 数据目录已迁移到项目根级
    const backupDir = path.join(__dirname, "..", "..", "data", "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `backup_${timestamp}.db`;
    const backupPath = path.join(backupDir, filename);

    const db = require("../db/入口");
    await db.saveDB();
    const dbPath = path.join(__dirname, "..", "..", "data", "同物异名.db");
    fs.copyFileSync(dbPath, backupPath);

    res.json({ success: true, data: { filename, timestamp } });
  } catch (err) {
    console.error("[Backup Error]", err);
    res.status(500).json({
      success: false,
      error: { code: "BACKUP_ERROR", message: err.message },
    });
  }
});

router.get("/backups", (req, res) => {
  const backupDir = path.join(__dirname, "..", "..", "data", "backups");
  if (!fs.existsSync(backupDir)) {
    return res.json({ success: true, data: [] });
  }

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => {
      const stat = fs.statSync(path.join(backupDir, f));
      return { name: f, size: stat.size, date: stat.mtime };
    })
    .sort((a, b) => b.date - a.date);

  res.json({ success: true, data: files });
});

router.get("/dashboard", (req, res) => {
  try {
    const stats = adminService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

router.get("/data-quality", (req, res) => {
  try {
    const report = dataQualityService.getQualityReport();
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
});

// ==================== Obsidian 同步接口 ====================

router.post("/sync-obsidian", (req, res) => {
  if (!obsidianSync) {
    return res.status(503).json({
      success: false,
      error: { code: "SYNC_UNAVAILABLE", message: "Obsidian 同步服务未加载" },
    });
  }
  try {
    const { modules, cleanOrphans } = req.body || {};
    const results = obsidianSync.fullSync({
      modules: modules || undefined,
      cleanOrphans: cleanOrphans !== false,
    });
    res.json({ success: true, data: results });
  } catch (error) {
    console.error("[Obsidian Sync] 全量同步失败:", error);
    res.status(500).json({
      success: false,
      error: { code: "SYNC_ERROR", message: error.message },
    });
  }
});

module.exports = router;
