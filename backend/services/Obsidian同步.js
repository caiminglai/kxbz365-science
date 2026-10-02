/**
 * ============================================================
 *  Obsidian 双向同步服务
 * ============================================================
 *
 *  功能：
 *    DB→Obsidian：将数据库记录写入 Obsidian Markdown 文件
 *    支持词条、概念对比、概念抗体、岗位拆解四个模块
 *    支持单条同步（管理后台钩子）和全量同步（CLI 脚本）
 *
 *  配置：
 *    环境变量 OBSIDIAN_VAULT_PATH 指定 Obsidian 仓库路径
 *    默认值：项目根目录下的 obsidian/
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const { prepare } = require("../db/入口");

// ==================== 配置 ====================

const VAULT_PATH =
  process.env.OBSIDIAN_VAULT_PATH ||
  path.join(__dirname, '..', '..', 'obsidian');

// ==================== 工具函数 ====================

/** 确保目录存在 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** 安全文件名（替换 Windows 不允许的字符） */
function safeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").trim();
}

/** 解析 JSON 别名数组 */
function parseAliases(jsonStr) {
  try {
    const arr = JSON.parse(jsonStr);
    if (Array.isArray(arr)) return arr;
  } catch {
    // ignore
  }
  return [];
}

/** 获取某条记录在 Obsidian 中的文件路径 */
function getFilePath(subfolder, filename) {
  // subfolder 里带着学科/分类名，这些是后台能改的库字段，可能含 ".."；
  // 逐段清洗后再断言仍在 vault 内，否则一条改名记录就能把词条写到库外
  const segments = String(subfolder)
    .split(/[\\/]/)
    .map((seg) => (seg === ".." ? "_" : safeFilename(seg)))
    .filter((seg) => seg && seg !== ".");
  const filePath = path.join(VAULT_PATH, ...segments, safeFilename(filename) + ".md");
  const vaultRoot = path.resolve(VAULT_PATH);
  const resolved = path.resolve(filePath);
  if (resolved !== vaultRoot && !resolved.startsWith(vaultRoot + path.sep)) {
    throw new Error(`Obsidian 路径越界，已拒绝写入: ${filePath}`);
  }
  return resolved;
}

/** 删除文件（如果存在） */
function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/** 写入文件（自动创建目录） */
function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

/** 获取当前时间字符串（YYYY-MM-DD HH:MM:SS） */
function now() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ==================== 图谱关系查询 ====================

/**
 * 获取某词条的相关词条名称列表（通过图谱关系）
 * @param {string} termId - 词条ID
 * @returns {string[]} 相关词条名称
 */
function getRelatedTermNames(termId) {
  const rows = prepare(
    `SELECT t.名称 as name FROM 图谱关系 g
     JOIN 词条 t ON (
       (g.源节点ID = ? AND g.目标节点ID = t.词条ID) OR
       (g.目标节点ID = ? AND g.源节点ID = t.词条ID)
     )`
  ).all(termId, termId);
  return rows.map((r) => r.name);
}

// ==================== 词条同步 ====================

/**
 * 将单条词条写入 Obsidian
 * @param {object} term - 词条数据（数据库原始列名）
 */
function writeTermToObsidian(term) {
  const 学科 = term.学科 || "未分类";
  const 名称 = term.名称 || "未命名";
  const 别名列表 = parseAliases(term.跨学科别名);
  const 别名链接 =
    别名列表.length > 0
      ? 别名列表.map((a) => `- [[${typeof a === "string" ? a : a.name || ""}]]`).join("\n")
      : "- ";

  // 获取图谱关系中的相关词条
  const 相关词条名称 = getRelatedTermNames(term.词条ID);
  const 相关词条链接 =
    相关词条名称.length > 0
      ? 相关词条名称.map((n) => `- [[${n}]]`).join("\n")
      : "- ";

  const 文件内容 = `---
类型: 词条
词条ID: ${term.词条ID || ""}
学科: ${学科}
热度: ${term.热度 || 0}
创建时间: ${term.创建时间 || now()}
别名: ${JSON.stringify(别名列表)}
---

# ${名称}

**专业说法：** ${term.专业说法 || ""}

**人话翻译：** 
${term.翻译 || ""}

**本质：** ${term.本质 || ""}

**提示：** ${term.提示 || ""}

**跨学科别名：**
${别名链接}

**相关术语：**
- 


**相关词条：**
${相关词条链接}
`;

  const filePath = getFilePath(path.join("词条", 学科), 名称);
  writeFile(filePath, 文件内容);
  return filePath;
}

