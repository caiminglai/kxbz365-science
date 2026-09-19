const express = require('express');
const { prepare } = require('../db/入口');
const { adminAuth } = require('../middleware/安全');
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

// 更新子领域的核心学科归属
router.put('/mapping/:子领域名称', adminAuth, (req, res) => {
  try {
    const { 核心学科, 显示顺序, 描述 } = req.body;
    const { 子领域名称 } = req.params;
    prepare(`
      UPDATE 学科子领域映射
      SET 核心学科 = ?, 显示顺序 = COALESCE(?, 显示顺序), 描述 = COALESCE(?, 描述),
          更新时间 = CURRENT_TIMESTAMP
      WHERE 子领域名称 = ?
    `).run(核心学科, 显示顺序 || null, 描述 || null, 子领域名称);
    res.json({ success: true, message: '更新成功' });
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

// 删除子领域
router.delete('/mapping/:子领域名称', adminAuth, (req, res) => {
  try {
    prepare('DELETE FROM 学科子领域映射 WHERE 子领域名称 = ?').run(req.params.子领域名称);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== 纠错建议 ==========

// 提交纠错建议
router.post('/suggestions', (req, res) => {
  try {
    const { 词条ID, 词条名称, 纠错类型 = '学科归属', 建议内容, 提交者标识 = '匿名' } = req.body;
    const result = prepare(`
      INSERT INTO 词条纠错建议 (词条ID, 词条名称, 纠错类型, 建议内容, 提交者标识)
      VALUES (?, ?, ?, ?, ?)
    `).run(词条ID, 词条名称, 纠错类型, 建议内容, 提交者标识);
    res.json({ success: true, message: '建议已提交，感谢您的贡献', data: { 建议ID: result.lastInsertRowid } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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

// 审核纠错建议
router.put('/suggestions/:建议ID', adminAuth, (req, res) => {
  try {
    const { 状态, 审核备注 = '' } = req.body;
    prepare(`
      UPDATE 词条纠错建议
      SET 状态 = ?, 审核备注 = ?, 审核时间 = CURRENT_TIMESTAMP
      WHERE 建议ID = ?
    `).run(状态, 审核备注, req.params.建议ID);
    res.json({ success: true, message: '审核完成' });
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
