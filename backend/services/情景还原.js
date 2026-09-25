/**
 * 情景还原服务 —— 把 情景还原 + 情景对话 两张表拼成「场景 + 台词」结构
 * 只导出 getScenarios()，供 routes/情景还原（/api/v1/scenarios）调用
 * 结果包在 cache.remember("scenarios") 里（TTL 5 分钟），任何 prepare().run() 写入会整体 clearAll
 * 台词是在 JS 侧按 scenario_id filter 出来的、不是 SQL JOIN，情景和对话都多起来这里是 O(n*m)
 */

const { prepare } = require("../db/入口");
const cache = require("./缓存");

function getScenarios() {
  return cache.remember("scenarios", () => {
    const scenarios = prepare("SELECT 情景ID as id, 场景 as scene, 教训 as lesson FROM 情景还原").all();
    const dialogues = prepare(
      "SELECT 对话ID as dialogue_id, 情景ID as scenario_id, 对话顺序 as line_order, 说话者 as speaker, 对话内容 as text, 高亮内容 as highlight FROM 情景对话 ORDER BY 对话顺序",
    ).all();

    return scenarios.map((s) => ({
      id: s.id,
      scene: s.scene,
      lesson: s.lesson,
      dialogue: dialogues
        .filter((d) => d.scenario_id === s.id)
        .map((d) => ({
          speaker: d.speaker,
          text: d.text,
          highlight: d.highlight,
        })),
    }));
  });
}

module.exports = {
  getScenarios,
};