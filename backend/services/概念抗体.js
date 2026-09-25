/**
 * 概念抗体服务 —— 词条「抗体」（误区纠正）表的读写 + CSV 导入导出
 * 导出 getAntibodies / getCategories / createAntibody / batchCreate / deleteAntibody / toCSV / parseCSV
 * 与 services/概念抗体维护.js 共用 概念抗体 表，共用同一套 是否启用 语义（NULL 视为启用）
 * getAntibodies 默认滤掉已下架条目，includeDisabled=true 才给全量（只有管理端导出该传）
 * toCSV 输出带 \uFEFF BOM 且用 \r\n 换行（Excel 需要），parseCSV 反向把中文表头映射回英文字段，两者表头必须对齐
 * 写侧一律走 UPSERT：整行覆盖会把 是否启用 打回默认值，等于偷偷重新上架
 */

const { prepare } = require("../db/入口");
const { markDirty } = require("../db/入口");

function getAntibodies(termId, category, includeDisabled = false) {
  // COALESCE 让 ALTER 补列前的 NULL 老行算作启用；管理端导出传 includeDisabled=true 拿全量备份
  const 启用闸门 = includeDisabled ? "1=1" : "COALESCE(是否启用, 1) <> 0";
  let sql = `SELECT 抗体ID as id, 词条ID as term_id, 抗体标题 as title, 抗体描述 as description, 抗体类别 as category, 抗体内容 as content, 创建时间 as created_at FROM 概念抗体 WHERE ${启用闸门}`;
  const params = [];
  if (termId) {
    sql += ` AND 词条ID = ?`;
    params.push(termId);
  }
  if (category) {
    sql += ` AND 抗体类别 = ?`;
    params.push(category);
  }
  sql += ` ORDER BY 创建时间 DESC`;
  return prepare(sql).all(...params);
}

function getCategories() {
  const rows = prepare(
    `SELECT DISTINCT 抗体类别 as category FROM 概念抗体 WHERE 抗体类别 IS NOT NULL AND 抗体类别 != '' ORDER BY 抗体类别`,
  ).all();
  return rows.map((r) => r.category);
}

/**
 * 新增/更新共用一条 UPSERT。
 *
 * 故意不用 INSERT OR REPLACE：REPLACE 是删行重插，会把 是否启用 打回默认值，
 * 于是「已下架的条目被旧管理页编辑一次、或被一批 CSV 导入覆盖一次，就偷偷重新上架」。
 * CSV 表头里没有启用列，所以导入同样保留原行的状态。
 */
const UPSERT_SQL = `INSERT INTO 概念抗体 (抗体ID, 词条ID, 抗体标题, 抗体描述, 抗体类别, 抗体内容)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(抗体ID) DO UPDATE SET
       词条ID = excluded.词条ID, 抗体标题 = excluded.抗体标题,
       抗体描述 = excluded.抗体描述, 抗体类别 = excluded.抗体类别,
       抗体内容 = excluded.抗体内容`;

function createAntibody(data) {
  const { id, term_id, title, description, category, content } = data;
  if (!id || !term_id || !title) throw new Error("MISSING_FIELDS");
  prepare(UPSERT_SQL).run(
    id,
    term_id,
    title,
    description || "",
    category || "",
    content || "",
  );
  markDirty();
  return { id };
}

function batchCreate(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error("EMPTY");
  let count = 0;
  for (const item of list) {
    const { id, term_id, title, description, category, content } = item;
    if (id && term_id && title) {
      prepare(UPSERT_SQL).run(
        id,
        term_id,
        title,
        description || "",
        category || "",
        content || "",
      );
      count++;
    }
  }
  markDirty();
  return { success: count, failed: list.length - count };
}

function deleteAntibody(id) {
  prepare(`DELETE FROM 概念抗体 WHERE 抗体ID = ?`).run(id);
  markDirty();
  return { id };
}

function toCSV(antibodies) {
  const cols = ["id", "term_id", "title", "category", "description", "content"];
  const header = ["ID", "关联词条", "标题", "分类", "描述", "内容"];
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (
      s.includes(",") ||
      s.includes('"') ||
      s.includes("\n") ||
      s.includes("\r")
    ) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const rows = [header.join(",")];
  for (const a of antibodies) {
    rows.push(cols.map((c) => esc(a[c])).join(","));
  }
  return "\uFEFF" + rows.join("\r\n");
}

function parseCSV(text) {
  if (!text || typeof text !== "string") return [];
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const parseLine = (line) => {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          result.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
    }
    result.push(cur);
    return result;
  };
  const records = [];
  let buf = "";
  let inQ = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') {
      if (inQ && body[i + 1] === '"') {
        buf += '"';
        i++;
      } else {
        inQ = !inQ;
        buf += '"';
      }
    } else if ((ch === "\n" || ch === "\r") && !inQ) {
      records.push(buf);
      buf = "";
      if (ch === "\r" && body[i + 1] === "\n") i++;
    } else {
      buf += ch;
    }
  }
  if (buf.trim().length > 0 || records.length > 0) records.push(buf);
  const lines = records.filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const normalizedHeader = parseLine(lines[0]).map((c) => c.trim());
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    if (cells.every((c) => !c || !c.trim())) continue;
    const obj = {};
    normalizedHeader.forEach((key, idx) => {
      let field = key;
      const mapping = {
        ID: "id",
        关联词条: "term_id",
        标题: "title",
        分类: "category",
        描述: "description",
        内容: "content",
      };
      if (mapping[field]) field = mapping[field];
      obj[field] = (cells[idx] || "").trim();
    });
    items.push(obj);
  }
  return items;
}

module.exports = {
  getAntibodies,
  getCategories,
  createAntibody,
  batchCreate,
  deleteAntibody,
  toCSV,
  parseCSV,
};
