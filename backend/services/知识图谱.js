/**
 * 知识图谱服务 —— 给前端力导向图喂 nodes 与 links
 * 导出 getNodes()（读 词条 表，补颜色/半径）与 getLinks()（读 图谱关系 表），供 routes/知识图谱 调用
 * 两个结果分别缓存在 graph_nodes / graph_links（TTL 5 分钟），改完数据要确认缓存被清掉
 * DISCIPLINE_COLORS 只硬编码 10 个学科，新学科一律落默认灰 #8B7D6B；要认色就得改这张表
 * 这个默认灰与表里「跨学科」是同一个色值，新学科节点在图上与跨学科节点无法区分
 */

const { prepare } = require("../db/入口");
const cache = require("./缓存");

const DISCIPLINE_COLORS = {
  "数学": "#5B7BA0",
  "物理学": "#6B9B8E",
  "化学": "#9B7B5E",
  "生物学": "#5B9B6E",
  "跨学科": "#8B7D6B",
  "计算机": "#4A9B8E",
  "经济学": "#B8783A",
  "法律政策": "#6B7B5E",
  "医学心理": "#A45D6A",
  "控制论": "#7B6BA0",
};

function getNodes() {
  return cache.remember("graph_nodes", () => {
    const rows = prepare(
      "SELECT 词条ID as id, 学科 as discipline, 名称 as name, 翻译 as translation, 热度 as hot FROM 词条",
    ).all();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      discipline: r.discipline,
      color: DISCIPLINE_COLORS[r.discipline] || "#8B7D6B",
      radius: r.hot ? 12 : 8,
      translation: r.translation,
    }));
  });
}

function getLinks() {
  return cache.remember("graph_links", () =>
    prepare(
      "SELECT 源节点ID as source, 目标节点ID as target, 关系标签 as label FROM 图谱关系",
    ).all(),
  );
}

module.exports = {
  getNodes,
  getLinks,
};