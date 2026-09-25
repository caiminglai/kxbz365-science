/**
 * 概念对比服务 —— A/B 双概念对照表的读写，被 routes/概念对比 调用
 * 导出 getComparisons / createComparison / updateComparison / deleteComparison
 * 坑：updateComparison 靠 allowedKeys + fieldMapping 两份表把英文字段映射成中文列名，加列必须两处同时改，否则字段被静默丢掉
 * createComparison 用的是 INSERT（非 REPLACE），重复 对比ID 会抛 UNIQUE 约束而不是覆盖
 * 三处写都显式 cache.invalidate("comparisons")，虽然 prepare().run() 已经会 clearAll，属重复但别反向删掉读侧缓存
 */

const { prepare, markDirty } = require("../db/入口");
const cache = require("./缓存");

function getComparisons() {
  return cache.remember("comparisons", () =>
    prepare("SELECT 对比ID as id, 标题 as title, A概念名称 as concept_a_name, A概念学科 as concept_a_discipline, A概念平述 as concept_a_plain, A概念症状 as concept_a_symptom, A概念类比 as concept_a_analogy, A概念修正 as concept_a_fix, B概念名称 as concept_b_name, B概念学科 as concept_b_discipline, B概念平述 as concept_b_plain, B概念症状 as concept_b_symptom, B概念类比 as concept_b_analogy, B概念修正 as concept_b_fix, 总结 as summary, 关系类型 as relationship_type FROM 概念对比").all(),
  );
}

function createComparison(payload) {
  const {
    id,
    title,
    concept_a_name,
    concept_a_discipline,
    concept_a_plain,
    concept_a_symptom,
    concept_a_analogy,
    concept_a_fix,
    concept_b_name,
    concept_b_discipline,
    concept_b_plain,
    concept_b_symptom,
    concept_b_analogy,
    concept_b_fix,
    summary,
    relationship_type,
  } = payload || {};

  const cmpId = id || `cmp_${Date.now()}`;

  const result = prepare(
    `INSERT INTO 概念对比 (对比ID, 标题, A概念名称, A概念学科, A概念平述, A概念症状, A概念类比, A概念修正, B概念名称, B概念学科, B概念平述, B概念症状, B概念类比, B概念修正, 总结, 关系类型) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    cmpId,
    title || "",
    concept_a_name || "",
    concept_a_discipline || "",
    concept_a_plain || "",
    concept_a_symptom || "",
    concept_a_analogy || "",
    concept_a_fix || "",
    concept_b_name || "",
    concept_b_discipline || "",
    concept_b_plain || "",
    concept_b_symptom || "",
    concept_b_analogy || "",
    concept_b_fix || "",
    summary || "",
    relationship_type || "关联性",
  );
  markDirty();
  cache.invalidate("comparisons");
  return { id: cmpId, changes: result.changes };
}

function updateComparison(id, updates) {
  if (!id) throw new Error("MISSING_ID");
  const fields = [];
  const values = [];
  const allowedKeys = [
    "title",
    "concept_a_name",
    "concept_a_discipline",
    "concept_a_plain",
    "concept_a_symptom",
    "concept_a_analogy",
    "concept_a_fix",
    "concept_b_name",
    "concept_b_discipline",
    "concept_b_plain",
    "concept_b_symptom",
    "concept_b_analogy",
    "concept_b_fix",
    "summary",
    "relationship_type",
  ];
  const fieldMapping = {
    title: "标题",
    concept_a_name: "A概念名称",
    concept_a_discipline: "A概念学科",
    concept_a_plain: "A概念平述",
    concept_a_symptom: "A概念症状",
    concept_a_analogy: "A概念类比",
    concept_a_fix: "A概念修正",
    concept_b_name: "B概念名称",
    concept_b_discipline: "B概念学科",
    concept_b_plain: "B概念平述",
    concept_b_symptom: "B概念症状",
    concept_b_analogy: "B概念类比",
    concept_b_fix: "B概念修正",
    summary: "总结",
    relationship_type: "关系类型",
  };
  for (const key of allowedKeys) {
    if (updates && updates[key] !== undefined) {
      fields.push(`${fieldMapping[key]} = ?`);
      values.push(updates[key]);
    }
  }
  if (fields.length === 0) {
    return { id, changes: 0 };
  }
  values.push(id);
  const result = prepare(
    `UPDATE 概念对比 SET ${fields.join(", ")} WHERE 对比ID = ?`,
  ).run(...values);
  markDirty();
  cache.invalidate("comparisons");
  return { id, changes: result.changes };
}

function deleteComparison(id) {
  if (!id) throw new Error("MISSING_ID");
  const result = prepare("DELETE FROM 概念对比 WHERE 对比ID = ?").run(id);
  markDirty();
  cache.invalidate("comparisons");
  return { id, changes: result.changes };
}

module.exports = {
  getComparisons,
  createComparison,
  updateComparison,
  deleteComparison,
};