/**
 * 删除词条的 Obsidian 文件
 * 注意：需要先查询数据库获取文件路径，所以应在删除DB记录前调用
 * @param {object} termInfo - {名称, 学科}
 * @returns {boolean} 是否删除了文件
 */
function deleteTermFromObsidian(termInfo) {
  if (!termInfo || !termInfo.名称) return false;
  const filePath = getFilePath(path.join("词条", termInfo.学科 || "未分类"), termInfo.名称);
  return removeFileIfExists(filePath);
}

/**
 * 同步所有词条
 * @returns {{written: number, errors: number}}
 */
function syncAllTerms() {
  const terms = prepare("SELECT * FROM 词条").all();
  let written = 0;
  let errors = 0;
  for (const term of terms) {
    try {
      writeTermToObsidian(term);
      written++;
    } catch (e) {
      console.error(`  ❌ 词条同步失败 [${term.词条ID}] ${term.名称}: ${e.message}`);
      errors++;
    }
  }
  return { written, errors };
}

// ==================== 概念对比同步 ====================

/**
 * 将单条概念对比写入 Obsidian
 * @param {object} cmp - 概念对比数据（数据库原始列名）
 */
function writeComparisonToObsidian(cmp) {
  const 标题 = cmp.标题 || `${cmp.A概念名称 || "A"} vs ${cmp.B概念名称 || "B"}`;

  const 文件内容 = `---
类型: 概念对比
对比ID: ${cmp.对比ID || ""}
关系类型: ${cmp.关系类型 || "关联性"}
创建时间: ${cmp.创建时间 || now()}
---

# ${标题}

## 概念A：${cmp.A概念名称 || ""}

**所属学科：** ${cmp.A概念学科 || ""}

**人话翻译：** ${cmp.A概念平述 || ""}

**表现症状：** ${cmp.A概念症状 || ""}

**生活类比：** ${cmp.A概念类比 || ""}

**解决办法：** ${cmp.A概念修正 || ""}

## 概念B：${cmp.B概念名称 || ""}

**所属学科：** ${cmp.B概念学科 || ""}

**人话翻译：** ${cmp.B概念平述 || ""}

**表现症状：** ${cmp.B概念症状 || ""}

**生活类比：** ${cmp.B概念类比 || ""}

**解决办法：** ${cmp.B概念修正 || ""}

## 总结

**一句话区分：** ${cmp.总结 || ""}
`;

  const filePath = getFilePath("概念对比", 标题);
  writeFile(filePath, 文件内容);
  return filePath;
}

/**
 * 删除概念对比的 Obsidian 文件
 * @param {object} cmpInfo - {标题}
 * @returns {boolean}
 */
function deleteComparisonFromObsidian(cmpInfo) {
  if (!cmpInfo || !cmpInfo.标题) return false;
  const filePath = getFilePath("概念对比", cmpInfo.标题);
  return removeFileIfExists(filePath);
}

/**
 * 同步所有概念对比
 * @returns {{written: number, errors: number}}
 */
function syncAllComparisons() {
  const comparisons = prepare("SELECT * FROM 概念对比").all();
  let written = 0;
  let errors = 0;
  for (const cmp of comparisons) {
    try {
      writeComparisonToObsidian(cmp);
      written++;
    } catch (e) {
      console.error(`  ❌ 概念对比同步失败 [${cmp.对比ID}] ${cmp.标题}: ${e.message}`);
      errors++;
    }
  }
  return { written, errors };
}

// ==================== 概念抗体同步 ====================

/**
 * 将单条概念抗体写入 Obsidian
 * @param {object} ab - 概念抗体数据（含 学科 字段，通过 JOIN 获得）
 */
function writeAntibodyToObsidian(ab) {
  const 学科 = ab.学科 || "未分类";

  const 文件内容 = `---
类型: 概念抗体
抗体ID: ${ab.抗体ID || ""}
学科: ${学科}
关联词条: ${ab.词条名称 || ""}
创建时间: ${ab.创建时间 || now()}
---

# ${ab.抗体标题 || ""}

**常见误解（人话版）：**
${ab.抗体标题 || ""}

**正确理解（人话版）：**
${ab.抗体描述 || ""}

**为什么容易搞混：**
${ab.抗体类别 || ""}

**一句话记住：**
${ab.抗体内容 || ""}

**真实案例：**
- 

**相关抗体：**
- 
`;

  const filePath = getFilePath(path.join("概念抗体", 学科), ab.抗体标题 || "未命名");
  writeFile(filePath, 文件内容);
  return filePath;
}

