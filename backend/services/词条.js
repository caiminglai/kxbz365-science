const termsDb = require("../db/词条");
const graphDb = require("../db/图谱");
const { prepare, markDirty } = require("../db/入口");
const cache = require("./缓存");
const meili = require("./Meilisearch服务");
const { CACHE_KEYS, buildPageKey, buildCacheKey } = require("../utils/缓存键");

function getTerms(page = 1, pageSize = 50, discipline) {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safePageSize = Math.min(1000, parseInt(pageSize) || 50);
  const key = buildPageKey(CACHE_KEYS.TERMS.LIST, safePage, safePageSize, discipline);
  return cache.remember(key, () =>
    termsDb.getTerms(safePage, safePageSize, discipline),
  );
}

async function searchTerms(query, limit = 20) {
  if (!query || query.trim().length === 0) {
    throw new Error("MISSING_QUERY");
  }
  const safeLimit = Math.min(50, parseInt(limit) || 20);
  const key = buildCacheKey(CACHE_KEYS.TERMS.SEARCH, query.toLowerCase().trim(), safeLimit);
  const cached = cache.get(key);
  if (cached) return cached;

  // 优先使用 Meilisearch（支持模糊搜索、高亮、相关性排序）
  try {
    const available = await meili.isAvailable();
    if (available) {
      const meiliResult = await meili.search(query, safeLimit);
      const result = {
        results: meiliResult.hits.map((hit) => {
          // 解析别名字段
          let aliases = [];
          try {
            aliases = hit.跨学科别名 ? JSON.parse(hit.跨学科别名) : [];
          } catch {
            aliases = hit.跨学科别名 ? hit.跨学科别名.split(" ").filter(Boolean) : [];
          }

          const term = {
            id: hit.词条ID,
            discipline: hit.学科,
            name: hit.名称,
            translation: hit.翻译,
            essence: hit.本质,
            tip: hit.提示,
            aliases,
            hot: hit.热度,
          };

          // 提取 Meilisearch 高亮信息
          const highlights = [];
          const formatted = hit._formatted;
          if (formatted) {
            if (formatted.名称 && formatted.名称 !== hit.名称) {
              highlights.push({ field: "name", text: formatted.名称 });
            }
            if (formatted.翻译 && formatted.翻译 !== hit.翻译) {
              highlights.push({ field: "translation", text: formatted.翻译 });
            }
            if (formatted.本质 && formatted.本质 !== hit.本质) {
              highlights.push({ field: "essence", text: formatted.本质 });
            }
            if (formatted.提示 && formatted.提示 !== hit.提示) {
              highlights.push({ field: "tip", text: formatted.提示 });
            }
          }

          return {
            term,
            score: hit._rankingScore || 1,
            highlights,
          };
        }),
        total: meiliResult.total,
        query,
      };
      cache.set(key, result);
      return result;
    }
  } catch (err) {
    console.warn("[Meilisearch] 搜索失败，降级到 SQLite:", err.message);
  }

  // 降级：SQLite LIKE 搜索
  const terms = termsDb.searchTerms(query, safeLimit);
  const result = {
    results: terms.map((t) => ({ term: t, score: 1, highlights: [] })),
    total: terms.length,
    query,
  };
  cache.set(key, result);
  return result;
}

function getRecentTerms(limit = 10) {
  const safeLimit = parseInt(limit) || 10;
  const key = buildCacheKey(CACHE_KEYS.TERMS.RECENT, safeLimit);
  return cache.remember(key, () => termsDb.getRecentTerms(safeLimit));
}

function getHotTerms() {
  return cache.remember(CACHE_KEYS.TERMS.HOT, () =>
    termsDb.getHotTerms().map((t) => ({ ...t, viewCount: 0 })),
  );
}

function getDisciplines() {
  return cache.remember(CACHE_KEYS.DISCIPLINES.LIST, () => termsDb.getDisciplines());
}

function getTermById(id) {
  const key = `term:${id}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const term = termsDb.getTermById(id);
  if (!term) {
    throw new Error("NOT_FOUND");
  }
  cache.set(key, term);
  return term;
}

function _findAliasTermId(aliasDiscipline, aliasName) {
  if (!aliasDiscipline || !aliasName) return null;
  const exact = prepare(
    "SELECT 词条ID as id FROM 词条 WHERE 学科 = ? AND 名称 = ? LIMIT 1",
  ).get(aliasDiscipline, aliasName);
  if (exact) return exact.id;
  const like = prepare(
    "SELECT 词条ID as id FROM 词条 WHERE 学科 = ? AND 名称 LIKE ? LIMIT 1",
  ).get(aliasDiscipline, `%${aliasName}%`);
  if (like) return like.id;
  return null;
}

function _addAliasLinks(termId, aliases) {
  if (!aliases || !Array.isArray(aliases) || aliases.length === 0) return;
  for (const alias of aliases) {
    if (!alias || !alias.discipline || !alias.name) continue;
    const aliasTermId = _findAliasTermId(alias.discipline, alias.name);
    if (!aliasTermId || aliasTermId === termId) continue;
    graphDb.addLink(termId, aliasTermId, "同物异名");
    graphDb.addLink(aliasTermId, termId, "同物异名");
  }
}

function createTerm(data) {
  const { id, discipline, name, translation, essence, tip, hot, aliases } = data;

  if (!id || !discipline || !name) {
    throw new Error("MISSING_FIELDS");
  }

  const result = termsDb.createTerm(
    id,
    discipline,
    name,
    translation,
    essence,
    tip,
    hot,
    aliases,
  );
  _addAliasLinks(id, aliases);
  markDirty();
  cache.invalidatePrefix("terms_");
  cache.invalidate("disciplines", `term:${id}`, "graph_nodes", "graph_links");

  // 同步到 Meilisearch
  meili.addDocument({ id, discipline, name, translation, essence, tip, hot, aliases }).catch(() => {});

  return { id, changes: result.changes };
}

function updateTerm(id, updates) {
  const validFields = ["name", "translation", "essence", "tip", "hot", "aliases"];
  const filteredUpdates = {};

  for (const key of validFields) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    throw new Error("NO_FIELDS");
  }

  const result = termsDb.updateTerm(id, filteredUpdates);

  if (filteredUpdates.aliases !== undefined) {
    graphDb.deleteLinksByTermId(id);
    _addAliasLinks(id, filteredUpdates.aliases);
  }

  markDirty();
  cache.invalidatePrefix("terms_");
  cache.invalidate(`term:${id}`, "graph_nodes", "graph_links");

  // 同步到 Meilisearch（读取更新后的完整词条）
  const updatedTerm = termsDb.getTermById(id);
  if (updatedTerm) {
    meili.updateDocument(updatedTerm).catch(() => {});
  }

  return { changes: result.changes };
}

function deleteTerm(id) {
  const result = termsDb.deleteTerm(id);
  graphDb.deleteLinksByTermId(id);
  markDirty();
  cache.invalidatePrefix("terms_");
  cache.invalidate(`term:${id}`, "graph_nodes", "graph_links", "graph_data");

  // 同步到 Meilisearch
  meili.deleteDocument(id).catch(() => {});

  return { changes: result.changes };
}

function getRandomTerm(discipline) {
  return termsDb.getRandomTermFromDb(discipline);
}

module.exports = {
  getTerms,
  searchTerms,
  getRecentTerms,
  getHotTerms,
  getDisciplines,
  getTermById,
  createTerm,
  updateTerm,
  deleteTerm,
  getRandomTerm,
};
