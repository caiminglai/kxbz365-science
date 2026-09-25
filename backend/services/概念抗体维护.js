/**
 * 概念抗体维护 - 管理后台「概念抗体」页签与前台只读区块的数据访问
 *
 * 与 services/概念抗体.js 共用 概念抗体 表：那张表已被 antibody.html 独立管理页
 * 和 /api/v1/antibody 在写在读，另起一张 concept_antibodies 并行表会让同一批内容
 * 出现两个真源，所以这里只补「启用开关」这一维度的读写，不新建表。
 */
const { prepare } = require("../db/入口");

/**
 * 前台免鉴权接口只吐这几列。显式列名而不是 SELECT *，
 * 是为了以后表里加了内部字段（审核备注、软删除标记等）不会被顺带泄露出去。
 */
const 公开列 = `抗体ID as id, 词条ID as term_id, 抗体标题 as title,
       抗体类别 as category, 抗体描述 as description,
       抗体内容 as content, 创建时间 as created_at`;

/** 是否启用为 NULL 视为启用：老行经 ALTER 补列后是 NULL，行为要与改造前一致 */
const 启用条件 = `COALESCE(是否启用, 1) <> 0`;

/** 管理端列表：含停用的，多带一个 enabled 供页签判断该显示上架还是下架 */
function 列管理条目() {
  return prepare(
    `SELECT ${公开列}, 是否启用 as enabled FROM 概念抗体 ORDER BY 创建时间 DESC`,
  ).all();
}

/** 前台列表：只返回启用条目，字段严格限于公开列 */
function 列公开条目() {
  return prepare(
    `SELECT ${公开列} FROM 概念抗体 WHERE ${启用条件} ORDER BY 创建时间 DESC`,
  ).all();
}

function 查条目(抗体ID) {
  return prepare(`SELECT * FROM 概念抗体 WHERE 抗体ID = ?`).get(抗体ID);
}

/**
 * 新增或更新（管理页签的保存按钮统一走 POST，编辑时 id 已存在）
 *
 * 故意不用 INSERT OR REPLACE：REPLACE 是删行重插，会把 是否启用 打回默认值，
 * 导致「已下架的条目被编辑一次就偷偷重新上架」。
 */
function 保存条目(数据) {
  const { id, term_id, title, description, category, content } = 数据;
  const 启用值 = 数据.enabled === undefined ? null : 数据.enabled ? 1 : 0;

  if (!id || !term_id || !title) throw new Error("MISSING_FIELDS");

  const 已有 = 查条目(id);

  if (已有) {
    prepare(
      `UPDATE 概念抗体
       SET 词条ID = ?, 抗体标题 = ?, 抗体描述 = ?, 抗体类别 = ?, 抗体内容 = ?
         ${启用值 === null ? "" : ", 是否启用 = ?"}
       WHERE 抗体ID = ?`,
    ).run(
      term_id,
      title,
      description || "",
      category || "",
      content || "",
      ...(启用值 === null ? [] : [启用值]),
      id,
    );
    return { id, created: false };
  }

  prepare(
    `INSERT INTO 概念抗体 (抗体ID, 词条ID, 抗体标题, 抗体描述, 抗体类别, 抗体内容${
      启用值 === null ? "" : ", 是否启用"
    }) VALUES (?, ?, ?, ?, ?, ?${启用值 === null ? "" : ", ?"})`,
  ).run(
    id,
    term_id,
    title,
    description || "",
    category || "",
    content || "",
    ...(启用值 === null ? [] : [启用值]),
  );
  return { id, created: true };
}

function 删除条目(id) {
  const 结果 = prepare(`DELETE FROM 概念抗体 WHERE 抗体ID = ?`).run(id);
  if (结果.changes === 0) throw new Error("NOT_FOUND");
  return { id };
}

module.exports = {
  列管理条目,
  列公开条目,
  查条目,
  保存条目,
  删除条目,
};
