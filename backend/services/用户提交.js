const { prepare, exec, markDirty } = require("../db/入口");
const graphDb = require("../db/图谱");
const cache = require("./缓存");
const { validateString, validateEnum } = require("../utils/验证器");

let schemaInitialized = false;

// 状态枚举
const STATUS_VALUES = ["pending", "approved", "rejected"];
// 提交类型枚举
const TYPE_VALUES = ["pair", "term"];

function initSchema() {
  if (schemaInitialized) return;
  
  // 使用 CREATE TABLE IF NOT EXISTS，保留已有数据
  exec(`
    CREATE TABLE IF NOT EXISTS 用户提交 (
      提交ID INTEGER PRIMARY KEY AUTOINCREMENT,
      提交类型 TEXT DEFAULT 'pair',
      术语1 TEXT,
      术语2 TEXT,
      解释 TEXT,
      示例 TEXT,
      联系方式 TEXT,
      词条名称 TEXT,
      词条学科 TEXT,
      词条翻译 TEXT,
      词条本质 TEXT,
      词条提示 TEXT,
      词条别名 TEXT DEFAULT '[]',
      状态 TEXT DEFAULT 'pending',
      审核备注 TEXT,
      创建时间 INTEGER,
      更新时间 INTEGER
    )
  `);
  schemaInitialized = true;
}

function createSubmission(data) {
  initSchema();
  
  // 参数验证
  if (!data || typeof data !== "object") {
    throw new Error("INVALID_DATA");
  }
  
  const type = validateEnum(data.submission_type, "submission_type", TYPE_VALUES);
  const now = Math.floor(Date.now() / 1000);

  if (type === "pair") {
    // pair 类型验证：术语1和术语2必填
    const term1 = validateString(data.term1, "term1", { required: true, maxLength: 500 });
    const term2 = validateString(data.term2, "term2", { required: true, maxLength: 500 });
    const explanation = validateString(data.explanation, "explanation", { maxLength: 2000 });
    const contact = validateString(data.contact, "contact", { maxLength: 200 });
    const examples = validateString(data.examples, "examples", { maxLength: 2000 });
    
    const result = prepare(
      "INSERT INTO 用户提交 (提交类型, 术语1, 术语2, 解释, 示例, 联系方式, 状态, 创建时间, 更新时间) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "pair",
      term1,
      term2,
      explanation,
      examples,
      contact,
      "pending",
      now,
      now,
    );
    markDirty();
    cache.invalidate("submissions");
    return { id: result.lastInsertRowid };
  }

  // type === 'term'
  const term_name = validateString(data.term_name, "term_name", { required: true, maxLength: 500 });
  const term_discipline = validateString(data.term_discipline, "term_discipline", { required: true, maxLength: 100 });
  const term_translation = validateString(data.term_translation, "term_translation", { maxLength: 500 });
  const term_essence = validateString(data.term_essence, "term_essence", { maxLength: 2000 });
  const term_tip = validateString(data.term_tip, "term_tip", { maxLength: 1000 });
  const term_aliases = Array.isArray(data.term_aliases) ? data.term_aliases : [];
  const contact = validateString(data.contact, "contact", { maxLength: 200 });
  
  const aliasesJson = JSON.stringify(term_aliases);
  const result = prepare(
    "INSERT INTO 用户提交 (提交类型, 词条名称, 词条学科, 词条翻译, 词条本质, 词条提示, 词条别名, 联系方式, 状态, 创建时间, 更新时间) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    "term",
    term_name,
    term_discipline,
    term_translation || "",
    term_essence || "",
    term_tip || "",
    aliasesJson,
    contact || "",
    "pending",
    now,
    now,
  );
  markDirty();
  return { id: result.lastInsertRowid };
}

function parseSubmission(row) {
  if (row && row.aliases) {
    try {
      const parsed = JSON.parse(row.aliases);
      row.aliases = Array.isArray(parsed) ? parsed : [];
    } catch {
      row.aliases = [];
    }
  }
  return row;
}

function getSubmissions(status) {
  initSchema();
  let rows;
  if (status) {
    rows = prepare(
      "SELECT 提交ID as id, 提交类型 as submission_type, 术语1 as term1, 术语2 as term2, 解释 as explanation, 示例 as examples, 联系方式 as contact, 词条名称 as term_name, 词条学科 as term_discipline, 词条翻译 as term_translation, 词条本质 as term_essence, 词条提示 as term_tip, 词条别名 as aliases, 状态 as status, 审核备注 as review_note, 创建时间 as created_at, 更新时间 as updated_at FROM 用户提交 WHERE 状态 = ? ORDER BY 创建时间 DESC",
    ).all(status);
  } else {
    rows = prepare("SELECT 提交ID as id, 提交类型 as submission_type, 术语1 as term1, 术语2 as term2, 解释 as explanation, 示例 as examples, 联系方式 as contact, 词条名称 as term_name, 词条学科 as term_discipline, 词条翻译 as term_translation, 词条本质 as term_essence, 词条提示 as term_tip, 词条别名 as aliases, 状态 as status, 审核备注 as review_note, 创建时间 as created_at, 更新时间 as updated_at FROM 用户提交 ORDER BY 创建时间 DESC").all();
  }
  return rows.map(parseSubmission);
}

