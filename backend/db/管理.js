const { prepare, exec } = require("./入口");

// 全中文路线：所有查询直接使用词条.学科（中文名称），不再 JOIN 学科表做翻译

function parseAliases(row) {
  if (!row) return [];
  const aliasesStr = row.aliases;
  if (!aliasesStr) return [];
  try {
    const parsed = JSON.parse(aliasesStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function withAliases(row) {
  if (!row) return row;
  
  row.aliases = parseAliases(row);

  return row;
}

function getAdminTerms(page, pageSize, search, discipline) {
  let where = "WHERE 1=1";
  const params = [];

  if (search) {
    where += " AND (名称 LIKE ? OR 词条ID LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s);
  }
  if (discipline) {
    where += " AND 学科 = ?";
    params.push(discipline);
  }

  const { count } = prepare(`SELECT COUNT(*) as count FROM 词条 ${where}`).get(
    ...params,
  );
  const terms = prepare(
    `SELECT 词条ID as id, 学科 as discipline, 名称 as name, 翻译 as translation, 本质 as essence, 提示 as tip, 跨学科别名 as aliases, 热度 as hot, 创建时间 as created_at FROM 词条 ${where} ORDER BY 词条ID LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, (page - 1) * pageSize);

  return { terms: terms.map(withAliases), total: count };
}

function batchCreateTerms(items) {
  let success = 0;
  let failed = 0;
  const errors = [];

  exec("BEGIN TRANSACTION");
  try {
    const insert = prepare(
      `INSERT INTO 词条 (词条ID, 学科, 名称, 翻译, 本质, 提示, 跨学科别名, 热度) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of items) {
      try {
        insert.run(
          item.id,
          item.discipline,
          item.name,
          item.translation || "",
          item.essence || "",
          item.tip || "",
          JSON.stringify(item.aliases || []),
          item.hot ? 1 : 0,
        );
        success++;
      } catch (err) {
        failed++;
        errors.push({ id: item.id, error: err && err.message ? err.message : String(err) });
        exec("ROLLBACK");
        return { success, failed, errors };
      }
    }
    exec("COMMIT");
  } catch (err) {
    try { exec("ROLLBACK"); } catch (rbErr) { console.warn("[词条] 批量写入失败后回滚也失败:", rbErr.message); }
    throw err;
  }

  return { success, failed, errors };
}

function updateAdminTerm(id, updates) {
  const fields = [];
  const values = [];
  const mapping = { name: "名称", translation: "翻译", essence: "本质", tip: "提示" };

  if (updates.name !== undefined) {
    fields.push("名称 = ?");
    values.push(updates.name);
  }
  if (updates.translation !== undefined) {
    fields.push("翻译 = ?");
    values.push(updates.translation);
  }
  if (updates.essence !== undefined) {
    fields.push("本质 = ?");
    values.push(updates.essence);
  }
  if (updates.tip !== undefined) {
    fields.push("提示 = ?");
    values.push(updates.tip);
  }
  if (updates.aliases !== undefined) {
    fields.push("跨学科别名 = ?");
    values.push(
      Array.isArray(updates.aliases) ? JSON.stringify(updates.aliases) : "[]",
    );
  }
  if (updates.hot !== undefined) {
    fields.push("热度 = ?");
    values.push(updates.hot ? 1 : 0);
  }

  values.push(id);
  return prepare(`UPDATE 词条 SET ${fields.join(", ")} WHERE 词条ID = ?`).run(
    ...values,
  );
}

function deleteAdminTerm(id) {
  return prepare("DELETE FROM 词条 WHERE 词条ID = ?").run(id);
}

function getDisciplines() {
  return prepare(`
    SELECT d.学科名称 as id, d.学科名称 as name, d.学科颜色 as color, d.学科描述 as description, d.显示顺序 as display_order, COUNT(t.词条ID) AS term_count
    FROM 学科 d
    LEFT JOIN 词条 t ON t.学科 = d.学科名称
    GROUP BY d.学科名称
    ORDER BY d.显示顺序, d.学科名称
  `).all();
}

function createDiscipline(name, color, description) {
  const maxOrder = prepare(
    "SELECT COALESCE(MAX(显示顺序), 0) as max FROM 学科",
  ).get().max;
  return prepare(
    "INSERT INTO 学科 (学科名称, 学科颜色, 学科描述, 显示顺序) VALUES (?, ?, ?, ?)",
  ).run(name, color || "#6B7B5E", description || "", maxOrder + 1);
}

function updateDisciplineOrder(order) {
  if (!Array.isArray(order) || order.length === 0) return;
  
  exec("BEGIN TRANSACTION");
  try {
    order.forEach((name, index) => {
      prepare("UPDATE 学科 SET 显示顺序 = ? WHERE 学科名称 = ?").run(
        index + 1,
        name,
      );
    });
    exec("COMMIT");
  } catch (err) {
    exec("ROLLBACK");
    throw new Error("UPDATE_ORDER_FAILED: " + err.message);
  }
}

function updateDiscipline(name, updates) {
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push("学科名称 = ?");
    values.push(updates.name);
  }
  if (updates.color !== undefined) {
    fields.push("学科颜色 = ?");
    values.push(updates.color);
  }

  values.push(name);
  return prepare(
    `UPDATE 学科 SET ${fields.join(", ")} WHERE 学科名称 = ?`,
  ).run(...values);
}

function deleteDiscipline(name) {
  return prepare("DELETE FROM 学科 WHERE 学科名称 = ?").run(name);
}

function countTermsByDiscipline(discipline) {
  return prepare("SELECT COUNT(*) as c FROM 词条 WHERE 学科 = ?").get(
    discipline,
  ).c;
}

function getAllTerms(discipline) {
  let sql = "SELECT 词条ID as id, 学科 as discipline, 名称 as name, 翻译 as translation, 本质 as essence, 提示 as tip, 热度 as hot FROM 词条";
  const params = [];
  if (discipline) {
    sql += " WHERE 学科 = ?";
    params.push(discipline);
  }
  sql += " ORDER BY 词条ID";
  return prepare(sql).all(...params);
}

function getTermsForExport(options = {}) {
  const { discipline, search, hotOnly, ids } = options || {};
  let sql = "SELECT 词条ID as id, 学科 as discipline, 名称 as name, 翻译 as translation, 本质 as essence, 提示 as tip, 热度 as hot FROM 词条";
  const where = [];
  const params = [];

  if (discipline) {
    where.push("学科 = ?");
    params.push(discipline);
  }
  if (hotOnly) {
    where.push("热度 = 1");
  }
  if (search) {
    where.push("(名称 LIKE ? OR 词条ID LIKE ? OR 翻译 LIKE ?)");
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (Array.isArray(ids) && ids.length > 0) {
    where.push(`词条ID IN (${ids.map(() => "?").join(", ")})`);
    params.push(...ids);
  }

  if (where.length > 0) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY 学科, 词条ID";
  return prepare(sql).all(...params);
}

function getDashboardStats() {
  const totalTerms = prepare("SELECT COUNT(*) as c FROM 词条").get().c;
  const hotTerms = prepare(
    "SELECT COUNT(*) as c FROM 词条 WHERE 热度 = 1",
  ).get().c;
  const totalLinks = prepare("SELECT COUNT(*) as c FROM 图谱关系").get().c;
  const totalCmp = prepare("SELECT COUNT(*) as c FROM 概念对比").get().c;
  const totalSc = prepare("SELECT COUNT(*) as c FROM 情景还原").get().c;
  const byDiscipline = prepare(`
    SELECT 学科 AS discipline, COUNT(词条ID) AS count
    FROM 词条
    GROUP BY 学科
    ORDER BY 学科
  `).all();

  return {
    totalTerms,
    hotTerms,
    totalLinks,
    totalCmp,
    totalSc,
    byDiscipline: byDiscipline.reduce((a, r) => {
      a[r.discipline] = r.count;
      return a;
    }, {}),
  };
}

function getTermById(id) {
  return prepare(
    "SELECT 词条ID as id, 学科 as discipline, 名称 as name, 翻译 as translation, 本质 as essence, 提示 as tip, 热度 as hot FROM 词条 WHERE 词条ID = ?",
  ).get(id);
}

function saveTermHistory(termId, changes, timestamp) {
  if (!changes || typeof changes !== "object") return 0;
  const entries = Object.entries(changes);
  if (entries.length === 0) return 0;

  const insert = prepare(
    "INSERT INTO 词条历史 (词条ID, 字段名称, 旧值, 新值, 创建时间) VALUES (?, ?, ?, ?, ?)",
  );
  let inserted = 0;
  for (const [fieldName, values] of entries) {
    if (!values) continue;
    insert.run(
      termId,
      fieldName,
      values.old_value,
      values.new_value,
      timestamp,
    );
    inserted++;
  }
  return inserted;
}

function getTermHistory(termId, limit = 30) {
  return prepare(
    "SELECT 历史ID as id, 词条ID as term_id, 字段名称 as field_name, 旧值 as old_value, 新值 as new_value, 创建时间 as created_at FROM 词条历史 WHERE 词条ID = ? ORDER BY 创建时间 DESC LIMIT ?",
  ).all(termId, limit);
}

function trimTermHistory(termId, keep = 30) {
  const keepNum = Math.max(1, parseInt(keep, 10) || 30);
  const all = prepare(
    "SELECT 历史ID as id FROM 词条历史 WHERE 词条ID = ? ORDER BY 创建时间 DESC, 历史ID DESC",
  ).all(termId);
  if (!all || all.length <= keepNum) return 0;

  const toDelete = all.slice(keepNum);
  const del = prepare("DELETE FROM 词条历史 WHERE 历史ID = ?");
  for (const row of toDelete) {
    del.run(row.id);
  }
  return toDelete.length;
}

module.exports = {
  getAdminTerms,
  batchCreateTerms,
  updateAdminTerm,
  deleteAdminTerm,
  getAllTerms,
  getTermsForExport,
  getDisciplines,
  createDiscipline,
  updateDisciplineOrder,
  updateDiscipline,
  deleteDiscipline,
  countTermsByDiscipline,
  getDashboardStats,
  getTermById,
  saveTermHistory,
  getTermHistory,
  trimTermHistory,
};