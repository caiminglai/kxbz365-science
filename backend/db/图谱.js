/**
 * 图谱数据层 —— 只有"边"落库（图谱关系 表），节点是算出来的：getNodes 直接读 词条 LEFT JOIN 学科 取学科颜色
 * 导出 getNodes / getLinks / addLink / deleteLink / deleteLinksByTermId，被 services/词条、services/管理、services/用户提交 使用
 * 图谱关系 没有外键约束，级联删除全靠调用方：删词条的路径必须显式调 deleteLinksByTermId，新加删除入口时忘了就会留下悬空节点ID
 * addLink 用 INSERT OR IGNORE，靠 schema 里的 UNIQUE(源节点ID, 目标节点ID) 保证同一条边重复添加不报错、也不产生重复边
 */

const { prepare } = require("./入口");

function getNodes() {
  return prepare(`
    SELECT t.词条ID, t.名称, t.学科, d.学科颜色, t.翻译
    FROM 词条 t
    LEFT JOIN 学科 d ON t.学科 = d.学科名称
  `).all();
}

function getLinks() {
  return prepare(`
    SELECT gl.源节点ID as source, gl.目标节点ID as target, gl.关系标签
    FROM 图谱关系 gl
  `).all();
}

function addLink(sourceId, targetId, label) {
  return prepare(
    `INSERT OR IGNORE INTO 图谱关系 (源节点ID, 目标节点ID, 关系标签) VALUES (?, ?, ?)`,
  ).run(sourceId, targetId, label || "");
}

function deleteLink(sourceId, targetId) {
  return prepare(
    "DELETE FROM 图谱关系 WHERE 源节点ID = ? AND 目标节点ID = ?",
  ).run(sourceId, targetId);
}

function deleteLinksByTermId(termId) {
  prepare("DELETE FROM 图谱关系 WHERE 源节点ID = ? OR 目标节点ID = ?").run(
    termId,
    termId,
  );
}

module.exports = {
  getNodes,
  getLinks,
  addLink,
  deleteLink,
  deleteLinksByTermId,
};