/**
 * 删除概念抗体的 Obsidian 文件
 * @param {object} abInfo - {抗体标题, 学科}
 * @returns {boolean}
 */
function deleteAntibodyFromObsidian(abInfo) {
  if (!abInfo || !abInfo.抗体标题) return false;
  const filePath = getFilePath(
    path.join("概念抗体", abInfo.学科 || "未分类"),
    abInfo.抗体标题
  );
  return removeFileIfExists(filePath);
}

/**
 * 同步所有概念抗体
 * @returns {{written: number, errors: number}}
 */
function syncAllAntibodies() {
  const antibodies = prepare(
    `SELECT a.*, t.学科, t.名称 as 词条名称
     FROM 概念抗体 a
     LEFT JOIN 词条 t ON a.词条ID = t.词条ID`
  ).all();
  let written = 0;
  let errors = 0;
  for (const ab of antibodies) {
    try {
      writeAntibodyToObsidian(ab);
      written++;
    } catch (e) {
      console.error(`  ❌ 概念抗体同步失败 [${ab.抗体ID}] ${ab.抗体标题}: ${e.message}`);
      errors++;
    }
  }
  return { written, errors };
}

// ==================== 岗位拆解同步 ====================

/**
 * 获取岗位的完整数据（含子表）
 * @param {number} jobId - 岗位ID
 * @returns {object}
 */
function getJobFullData(jobId) {
  const job = prepare(
    `SELECT j.*, c.分类名称
     FROM 岗位 j
     LEFT JOIN 岗位分类 c ON j.分类ID = c.分类ID
     WHERE j.岗位ID = ?`
  ).get(jobId);
  if (!job) return null;

  const stages = prepare(
    `SELECT * FROM 岗位学习阶段 WHERE 岗位ID = ? ORDER BY 显示顺序`
  ).all(jobId);

  for (const stage of stages) {
    stage.skills = prepare(
      `SELECT * FROM 岗位技能 WHERE 阶段ID = ? ORDER BY 显示顺序`
    ).all(stage.阶段ID);
  }

  const resources = prepare(
    `SELECT * FROM 岗位学习资源 WHERE 岗位ID = ? ORDER BY 显示顺序`
  ).all(jobId);

  const project = prepare(
    `SELECT * FROM 岗位项目 WHERE 岗位ID = ?`
  ).get(jobId);

  const knowledgeCards = prepare(
    `SELECT * FROM 岗位知识卡片 WHERE 岗位ID = ? ORDER BY 显示顺序`
  ).all(jobId);

  return { ...job, stages, resources, project, knowledgeCards };
}

/**
 * 将单个岗位写入 Obsidian
 * @param {object} job - 岗位完整数据（含子表）
 */
