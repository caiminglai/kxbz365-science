// Meilisearch 搜索引擎客户端
// 负责：索引管理、搜索、增量同步
// 如果 Meilisearch 不可用，自动降级到 SQLite LIKE 搜索

const { Meilisearch } = require("meilisearch");

const MEILI_HOST = process.env.MEILI_HOST || "http://localhost:7700";
const MEILI_KEY = process.env.MEILI_KEY;
if (!MEILI_KEY) {
  console.warn('[Meilisearch] MEILI_KEY not set in environment, search will be disabled');
}
const INDEX_NAME = "terms";

let client = null;
let indexReady = false;

function getClient() {
  if (!MEILI_KEY) return null;
  if (!client) {
    client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_KEY });
  }
  return client;
}

// 检查 Meilisearch 是否可用
async function isAvailable() {
  try {
    const c = getClient();
    if (!c) return false;
    const health = await c.health();
    return health.status === "available";
  } catch {
    return false;
  }
}

// 初始化索引配置（可搜索字段、筛选字段等）
async function setupIndex() {
  const c = getClient();
  const index = c.index(INDEX_NAME);

  // 设置可搜索属性及权重（名称最重要，翻译次之）
  await index.updateSearchableAttributes([
    "名称",
    "翻译",
    "本质",
    "提示",
    "跨学科别名",
  ]);

  // 设置可筛选/排序属性
  await index.updateFilterableAttributes(["学科", "热度"]);
  await index.updateSortableAttributes(["热度", "名称"]);

  // 设置高亮和裁剪
  await index.updateTypoTolerance({
    enabled: true,
    minWordSizeForTypos: { oneTypo: 3, twoTypos: 7 },
    disableOnAttributes: ["学科"],
  });

  indexReady = true;
  console.log("[Meilisearch] 索引配置完成");
}

// 全量同步：把 SQLite 所有词条灌入 Meilisearch（零停机，使用临时索引+原子交换）
async function fullSync(terms) {
  const c = getClient();
  if (!c) throw new Error('Meilisearch client not available');

  const tmpIndexName = INDEX_NAME + '_tmp';
  const tmpIndex = c.index(tmpIndexName);

  // 准备文档
  const documents = terms.map((t) => ({
    词条ID: t.id,
    学科: t.discipline,
    名称: t.name,
    翻译: t.translation || "",
    本质: t.essence || "",
    提示: t.tip || "",
    跨学科别名: Array.isArray(t.aliases) ? t.aliases.join(" ") : (t.aliases || ""),
    热度: t.hot || 0,
  }));

  // 写入临时索引
  const task = await tmpIndex.addDocuments(documents, { primaryKey: "词条ID" });
  console.log(`[Meilisearch] 全量同步 ${documents.length} 条到临时索引，任务ID: ${task.taskUid}`);

  // 等待索引完成
  try {
    if (typeof c.waitForTask === "function") {
      await c.waitForTask(task.taskUid);
    } else {
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 原子交换：临时索引 <-> 主索引
  try {
    await c.swapIndexes([{ indexes: [INDEX_NAME, tmpIndexName] }]);
  } catch (e) {
    // 交换失败（例如主索引尚不存在），回退到直接写入主索引
    try { await c.deleteIndex(INDEX_NAME); } catch (delErr) { console.warn("[Meilisearch] 回退时清空主索引失败:", delErr.message); }
    const mainIndex = c.index(INDEX_NAME);
    await mainIndex.addDocuments(documents, { primaryKey: "词条ID" });
  }

  // 清理临时索引（现在包含旧数据）
  try { await c.deleteIndex(tmpIndexName); } catch (delErr) { console.warn("[Meilisearch] 清理临时索引失败:", delErr.message); }

  console.log("[Meilisearch] 全量同步完成");

  // 配置索引
  await setupIndex();

  return { synced: documents.length };
}

// 搜索
async function search(query, limit = 20) {
  const c = getClient();
  const index = c.index(INDEX_NAME);

  const result = await index.search(query, {
    limit,
    attributesToHighlight: ["名称", "翻译", "本质", "提示"],
    highlightPreTag: "<em>",
    highlightPostTag: "</em>",
    attributesToCrop: ["本质", "提示"],
    cropLength: 50,
    cropMarker: "...",
    showRankingScore: true,
  });

  return {
    hits: result.hits,
    total: result.estimatedTotalHits || result.hits.length,
    query: result.query,
    processingTimeMs: result.processingTimeMs,
  };
}

// 增量操作：添加/更新/删除单条
async function addDocument(term) {
  const c = getClient();
  const index = c.index(INDEX_NAME);
  const doc = {
    词条ID: term.id,
    学科: term.discipline,
    名称: term.name,
    翻译: term.translation || "",
    本质: term.essence || "",
    提示: term.tip || "",
    跨学科别名: Array.isArray(term.aliases) ? term.aliases.join(" ") : (term.aliases || ""),
    热度: term.hot || 0,
  };
  await index.addDocuments([doc], { primaryKey: "词条ID" });
}

async function updateDocument(term) {
  const c = getClient();
  const index = c.index(INDEX_NAME);
  const doc = {
    词条ID: term.id,
    学科: term.discipline,
    名称: term.name,
    翻译: term.translation || "",
    本质: term.essence || "",
    提示: term.tip || "",
    跨学科别名: Array.isArray(term.aliases) ? term.aliases.join(" ") : (term.aliases || ""),
    热度: term.hot || 0,
  };
  await index.updateDocuments([doc], { primaryKey: "词条ID" });
}

async function deleteDocument(termId) {
  const c = getClient();
  const index = c.index(INDEX_NAME);
  await index.deleteDocument(termId);
}

module.exports = {
  isAvailable,
  setupIndex,
  fullSync,
  search,
  addDocument,
  updateDocument,
  deleteDocument,
  INDEX_NAME,
};
