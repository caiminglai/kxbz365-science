const express = require('express');
const { prepare } = require('../db/入口');
const { adminAuth, suggestionRateLimiter } = require('../middleware/安全');
const router = express.Router();

// ========== 学科管理 ==========

// 获取学科子领域映射列表
router.get('/mapping', (req, res) => {
  try {
    const list = prepare(`
      SELECT m.*, d.学科颜色
      FROM 学科子领域映射 m
      LEFT JOIN 学科 d ON m.核心学科 = d.学科名称
      ORDER BY m.核心学科, m.显示顺序, m.子领域名称
    `).all();
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 按核心学科分组的映射
router.get('/mapping/grouped', (req, res) => {
  try {
    const all = prepare('SELECT * FROM 学科子领域映射 ORDER BY 核心学科, 显示顺序').all();
    const grouped = {};
    for (const item of all) {
      if (!grouped[item.核心学科]) {
        grouped[item.核心学科] = [];
      }
      grouped[item.核心学科].push(item);
    }
    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 新增子领域
router.post('/mapping', adminAuth, (req, res) => {
  try {
    const { 子领域名称, 核心学科, 显示顺序 = 99, 描述 = '' } = req.body;
    prepare(`
      INSERT INTO 学科子领域映射 (子领域名称, 核心学科, 显示顺序, 描述)
      VALUES (?, ?, ?, ?)
    `).run(子领域名称, 核心学科, 显示顺序, 描述);
    res.json({ success: true, message: '添加成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== 纠错建议 ==========

// 提交纠错建议
// 必填字段先校验长度再入库：这是匿名可写接口，不限不查就等于让一个人
// 一分钟往待审核队列里塞几百条几 MB 的垃圾
const 必填字段 = [['词条ID', 100], ['词条名称', 200], ['建议内容', 2000]];
const 选填字段 = [['纠错类型', 20, '学科归属'], ['提交者标识', 50, '匿名']];

router.post('/suggestions', suggestionRateLimiter, (req, res) => {
  const 已验证 = {};
  for (const [字段, 上限] of 必填字段) {
    const 原始 = typeof req.body?.[字段] === 'number' ? String(req.body[字段]) : req.body?.[字段];
    if (typeof 原始 !== 'string' || 原始.trim() === '') {
      return res.status(400).json({ success: false, message: `${字段} 不能为空` });
    }
    if (原始.trim().length > 上限) {
      return res.status(400).json({ success: false, message: `${字段} 超过 ${上限} 字` });
    }
    已验证[字段] = 原始.trim();
  }
  for (const [字段, 上限, 默认值] of 选填字段) {
    const 原始 = req.body?.[字段] ?? 默认值;
    if (typeof 原始 !== 'string' || 原始.length > 上限) {
      return res.status(400).json({ success: false, message: `${字段} 不合法（上限 ${上限} 字）` });
    }
    已验证[字段] = 原始;
  }

  try {
    const result = prepare(`
      INSERT INTO 词条纠错建议 (词条ID, 词条名称, 纠错类型, 建议内容, 提交者标识)
      VALUES (?, ?, ?, ?, ?)
    `).run(已验证.词条ID, 已验证.词条名称, 已验证.纠错类型, 已验证.建议内容, 已验证.提交者标识);
    res.json({ success: true, message: '建议已提交，感谢您的贡献', data: { 建议ID: result.lastInsertRowid } });
  } catch (err) {
    // err.message 里带着表名、列名和 SQL 片段，匿名请求方不该看到
    console.error('[纠错建议] 写入失败:', err.message);
    res.status(500).json({ success: false, message: '提交失败，请稍后再试' });
  }
});

// 获取纠错建议列表（需管理员权限）
router.get('/suggestions', adminAuth, (req, res) => {
  try {
    const { 状态 = '待审核', 纠错类型, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [];
    if (状态) {
      where += ' AND 状态 = ?';
      params.push(状态);
    }
    if (纠错类型) {
      where += ' AND 纠错类型 = ?';
      params.push(纠错类型);
    }
    const list = prepare(`
      SELECT * FROM 词条纠错建议
      ${where}
      ORDER BY 创建时间 DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset);
    const total = prepare(`SELECT COUNT(*) as cnt FROM 词条纠错建议 ${where}`).get(...params).cnt;
    res.json({ success: true, data: list, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 纠错统计
router.get('/suggestions/stats', (req, res) => {
  try {
    const stats = prepare(`
      SELECT 状态, COUNT(*) as 数量
      FROM 词条纠错建议
      GROUP BY 状态
    `).all();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