function writeJobToObsidian(job) {
  const 分类 = job.分类名称 || "未分类";
  const 岗位名称 = job.岗位标题 || "未命名";

  // 构建学习阶段表格
  let 学习阶段表格 = "";
  if (job.stages && job.stages.length > 0) {
    const 表格行 = job.stages.map((s, i) => {
      const 技能列表 = (s.skills || []).map((sk) => sk.技能名称).join("、");
      return `| ${s.阶段标题 || `第${i + 1}阶段`} | ${技能列表 || s.阶段副标题 || ""} | |`;
    });
    学习阶段表格 = `| 阶段 | 学什么 | 产出 |\n|------|--------|------|\n${表格行.join("\n")}`;
  } else {
    学习阶段表格 = `| 阶段 | 学什么 | 产出 |\n|------|--------|------|\n| 第一阶段 | | |\n| 第二阶段 | | |\n| 第三阶段 | | |`;
  }

  // 构建必备技能列表
  const 所有技能 = [];
  if (job.stages) {
    for (const stage of job.stages) {
      if (stage.skills) {
        所有技能.push(...stage.skills.map((s) => s.技能名称));
      }
    }
  }
  const 技能链接 =
    所有技能.length > 0 ? 所有技能.map((s) => `- ${s}`).join("\n") : "- ";

  // 构建知识卡片（行业黑话翻译）
  let 行业黑话 = "";
  if (job.knowledgeCards && job.knowledgeCards.length > 0) {
    行业黑话 = job.knowledgeCards
      .map((k) => `- **${k.术语}**：${k.解释说明}`)
      .join("\n");
  }

  // 构建项目步骤
  let 项目步骤 = "";
  if (job.project) {
    try {
      const steps = JSON.parse(job.project.项目步骤 || "[]");
      if (Array.isArray(steps) && steps.length > 0) {
        项目步骤 = steps.map((s, i) => `${i + 1}. ${typeof s === "string" ? s : s.step || s}`).join("\n");
      }
    } catch {
      项目步骤 = job.project.项目步骤 || "";
    }
  }

  const 文件内容 = `---
类型: 岗位拆解
岗位ID: ${job.岗位ID || ""}
分类ID: ${job.分类ID || ""}
创建时间: ${job.创建时间 || now()}
---

# ${岗位名称}

**行业黑话翻译：**
${行业黑话 || job.岗位介绍 || ""}

**实际工作内容（人话版）：**
${job.岗位介绍 || ""}

**薪资真相：**
${job.薪资范围 || ""}

**入门门槛：**
学历：${job.学历要求 || "不限"}
经验：${job.工作经验 || "不限"}

**学习阶段：**
${学习阶段表格}

**必备技能：**
${技能链接}

**避坑指南：**
- 

**相关岗位：**
- 
`;

  const filePath = getFilePath(path.join("岗位拆解", 分类), 岗位名称);
  writeFile(filePath, 文件内容);
  return filePath;
}

/**
 * 删除岗位的 Obsidian 文件
 * @param {object} jobInfo - {岗位标题, 分类名称}
 * @returns {boolean}
 */
function deleteJobFromObsidian(jobInfo) {
  if (!jobInfo || !jobInfo.岗位标题) return false;
  const filePath = getFilePath(
    path.join("岗位拆解", jobInfo.分类名称 || "未分类"),
    jobInfo.岗位标题
  );
  return removeFileIfExists(filePath);
}

/**
 * 同步所有岗位
 * @returns {{written: number, errors: number}}
 */
function syncAllJobs() {
  const jobs = prepare(
    `SELECT j.岗位ID FROM 岗位 j ORDER BY j.显示顺序`
  ).all();
  let written = 0;
  let errors = 0;
  for (const j of jobs) {
    try {
      const fullData = getJobFullData(j.岗位ID);
      if (fullData) {
        writeJobToObsidian(fullData);
        written++;
      }
    } catch (e) {
      console.error(`  ❌ 岗位同步失败 [${j.岗位ID}]: ${e.message}`);
      errors++;
    }
  }
  return { written, errors };
}

// ==================== 清理孤立文件 ====================

/**
 * 清理 Obsidian 中存在但数据库中已不存在的文件
 * @param {string} subfolder - 子目录名（如 "词条", "概念对比" 等）
 * @param {Set<string>} validNames - 数据库中存在的文件名集合
 * @returns {{removed: number}}
 */
function cleanOrphanedFiles(subfolder, validNames) {
  const dir = path.join(VAULT_PATH, subfolder);
  let removed = 0;

  function scanDir(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith(".md")) {
        const baseName = entry.name.replace(/\.md$/, "");
        if (!validNames.has(baseName)) {
          const relPath = path.relative(dir, fullPath).replace(/\.md$/, "").replace(/\\/g, "/");
          if (!validNames.has(relPath)) {
            fs.unlinkSync(fullPath);
            removed++;
          }
        }
      }
    }
  }

  scanDir(dir);
  return { removed };
}

/**
 * 清理所有模块的孤立文件
 * @returns {object}
 */
