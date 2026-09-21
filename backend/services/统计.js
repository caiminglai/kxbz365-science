const path = require("path");
const Database = require("better-sqlite3");
const { prepare } = require("../db/入口");
const { markDirty } = require("../db/入口");
const cache = require("./缓存");

// 19个学科分表名称
const SUBJECT_TABLES = [
  '世界哲学', '化学化工', '医药医学', '土木工程', '教育教学',
  '数学科学', '机械工程', '水利工程', '法律诉讼', '物理科学',
  '电子工程', '矿业勘探', '社会科学', '管理科学', '船舶工程',
  '计算机业', '通信工程', '金融财经', '钢铁冶金'
];

// 学科分表的正式数据在独立库 data/学科词库.db（导入时按 权重≥2 过滤，比主库内的历史副本少 357 条权重=1 的词）。
// 计数读独立库才与 /api/v1/domains/* 同口径；该库缺失时回退主库副本，不让统计接口挂掉。
let lexDb = null;
try {
  lexDb = new Database(path.join(__dirname, "..", "..", "data", "学科词库.db"), { readonly: true });
} catch (_错误) {
  console.warn("[统计] 学科词库.db 未找到，学科词数回退主库口径");
}

function getStats() {
  return cache.remember("stats_summary", () => {
    // 主词条表数量
    const mainTerms = prepare("SELECT COUNT(*) as c FROM 词条").get().c;
    
    // 汇总19张学科分表数量
    let subjectTerms = 0;
    SUBJECT_TABLES.forEach(tableName => {
      try {
        const sql = `SELECT COUNT(*) as c FROM "${tableName}"`;
        subjectTerms += (lexDb ? lexDb.prepare(sql) : prepare(sql)).get().c;
      } catch (e) {
        // 表不存在时跳过
      }
    });
    
    // 总词条数 = 主表 + 学科分表
    const totalTerms = mainTerms + subjectTerms;
    
    const hotTerms = prepare(
      "SELECT COUNT(*) as c FROM 词条 WHERE 热度 = 1",
    ).get().c;
    const totalLinks = prepare("SELECT COUNT(*) as c FROM 图谱关系").get().c;
    const totalComparisons = prepare(
      "SELECT COUNT(*) as c FROM 概念对比",
    ).get().c;
    const totalScenarios = prepare("SELECT COUNT(*) as c FROM 情景还原").get()
      .c;
    const byDiscipline = prepare(
      "SELECT 学科 as discipline, COUNT(*) as count FROM 词条 GROUP BY 学科",
    ).all();

    return {
      totalTerms,
      mainTerms,
      subjectTerms,
      hotTerms,
      totalLinks,
      totalComparisons,
      totalScenarios,
      byDiscipline: byDiscipline.reduce((acc, r) => {
        acc[r.discipline] = r.count;
        return acc;
      }, {}),
    };
  });
}

function submitFeedback(data) {
  const { type, content, termId, contact } = data;

  if (!type || !content) {
    throw new Error("MISSING_FIELDS");
  }

  prepare(
    "INSERT INTO 用户反馈 (反馈类型, 反馈内容, 关联词条ID, 联系方式) VALUES (?, ?, ?, ?)",
  ).run(type, content, termId || null, contact || null);
  markDirty();
  return { message: "反馈提交成功，感谢！" };
}

function getHealth() {
  return {
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    cache: cache.getStats(),
  };
}

module.exports = {
  getStats,
  submitFeedback,
  getHealth,
};