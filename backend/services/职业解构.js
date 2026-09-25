/**
 * 职业解构服务 —— 职业主表加 阶段/技能/资源/项目 四张子表的 SQL 层
 * 导出 getCareers / getCategories / getCareerDetail / createCareer / batchCreate / deleteCareer / toCSV / parseCSV
 * getCareerDetail 打 5 次查询拼对象；deleteCareer 手工逐表 DELETE 五张表，没走外键级联
 * createCareer / batchCreate 都是 INSERT OR REPLACE：同 职业ID 整行覆盖，未传的字段会被清空
 * toCSV 带 \uFEFF BOM + \r\n；parseCSV 靠中文表头映射回英文字段，改表头要同步 mapping
 */

const { prepare } = require("../db/入口");
const { markDirty } = require("../db/入口");

function getCareers(category) {
  if (category) {
    return prepare(
      `SELECT 职业ID as id, 职业类别 as category, 职业名称 as name, 薪资范围 as salary, 学历要求 as education, 学习时长 as duration, 职业描述 as description, 显示顺序 as display_order FROM 职业解构 WHERE 职业类别 = ? ORDER BY 显示顺序 ASC`,
    ).all(category);
  }
  return prepare(
    `SELECT 职业ID as id, 职业类别 as category, 职业名称 as name, 薪资范围 as salary, 学历要求 as education, 学习时长 as duration, 职业描述 as description, 显示顺序 as display_order FROM 职业解构 ORDER BY 显示顺序 ASC`,
  ).all();
}

function getCategories() {
  const rows = prepare(
    `SELECT DISTINCT 职业类别 as category FROM 职业解构 WHERE 职业类别 IS NOT NULL AND 职业类别 != '' ORDER BY 职业类别`,
  ).all();
  return rows.map((r) => r.category);
}

function getCareerDetail(id) {
  const career = prepare(
    `SELECT 职业ID as id, 职业类别 as category, 职业名称 as name, 薪资范围 as salary, 学历要求 as education, 学习时长 as duration, 职业描述 as description, 显示顺序 as display_order FROM 职业解构 WHERE 职业ID = ?`,
  ).get(id);
  if (!career) return null;
  const stages = prepare(
    `SELECT 阶段ID as stage_id, 职业ID as career_id, 阶段顺序 as stage_order, 阶段名称 as stage_name, 阶段副标题 as stage_subtitle, 阶段时长 as duration FROM 职业阶段 WHERE 职业ID = ? ORDER BY 阶段顺序 ASC`,
  ).all(id);
  const skills = prepare(
    `SELECT 技能ID as skill_id, 职业ID as career_id, 阶段ID as stage_id, 技能顺序 as skill_order, 技能图标 as icon, 技能名称 as name, 技能描述 as description FROM 职业技能 WHERE 职业ID = ? ORDER BY 阶段ID, 技能顺序 ASC`,
  ).all(id);
  const resources = prepare(
    `SELECT 资源ID as resource_id, 职业ID as career_id, 资源类型 as type, 资源标题 as title, 资源描述 as description, 资源链接 as link FROM 职业资源 WHERE 职业ID = ?`,
  ).all(id);
  const projects = prepare(
    `SELECT 项目ID as project_id, 职业ID as career_id, 项目标题 as title, 项目步骤 as steps FROM 职业项目 WHERE 职业ID = ?`,
  ).all(id);
  return { career, stages, skills, resources, projects };
}

function createCareer(data) {
  const {
    id,
    category,
    name,
    salary,
    education,
    duration,
    description,
    display_order,
  } = data;
  if (!id || !category || !name || !description) {
    throw new Error("MISSING_FIELDS");
  }
  prepare(
    `INSERT OR REPLACE INTO 职业解构 (职业ID, 职业类别, 职业名称, 薪资范围, 学历要求, 学习时长, 职业描述, 显示顺序) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    category,
    name,
    salary || "",
    education || "",
    duration || "",
    description,
    display_order || 0,
  );
  markDirty();
  return { id };
}

function batchCreate(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error("EMPTY");
  let count = 0;
  for (const item of list) {
    const {
      id,
      category,
      name,
      salary,
      education,
      duration,
      description,
      display_order,
    } = item;
    if (id && category && name && description) {
      prepare(
        `INSERT OR REPLACE INTO 职业解构 (职业ID, 职业类别, 职业名称, 薪资范围, 学历要求, 学习时长, 职业描述, 显示顺序) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        category,
        name,
        salary || "",
        education || "",
        duration || "",
        description,
        display_order || 0,
      );
      count++;
    }
  }
  markDirty();
  return { success: count, failed: list.length - count };
}

function deleteCareer(id) {
  prepare(`DELETE FROM 职业解构 WHERE 职业ID = ?`).run(id);
  prepare(`DELETE FROM 职业阶段 WHERE 职业ID = ?`).run(id);
  prepare(`DELETE FROM 职业技能 WHERE 职业ID = ?`).run(id);
  prepare(`DELETE FROM 职业资源 WHERE 职业ID = ?`).run(id);
  prepare(`DELETE FROM 职业项目 WHERE 职业ID = ?`).run(id);
  markDirty();
  return { id };
}

function toCSV(careers) {
  const cols = [
    "id",
    "category",
    "name",
    "salary",
    "education",
    "duration",
    "description",
    "display_order",
  ];
  const header = [
    "ID",
    "分类",
    "职业名称",
    "薪资",
    "学历",
    "学习周期",
    "描述",
    "排序",
  ];
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
  for (const c of careers) {
    rows.push(cols.map((col) => esc(c[col])).join(","));
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
        分类: "category",
        职业名称: "name",
        薪资: "salary",
        学历: "education",
        学习周期: "duration",
        描述: "description",
        排序: "display_order",
      };
      if (mapping[field]) field = mapping[field];
      obj[field] = (cells[idx] || "").trim();
    });
    items.push(obj);
  }
  return items;
}

module.exports = {
  getCareers,
  getCategories,
  getCareerDetail,
  createCareer,
  batchCreate,
  deleteCareer,
  toCSV,
  parseCSV,
};