function updateStatus(id, status, reviewNote) {
  initSchema();
  if (!id) throw new Error("MISSING_ID");
  if (!status) throw new Error("MISSING_STATUS");
  const now = Math.floor(Date.now() / 1000);
  const result = prepare(
    "UPDATE 用户提交 SET 状态 = ?, 审核备注 = ?, 更新时间 = ? WHERE 提交ID = ?",
  ).run(status, reviewNote || "", now, id);
  markDirty();
  return { changes: result.changes };
}

function getCountByStatus() {
  initSchema();
  const rows = prepare(
    "SELECT 状态 as status, COUNT(*) as count FROM 用户提交 GROUP BY 状态",
  ).all();
  const result = { pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) {
    if (row.status in result) {
      result[row.status] = row.count;
    } else {
      result[row.status] = row.count;
    }
  }
  return result;
}

function _buildTermId(discipline, name) {
  const safeName = (name || "")
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${discipline || ""}_${safeName}`;
}

function approveSubmission(id) {
  initSchema();
  if (!id) throw new Error("MISSING_ID");
  const submission = prepare("SELECT 提交ID as id, 提交类型 as submission_type, 术语1 as term1, 术语2 as term2, 解释 as explanation, 示例 as examples, 联系方式 as contact, 词条名称 as term_name, 词条学科 as term_discipline, 词条翻译 as term_translation, 词条本质 as term_essence, 词条提示 as term_tip, 词条别名 as aliases, 状态 as status, 审核备注 as review_note, 创建时间 as created_at, 更新时间 as updated_at FROM 用户提交 WHERE 提交ID = ?").get(id);
  if (!submission) throw new Error("NOT_FOUND");
  if (submission.status === "approved") return { term_id: null, inserted: 0 };

  const submissionType = submission.submission_type || "pair";
  const submissionAliases = (() => {
    try {
      const parsed = JSON.parse(submission.aliases || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  let inserted = 0;
  let termId = null;

  if (submissionType === "term") {
    const discipline = submission.term_discipline;
    const name = submission.term_name;
    if (!discipline || !name) {
      throw new Error("MISSING_FIELDS");
    }
    termId = _buildTermId(discipline, name);
    const insertResult = prepare(
      `INSERT OR IGNORE INTO 词条 (词条ID, 学科, 名称, 翻译, 本质, 提示, 跨学科别名, 热度) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      termId,
      discipline,
      name,
      submission.term_translation || "",
      submission.term_essence || "",
      submission.term_tip || "",
      JSON.stringify(submissionAliases),
      1,
    );
    inserted = insertResult.changes || 0;
  } else {
    const term1Name = submission.term1;
    const term2Name = submission.term2;
    const explanation = submission.explanation || "";
    if (!term1Name || !term2Name) {
      throw new Error("MISSING_FIELDS");
    }
    const term1Id = `pair_${_buildTermId("pair", term1Name)}`;
    const term2Id = `pair_${_buildTermId("pair", term2Name)}`;
    const r1 = prepare(
      `INSERT OR IGNORE INTO 词条 (词条ID, 学科, 名称, 翻译, 本质, 提示, 跨学科别名, 热度) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(term1Id, "pair", term1Name, "", "", "", "[]", 1);
    inserted += r1.changes || 0;
    const r2 = prepare(
      `INSERT OR IGNORE INTO 词条 (词条ID, 学科, 名称, 翻译, 本质, 提示, 跨学科别名, 热度) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(term2Id, "pair", term2Name, "", "", "", "[]", 1);
    inserted += r2.changes || 0;
    graphDb.addLink(term1Id, term2Id, explanation || "同物异名");
    termId = term1Id;
  }

  prepare("UPDATE 用户提交 SET 状态 = ?, 更新时间 = ? WHERE 提交ID = ?").run(
    "approved",
    Math.floor(Date.now() / 1000),
    id,
  );
  markDirty();
  cache.invalidatePrefix("terms_");
  cache.invalidate("disciplines", "graph_nodes", "graph_links", "comparisons");
  return { term_id: termId, inserted };
}

function rejectSubmission(id) {
  initSchema();
  if (!id) throw new Error("MISSING_ID");
  const result = prepare(
    "UPDATE 用户提交 SET 状态 = ?, 更新时间 = ? WHERE 提交ID = ?",
  ).run("rejected", Math.floor(Date.now() / 1000), id);
  markDirty();
  cache.invalidate("disciplines", "graph_nodes", "graph_links", "comparisons");
  return { changes: result.changes };
}

function deleteSubmission(id) {
  initSchema();
  if (!id) throw new Error("MISSING_ID");
  const result = prepare("DELETE FROM 用户提交 WHERE 提交ID = ?").run(id);
  markDirty();
  return { changes: result.changes };
}

module.exports = {
  createSubmission,
  getSubmissions,
  updateStatus,
  getCountByStatus,
  approveSubmission,
  rejectSubmission,
  deleteSubmission,
};
