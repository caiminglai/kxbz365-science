/**
 * 学科词库 API
 *
 * 数据来源：学科词库.db（实测 19 个学科分表，7841 词）
 * 每个学科一张独立表，结构：(id, 词语, 权重)
 * 另有「总览」视图：(学科, 词数)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { adminAuth } = require('../middleware/安全');
const Database = require('better-sqlite3');

// ── 数据库连接（只读，用于查询） ─
const DB_PATH = path.join(__dirname, '..', '..', 'data', '学科词库.db');
let db;
let writeDb;  // 可写连接，仅用于管理删除操作
let 表名列表 = [];

try {
  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');
  // 可写连接（管理操作专用）
  writeDb = new Database(DB_PATH);
  writeDb.pragma('journal_mode = WAL');
  // 加载所有学科表名（排除 sqlite_ 内部表和视图）
  表名列表 = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(r => r.name);
  console.log('[学科库] 学科词库已加载，共 ' + 表名列表.length + ' 个学科分表');
} catch (err) {
  console.warn('[学科库] 学科词库未找到，相关接口不可用');
  console.warn('  运行: node scripts/导入学科词库.js');
}

// ── 主数据库连接（只读，用于过滤已录入的术语） ──
const MAIN_DB_PATH = path.join(__dirname, '..', '..', 'data', '同物异名.db');
let mainDb;
let 已录入术语 = new Set();

try {
  mainDb = new Database(MAIN_DB_PATH, { readonly: true });
  mainDb.pragma('journal_mode = WAL');
  const rows = mainDb.prepare('SELECT 名称 FROM 词条').all();
  for (const r of rows) 已录入术语.add(r.名称);
  console.log('[学科库] 主数据库已连接，已录入 ' + 已录入术语.size + ' 条术语');
} catch (err) {
  console.warn('[学科库] 主数据库未找到，术语过滤不可用');
}

// ── 主库学科 → 学科词库表名 映射 ──
const 学科映射 = {
  '数学': ['数学科学'],
  '物理学': ['物理科学'],
  '化学': ['化学化工'],
  '生物学': ['动植生物', '医药医学'],
  '计算机': ['计算机业'],
  '经济学': ['金融财经'],
  '法律政策': ['法律诉讼'],
  '医学心理': ['医药医学'],
  '控制论': ['管理科学'],
  '跨学科': ['社会科学', '管理科学'],
};

// ── 中间件：检查数据库可用 ──
function checkDb(req, res, next) {
  if (!db) {
    return res.status(503).json({
      error: '学科词库未初始化',
      hint: '请运行 npm run import:学科'
    });
  }
  next();
}

router.use(checkDb);

// ── 查询词语所属学科（跨所有分表搜索） ──
// GET /api/v1/domains/lookup?word=机器学习
router.get('/lookup', (req, res) => {
  const { word } = req.query;
  if (!word || word.trim().length === 0) {
    return res.status(400).json({ error: '缺少 word 参数' });
  }

  try {
    const results = [];
    for (const tableName of 表名列表) {
      const rows = db.prepare(`
        SELECT 权重 FROM "${tableName}" WHERE 词语 = ? LIMIT 20
      `).all(word.trim());
      for (const r of rows) {
        results.push({ domain: tableName, weight: r.权重 });
      }
    }
    results.sort((a, b) => b.weight - a.weight);

    res.json({
      word: word.trim(),
      domains: results.slice(0, 20),
      count: results.length
    });
  } catch (err) {
    console.error('[学科库] lookup错误:', err.message);
    res.status(500).json({ error: '查询失败' });
  }
});

// ── 模糊搜索词语 ──
// GET /api/v1/domains/search?q=量子&domain=数学科学
router.get('/search', (req, res) => {
  const { q, domain, limit = 50 } = req.query;
  if (!q || q.trim().length === 0) {
    return res.status(400).json({ error: '缺少 q 参数' });
  }

  const maxLimit = Math.min(parseInt(limit) || 50, 200);
  const keyword = q.trim();

  try {
    let results;
    if (domain) {
      // 指定学科：直接查对应表
      if (!表名列表.includes(domain)) {
        return res.status(400).json({ error: '未知学科: ' + domain, available: 表名列表 });
      }
      results = db.prepare(`
        SELECT 词语, 权重 FROM "${domain}"
        WHERE 词语 LIKE ?
        ORDER BY 权重 DESC LIMIT ?
      `).all(`%${keyword}%`, maxLimit);
      results = results.map(r => ({ ...r, 学科: domain }));
    } else {
      // 全学科搜索
      results = [];
      for (const tableName of 表名列表) {
        const rows = db.prepare(`
          SELECT 词语, 权重 FROM "${tableName}"
          WHERE 词语 LIKE ?
          ORDER BY 权重 DESC LIMIT ?
        `).all(`%${keyword}%`, maxLimit);
        for (const r of rows) {
          results.push({ ...r, 学科: tableName });
        }
      }
      results.sort((a, b) => b.权重 - a.权重);
      results = results.slice(0, maxLimit);
    }

    res.json({
      query: keyword,
      domain: domain || '全部',
      results,
      count: results.length
    });
  } catch (err) {
    console.error('[学科库] search错误:', err.message);
    res.status(500).json({ error: '查询失败' });
  }
});

// ── 获取学科列表及词数（使用总览视图） ──
// GET /api/v1/domains/list
router.get('/list', (req, res) => {
  try {
    const results = db.prepare('SELECT 学科, 词数 FROM 总览 ORDER BY 词数 DESC').all();
    res.json({
      domains: results,
      total: results.length
    });
  } catch (err) {
    console.error('[学科库] list错误:', err.message);
    res.status(500).json({ error: '查询失败' });
  }
});

// ── 统计信息 ──
// GET /api/v1/domains/stats
router.get('/stats', (req, res) => {
  try {
    const results = db.prepare('SELECT 学科, 词数 FROM 总览 ORDER BY 词数 DESC').all();
    const 总词数 = results.reduce((sum, r) => sum + r.词数, 0);

    res.json({
      总词数,
      学科数: results.length,
      前十大: results.slice(0, 10)
    });
  } catch (err) {
    console.error('[学科库] stats错误:', err.message);
    res.status(500).json({ error: '查询失败' });
  }
});

// ── 术语候选：返回学科词库中尚未录入主库的术语 ──
// GET /api/v1/domains/suggestions?discipline=数学&q=函数&limit=20
// 也支持直接传 domain=数学科学（跳过映射）
router.get('/suggestions', (req, res) => {
  const { discipline, domain, q, limit = 20 } = req.query;

  let domains = [];
  if (discipline) {
    domains = 学科映射[discipline] || [];
    if (domains.length === 0) {
      return res.json({ discipline, suggestions: [], count: 0, 已录入数: 已录入术语.size });
    }
  } else if (domain) {
    domains = [domain];
  } else {
    return res.status(400).json({ error: '缺少 discipline 或 domain 参数' });
  }

  const maxLimit = Math.min(parseInt(limit) || 20, 100);
  const keyword = q ? q.trim() : '';

  try {
    const allCandidates = [];
    for (const d of domains) {
      if (!表名列表.includes(d)) continue;
      let rows;
      if (keyword) {
        rows = db.prepare(`
          SELECT 词语, 权重, '${d}' as 来源
          FROM "${d}"
          WHERE 词语 LIKE ?
          ORDER BY 权重 DESC LIMIT ?
        `).all(`%${keyword}%`, maxLimit * 3);
      } else {
        rows = db.prepare(`
          SELECT 词语, 权重, '${d}' as 来源
          FROM "${d}"
          ORDER BY 权重 DESC LIMIT ?
        `).all(maxLimit * 3);
      }
      allCandidates.push(...rows);
    }

    // 去重 + 过滤已录入 + 按权重排序
    const seen = new Set();
    const results = [];
    allCandidates
      .sort((a, b) => b.权重 - a.权重)
      .forEach(r => {
        if (!seen.has(r.词语) && !已录入术语.has(r.词语)) {
          seen.add(r.词语);
          results.push(r);
        }
      });

    const final = results.slice(0, maxLimit);

    res.json({
      discipline: discipline || '',
      domains,
      keyword: keyword || '',
      suggestions: final,
      count: final.length,
      已录入数: 已录入术语.size
    });
  } catch (err) {
    console.error('[学科库] suggestions错误:', err.message);
    res.status(500).json({ error: '查询失败' });
  }
});

// ── 词库管理：模糊搜索（返回 id，用于勾选删除） ──
// GET /api/v1/domains/manage/search?domain=教育教学&q=大学&limit=200
router.get('/manage/search', (req, res) => {
  const { domain, q, limit = 200 } = req.query;
  if (!domain) return res.status(400).json({ error: '缺少 domain 参数' });
  if (!q || q.trim().length === 0) return res.status(400).json({ error: '缺少 q 参数' });
  if (!表名列表.includes(domain)) {
    return res.status(400).json({ error: '未知学科: ' + domain, available: 表名列表 });
  }

  const maxLimit = Math.min(parseInt(limit) || 200, 1000);
  const keyword = q.trim();

  try {
    const results = db.prepare(`
      SELECT id, 词语, 权重 FROM "${domain}"
      WHERE 词语 LIKE ?
      ORDER BY 权重 DESC LIMIT ?
    `).all(`%${keyword}%`, maxLimit);

    const total = db.prepare(`SELECT COUNT(*) as c FROM "${domain}" WHERE 词语 LIKE ?`).get(`%${keyword}%`);

    res.json({
      domain,
      query: keyword,
      results,
      matched: total.c,
      returned: results.length
    });
  } catch (err) {
    console.error('[学科库] manage/search错误:', err.message);
    res.status(500).json({ error: '查询失败' });
  }
});

// ── 词库管理：批量删除 ──
// POST /api/v1/domains/manage/delete  body: { domain, words: ["词1","词2",...] }
router.post('/manage/delete', adminAuth, (req, res) => {
  const { domain, words } = req.body;
  if (!domain) return res.status(400).json({ error: '缺少 domain 参数' });
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: '缺少 words 数组或为空' });
  }
  if (!表名列表.includes(domain)) {
    return res.status(400).json({ error: '未知学科: ' + domain, available: 表名列表 });
  }

  try {
    if (!writeDb) {
      return res.status(500).json({ error: '数据库可写连接未初始化' });
    }
    const stmt = writeDb.prepare(`DELETE FROM "${domain}" WHERE 词语 = ?`);
    const deleteMany = writeDb.transaction((list) => {
      let deleted = 0;
      for (const w of list) {
        const info = stmt.run(w);
        deleted += info.changes;
      }
      return deleted;
    });
    const deletedCount = deleteMany(words);

    res.json({
      success: true,
      domain,
      requested: words.length,
      deleted: deletedCount
    });
  } catch (err) {
    console.error('[学科库] manage/delete错误:', err.message);
    res.status(500).json({ error: '删除失败' });
  }
});

// ── 获取某学科下的词语（分页） ──
// GET /api/v1/domains/:domain?offset=0&limit=100
router.get('/:domain', (req, res) => {
  const { domain } = req.params;
  const { offset = 0, limit = 100 } = req.query;
  const maxLimit = Math.min(parseInt(limit) || 100, 1000);
  const off = parseInt(offset) || 0;

  if (!表名列表.includes(domain)) {
    return res.status(404).json({ error: '未知学科: ' + domain, available: 表名列表 });
  }

  try {
    const results = db.prepare(`
      SELECT 词语, 权重 FROM "${domain}"
      ORDER BY 权重 DESC LIMIT ? OFFSET ?
    `).all(maxLimit, off);

    const total = db.prepare(`SELECT COUNT(*) as c FROM "${domain}"`).get();

    res.json({
      domain,
      words: results,
      total: total.c,
      offset: off,
      limit: maxLimit
    });
  } catch (err) {
    console.error('[学科库] domain错误:', err.message);
    res.status(500).json({ error: '查询失败' });
  }
});

module.exports = router;