function cleanAllOrphans() {
  // 词条：按学科子目录
  const terms = prepare("SELECT 名称, 学科 FROM 词条").all();
  const termNames = new Set();
  for (const t of terms) {
    termNames.add(`${t.学科}/${t.名称}`);
    termNames.add(t.名称);
  }
  const termResult = cleanOrphanedFiles("词条", termNames);

  // 概念对比
  const comparisons = prepare("SELECT 标题 FROM 概念对比").all();
  const cmpNames = new Set(comparisons.map((c) => c.标题));
  const cmpResult = cleanOrphanedFiles("概念对比", cmpNames);

  // 概念抗体
  const antibodies = prepare(
    `SELECT a.抗体标题, t.学科
     FROM 概念抗体 a LEFT JOIN 词条 t ON a.词条ID = t.词条ID`
  ).all();
  const abNames = new Set();
  for (const a of antibodies) {
    abNames.add(`${a.学科 || "未分类"}/${a.抗体标题}`);
    abNames.add(a.抗体标题);
  }
  const abResult = cleanOrphanedFiles("概念抗体", abNames);

  // 岗位拆解
  const jobs = prepare(
    `SELECT j.岗位标题, c.分类名称
     FROM 岗位 j LEFT JOIN 岗位分类 c ON j.分类ID = c.分类ID`
  ).all();
  const jobNames = new Set();
  for (const j of jobs) {
    jobNames.add(`${j.分类名称 || "未分类"}/${j.岗位标题}`);
    jobNames.add(j.岗位标题);
  }
  const jobResult = cleanOrphanedFiles("岗位拆解", jobNames);

  return {
    词条: termResult,
    概念对比: cmpResult,
    概念抗体: abResult,
    岗位拆解: jobResult,
  };
}

// ==================== 全量同步 ====================

/**
 * 执行全量同步：DB → Obsidian
 * @param {object} options
 * @param {boolean} options.cleanOrphans - 是否清理孤立文件（默认 true）
 * @param {string[]} options.modules - 要同步的模块列表（默认全部）
 * @returns {object} 同步结果统计
 */
function fullSync(options = {}) {
  const { cleanOrphans: shouldClean = true, modules } = options;
  const allModules = ["词条", "概念对比", "概念抗体", "岗位拆解"];
  const targetModules = modules || allModules;

  console.log("═══════════════════════════════════════════");
  console.log("  DB → Obsidian 全量同步");
  console.log(`  仓库: ${VAULT_PATH}`);
  console.log(`  模块: ${targetModules.join(", ")}`);
  console.log("═══════════════════════════════════════════\n");

  const results = {};

  if (targetModules.includes("词条")) {
    console.log("📤 同步词条...");
    results.词条 = syncAllTerms();
    console.log(`   ✅ 写入 ${results.词条.written} 条，失败 ${results.词条.errors} 条\n`);
  }

  if (targetModules.includes("概念对比")) {
    console.log("📤 同步概念对比...");
    results.概念对比 = syncAllComparisons();
    console.log(`   ✅ 写入 ${results.概念对比.written} 条，失败 ${results.概念对比.errors} 条\n`);
  }

  if (targetModules.includes("概念抗体")) {
    console.log("📤 同步概念抗体...");
    results.概念抗体 = syncAllAntibodies();
    console.log(`   ✅ 写入 ${results.概念抗体.written} 条，失败 ${results.概念抗体.errors} 条\n`);
  }

  if (targetModules.includes("岗位拆解")) {
    console.log("📤 同步岗位拆解...");
    results.岗位拆解 = syncAllJobs();
    console.log(`   ✅ 写入 ${results.岗位拆解.written} 条，失败 ${results.岗位拆解.errors} 条\n`);
  }

  if (shouldClean) {
    console.log("🧹 清理孤立文件...");
    results.清理 = cleanAllOrphans();
    for (const [mod, stat] of Object.entries(results.清理)) {
      if (stat.removed > 0) {
        console.log(`   🗑️ ${mod}: 删除 ${stat.removed} 个孤立文件`);
      }
    }
    console.log("");
  }

  console.log("═══════════════════════════════════════════");
  console.log("  ✅ 同步完成！");
  console.log("═══════════════════════════════════════════\n");

  return results;
}

// ==================== 模块导出 ====================

module.exports = {
  // 全量同步
  fullSync,

  // 词条
  writeTermToObsidian,
  deleteTermFromObsidian,
  syncAllTerms,

  // 概念对比
  writeComparisonToObsidian,
  deleteComparisonFromObsidian,
  syncAllComparisons,

  // 概念抗体
  writeAntibodyToObsidian,
  deleteAntibodyFromObsidian,
  syncAllAntibodies,

  // 岗位拆解
  writeJobToObsidian,
  deleteJobFromObsidian,
  syncAllJobs,
  getJobFullData,

  // 清理
  cleanAllOrphans,

  // 配置
  VAULT_PATH,
};
