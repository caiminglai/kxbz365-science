/**
 * 产业岗位服务 —— 产业拆解 / 产业链环节 / 产业岗位 三张表的 SQL 访问层
 * 导出 getIndustries / getIndustryDetail / createIndustry / deleteIndustry，仅被 routes/产业岗位 调用
 * createIndustry 用 INSERT OR REPLACE：同 产业ID 会整行覆盖，不是局部更新
 * deleteIndustry 手工逐表 DELETE 三张表（没靠外键级联），以后加子表必须记得同步补一条
 * 读路径没接 services/缓存，跟 知识图谱/情景还原 不一样，这两个读接口每次都真打库
 */

const { prepare } = require("../db/入口");
const { markDirty } = require("../db/入口");

function getIndustries() {
  return prepare(
    `SELECT 产业ID as id, 产业名称 as name, 产业描述 as description, 核心描述 as core_desc, 显示顺序 as display_order, 创建时间 as created_at FROM 产业拆解 ORDER BY 显示顺序 ASC`,
  ).all();
}

function getIndustryDetail(id) {
  const industry = prepare(
    `SELECT 产业ID as id, 产业名称 as name, 产业描述 as description, 核心描述 as core_desc, 显示顺序 as display_order, 创建时间 as created_at FROM 产业拆解 WHERE 产业ID = ?`,
  ).get(id);
  if (!industry) return null;

  const links = prepare(
    `SELECT 环节ID as id, 产业ID as industry_id, 环节顺序 as link_order, 环节名称 as name, 环节描述 as description, 环节角色 as roles, 利润占比 as profit_share FROM 产业链环节 WHERE 产业ID = ? ORDER BY 环节顺序 ASC`,
  ).all(id);
  const roles = prepare(
    `SELECT 岗位ID as id, 产业ID as industry_id, 环节ID as link_id, 岗位名称 as name, 岗位描述 as description, 岗位薪资 as salary, 岗位要求 as requirements FROM 产业岗位 WHERE 产业ID = ? ORDER BY 环节ID ASC`,
  ).all(id);

  return { industry, links, roles };
}

function createIndustry(data) {
  const { id, name, description, core_desc, display_order } = data;

  if (!id || !name || !description) {
    throw new Error("MISSING_FIELDS");
  }

  prepare(
    `INSERT OR REPLACE INTO 产业拆解 (产业ID, 产业名称, 产业描述, 核心描述, 显示顺序) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    id,
    name,
    description,
    core_desc || "从芯片到系统，拆解万亿产业链的核心岗位与利润分配",
    display_order || 0,
  );
  markDirty();
  return { id };
}

function deleteIndustry(id) {
  prepare(`DELETE FROM 产业拆解 WHERE 产业ID = ?`).run(id);
  prepare(`DELETE FROM 产业链环节 WHERE 产业ID = ?`).run(id);
  prepare(`DELETE FROM 产业岗位 WHERE 产业ID = ?`).run(id);
  markDirty();
  return { id };
}

module.exports = {
  getIndustries,
  getIndustryDetail,
  createIndustry,
  deleteIndustry,
};