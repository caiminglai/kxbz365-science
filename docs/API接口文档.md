# 同物异名 · API 参考文档

> **统一入口**：`backend/server.js`
> **统一前缀**：`/api/v1`
> **统一响应格式**：`{ success: boolean, data: any, error?: { code, message } }`
> **数据源**：磁盘 SQLite 三个库 `data/同物异名.db`、`data/学科词库.db`、`data/语义词典.db`（better-sqlite3 驱动）；知识图谱接口同样直接读 SQLite，与 Neo4j 无关（Neo4j 方向**已放弃,不再启用**，`graphdb` 路由未挂载）。全文搜索**默认走 SQLite `LIKE`**，Meilisearch **未启用**，无需任何外部服务。
> **部署**：接口本身与部署方式无关。接入层单轨：**Docker Compose + Caddy**（本机已整站验证；服务器将重装为 Debian 后走同一份 compose，旧栈 Nginx + PM2 已作废，不再作回滚路径）。`/api/v1/*` 与 `/twym/api/v1/*` 目前**仍完整双挂载**（公开路由、`ai`、`admin` 全部镜像，见 `server.js:81-141`），响应行为一致；`graphdb` 两侧都已注释未挂载。**唯一例外**：`searchRateLimiter`（600 请求/分钟）只挂在 `/api/v1/terms/search`，`/twym/api/v1/terms/search` 未挂，仅受通用 1000/分钟限流约束（`server.js:79`）——`/twym` 镜像段属历史包袱（旧 Nginx rewrite 的残留），删除待办记在 IDE 任务 #35。
> **更新日期**：2026-09-20（按代码实测校对）

---

## 目录

1. [接口总览](#1-接口总览)
2. [基础规范](#2-基础规范)
3. [词条模块](#3-词条模块)
4. [知识图谱](#4-知识图谱)
5. [概念对比](#5-概念对比)
6. [情景还原](#6-情景还原)
7. [职业解构](#7-职业解构)
8. [产业岗位](#8-产业岗位)
9. [概念抗体](#9-概念抗体)
10. [高薪技术岗](#10-高薪技术岗)
11. [用户提交](#11-用户提交)
12. [社区协作 - 学科子领域映射](#12-社区协作---学科子领域映射)
13. [社区协作 - 词条纠错建议](#13-社区协作---词条纠错建议)
14. [统计与健康检查](#14-统计与健康检查)
15. [管理后台 - 词条](#15-管理后台---词条)
16. [管理后台 - 学科](#16-管理后台---学科)
17. [管理后台 - 备份与仪表盘](#17-管理后台---备份与仪表盘)
18. [管理后台 - 内容模块与运维](#18-管理后台---内容模块与运维)
19. [学科词库](#19-学科词库)
20. [语义词典](#20-语义词典)
21. [AI 问答](#21-ai-问答)
22. [前端调用约定](#22-前端调用约定)
23. [路由文件索引](#23-路由文件索引)

---

## 1. 接口总览

| 路由前缀 | 功能 | 状态 | 鉴权 |
|---------|------|------|------|
| `/api/v1/terms` | 词条查询、搜索、学科、详情、CRUD | ✅ 活跃 | 部分需要 |
| `/api/v1/graph` | 知识图谱节点与关系（`nodes`/`links`） | ✅ 活跃（直接读 SQLite，与 Neo4j 无关） | 公开 |
| `/api/v1/comparisons` | 概念对比 | ✅ 活跃 | 部分需要 |
| `/api/v1/scenarios` | 情景还原 | ✅ 活跃 | 公开 |
| `/api/v1/career` | 职业解构 | ✅ 活跃 | 部分需要 |
| `/api/v1/industry` | 产业岗位 | ✅ 活跃 | 部分需要 |
| `/api/v1/antibody` | 概念抗体 | ✅ 活跃 | 部分需要 |
| `/api/v1/jobs` | 高薪技术岗（分类、岗位、阶段、技能） | ✅ 活跃 | 部分需要 |
| `/api/v1/submissions` | 用户提交同物异名 | ✅ 活跃 | 部分需要 |
| `/api/v1/community` | 社区协作：学科子领域映射 + 词条纠错建议 | ✅ 活跃（3 条带中文路径参数的路由 ⚠ 恒 404，见第 12/13 节） | 部分需要 |
| `/api/v1/domains` | 学科词库（19 张分表，独立 SQLite 库） | ✅ 活跃 | 部分需要 |
| `/api/v1/semantics` | 语义词典（同义/反义/简称/上下位，独立 SQLite 库） | ✅ 活跃 | 公开 |
| `/api/v1/stats` | 统计 + 健康检查 + 用户反馈 | ✅ 活跃 | 公开 |
| `/api/v1/admin` | 管理后台（需 `x-admin-token`） | ✅ 活跃 | 需要 |
| `/api/v1/admin/reload-db` | 从磁盘重载数据库 | ✅ 活跃 | 需要 |
| `/api/v1/ai` | AI 问答（多提供商 LLM + RAG） | ✅ 活跃 | 公开（需在请求体自带 `apiKey`，不走 `x-admin-token`） |
| `/api/v1/graphdb` | Neo4j 图数据库接口 | ❌ 未挂载（Neo4j **已放弃,不再启用**，`server.js` 中已注释） | — |

---

## 2. 基础规范

### 2.1 成功响应

```json
{
  "success": true,
  "data": { ... }
}
```

> **例外**：`/api/v1/semantics/*` 与 `/api/v1/domains/*` 由 `routes/语义.js`、`routes/学科词库.js` 直接返回裸对象（如 `{ "查询词": …, "同义词": […] }`、`{ "domains": […], "count": … }`），**不带** `success` 包装；它们出错时返回 `{ "error": "文案", "hint": "…" }`，没有 `error.code`。`/api/v1/community/*` 出错时返回 `{ "success": false, "message": "…" }`，同样没有 `error.code`。

### 2.2 失败响应

```json
{
  "success": false,
  "error": { "code": "ERROR_CODE", "message": "错误描述" }
}
```

### 2.3 分页结构

只有两个接口真正分页，字段名不同：

```json
{
  "success": true,
  "data": {
    "terms": [ ... ],
    "total": 977,
    "page": 1,
    "pageSize": 50
  }
}
```

- `GET /api/v1/terms`：`pageSize` 默认 50，代码内上限 1000
- `GET /api/v1/admin/terms`：同结构，`pageSize` 默认 20
- `GET /api/v1/community/suggestions`：`data` 直接是数组，`total` / `page` / `limit` 挂在响应**顶层**（默认 `limit` 20）
- 其余列表接口 `data` 直接返回全量数组，**不分页**

> 全仓不存在 `{ items, total, page, pageSize }` 这种统一分页形状。

### 2.4 常见错误码

| 错误码 | HTTP状态码 | 含义 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 资源不存在；未匹配到路由时为兜底 404（`接口不存在`） |
| `INTERNAL_ERROR` | 500 | 服务器内部错误（全局兜底） |
| `RATE_LIMITED` | 429 | 请求过于频繁，已临时封禁 |
| `BLOCKED` | 403 | IP 在限流黑名单中 |
| `IP_NOT_ALLOWED` | 403 | IP 不在白名单中 |
| `INVALID_INPUT` | 400 | 输入包含非法字符（SQL 注入检测） |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体超过 1MB |
| `UNAUTHORIZED` | 401 | 管理员 Token 无效 |
| `ADMIN_NOT_CONFIGURED` | 500 | 未配置 ADMIN_TOKEN |
| `MISSING_QUERY` | 400 | 搜索缺少关键词 |
| `MISSING_FIELDS` | 400 | 缺少必填字段 |
| `MISSING_ID` | 400 | 缺少ID参数 |
| `MISSING_STATUS` | 400 | 缺少状态参数 |
| `MISSING_NAME` | 400 | 缺少名称字段（岗位分类） |
| `MISSING_DISCIPLINE` | 400 | 缺少学科参数（`/admin/terms/next-id`、AI 生成词条） |
| `MISSING_QUESTION` | 400 | AI 问答缺少问题 |
| `MISSING_TERM_NAME` | 400 | AI 生成词条缺少术语名 |
| `MISSING_NAME_A` / `MISSING_NAME_B` | 400 | AI 生成概念对比缺少概念 A / B |
| `MISSING_API_KEY` | 400 | AI 问答缺少 API Key |
| `MISSING_CSV` | 400 | CSV 导入缺少内容 |
| `EMPTY_CSV` | 400 | CSV 内容为空或无可导入数据 |
| `NO_FIELDS` | 400 | 没有要更新的字段 |
| `INVALID_BODY` | 400 | 请求体格式不正确（如 POST /admin/terms 需要非空数组） |
| `INVALID_FIELDS` | 400 | 请求体字段类型不合法 |
| `INVALID_ORDER` | 400 | 排序数据格式错误 |
| `INVALID_DATA` | 500 | 服务层判定请求体非对象（`services/用户提交.js` 抛出，经路由兜底为 `INTERNAL_ERROR`） |
| `MISSING_PARAM` / `INVALID_PARAM` / `VALIDATION_ERROR` | 400 | `utils/验证器.js` 抛出，由 `server.js` 的 `ERROR_MAP` 前缀匹配转状态码 |
| `DUPLICATE_KEY` | 400 | 学科标识已存在 |
| `HAS_TERMS` | 400 | 学科下存在词条，无法删除 |
| `GRAPH_ERROR` | 500 | 图谱节点/关系查询失败（`nodes`、`links` 共用同一个码） |
| `STATS_ERROR` / `HEALTH_ERROR` / `FEEDBACK_ERROR` | 500 | 统计 / 健康检查 / 反馈失败 |
| `SCENARIOS_ERROR` | 500 | 情景还原查询失败 |
| `COMPARE_ERROR` / `CREATE_COMPARE_ERROR` / `UPDATE_COMPARE_ERROR` | 500 | 概念对比查询 / 创建 / 更新失败 |
| `INDUSTRY_ERROR` / `INDUSTRY_CREATE_ERROR` / `INDUSTRY_DELETE_ERROR` / `INDUSTRY_DETAIL_ERROR` | 500 | 产业岗位操作失败 |
| `CAREER_ERROR` / `CAREER_CREATE_ERROR` / `CAREER_DELETE_ERROR` / `CAREER_DETAIL_ERROR` | 500 | 职业解构操作失败 |
| `ANTIBODY_ERROR` / `ANTIBODY_CREATE_ERROR` / `ANTIBODY_DELETE_ERROR` | 500 | 概念抗体操作失败 |
| `GET_JOBS_ERROR` / `GET_JOB_ERROR` / `CREATE_JOB_ERROR` / `UPDATE_JOB_ERROR` / `DELETE_JOB_ERROR` | 500 | 高薪技术岗操作失败 |
| `CREATE_STAGE_ERROR` / `CREATE_SKILL_ERROR` / `CREATE_CATEGORY_ERROR` | 500 | 创建阶段 / 技能 / 分类失败 |
| `GET_CATEGORIES_ERROR` | 500 | 获取分类失败 |
| `EXPORT_ERROR` / `IMPORT_ERROR` | 500 | CSV 导出 / 导入失败 |
| `BACKUP_ERROR` / `MIGRATE_ERROR` | 500 | 备份 / 数据库迁移失败 |
| `RELOAD_ERROR` | 500 | 重载数据库失败 |
| `SYNC_UNAVAILABLE` | 503 | Obsidian 同步服务未加载 |
| `SYNC_ERROR` | 500 | Obsidian 全量同步失败 |
| `AI_ERROR` | 500 | AI 路由未分类错误兜底 |

### 2.5 管理接口鉴权

管理接口（`/api/v1/admin/*` 以及各模块的管理端点）必须在 HTTP Header 中携带：

```
x-admin-token: <你的 token>
```

token 值由 `backend/.env` 里的 `ADMIN_TOKEN` 环境变量定义。

---

## 3. 词条模块

### 3.1 词条列表

**接口**：`GET /api/v1/terms`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | number | 否 | 页码，默认 1 |
| `pageSize` | number | 否 | 每页数量，默认 50，代码内上限 1000 |
| `discipline` | string | 否 | 按学科过滤（学科名称，如 `物理学`） |

> 本接口**不支持** `keyword` / `hot` 参数（`routes/词条.js` 只解构 `page`、`pageSize`、`discipline`）；关键词搜索请用 `/api/v1/terms/search`，热门词条请用 `/api/v1/terms/hot`。

**示例**：

```
GET /api/v1/terms?page=1&pageSize=20&discipline=物理学
```

**返回**：

```json
{
  "success": true,
  "data": {
    "terms": [
      {
        "id": "physics-001",
        "discipline": "物理学",
        "name": "波函数",
        "translation": "概率波",
        "essence": "...",
        "tip": "...",
        "aliases": [],
        "hot": 0,
        "created_at": 1718000000000
      }
    ],
    "total": 10,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### 3.2 搜索词条

**接口**：`GET /api/v1/terms/search`

**限流**：600 请求/分钟（超限后封禁 10 分钟）
**搜索引擎**：Meilisearch **未启用**，默认直接走 SQLite `LIKE`（匹配 `名称/翻译/本质/提示` 四列）；无需任何外部服务

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `q` | string | 是 | 搜索词，空值报 `MISSING_QUERY` |
| `limit` | number | 否 | 返回条数，默认 20，代码内上限 50 |

**返回**：`data = { results: [{ term, score, highlights }], total, query }`，`term` 为完整词条对象；SQLite LIKE 路径下 `score` 恒为 1、`highlights` 为 `[]`。

**可能错误**：`MISSING_QUERY`

---

### 3.3 学科列表

**接口**：`GET /api/v1/terms/disciplines`

**说明**：返回所有学科及其词条数，前端首页学科卡片/分类导航的数据源。

**返回**：

```json
{
  "success": true,
  "data": [
    {
      "id": "数学",
      "name": "数学",
      "color": "#5B7BA0",
      "description": "...",
      "display_order": 1,
      "term_count": 24
    }
  ]
}
```

---

### 3.4 单条词条详情

**接口**：`GET /api/v1/terms/:id`

**说明**：返回完整词条对象

**可能错误**：`NOT_FOUND`

---

### 3.5 热门词条

**接口**：`GET /api/v1/terms/hot`

**说明**：返回 `hot = 1` 的词条列表

---

### 3.6 最新词条

**接口**：`GET /api/v1/terms/recent`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | number | 否 | 返回条数 |

---

### 3.7 随机词条

**接口**：`GET /api/v1/terms/random`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `discipline` | string | 否 | 按学科随机 |

**可能错误**：`NOT_FOUND`

---

## 4. 知识图谱

> 数据源：SQLite `data/同物异名.db`（`services/知识图谱.js` 直接 `SELECT` `词条` 与 `图谱关系` 表，结果经 `services/缓存.js` 缓存），**与 Neo4j 无关**——Neo4j 方向**已放弃,不再启用**。
> 数据规模（实测）：977 词条节点、10 学科节点、672 条关系。
> 本节只有 `nodes`、`links` 两个端点；邻居遍历、最短路径、Cypher 查询等在 `routes/图数据库.js`（`/api/v1/graphdb`）中，该路由在 `server.js` 里已注释**未挂载**。

### 4.1 图谱节点

**接口**：`GET /api/v1/graph/nodes`

**说明**：返回**全部**词条节点（`SELECT 词条ID, 学科, 名称, 翻译, 热度 FROM 词条`），字段为 `{ id, name, discipline, color, radius, translation }`，`color` 由学科中文名在代码内查表得到。

**参数**：无。`routes/知识图谱.js` 未读取 `req.query`，传 `discipline`、`limit` 等参数**不会生效**。

---

### 4.2 图谱关系

**接口**：`GET /api/v1/graph/links`

**说明**：返回 `图谱关系` 表全部记录，字段为 `{ source, target, label }`。

**参数**：无（同上，查询参数不生效）。

**可能错误**：两者失败时统一返回 `GRAPH_ERROR`（500）。

---

## 5. 概念对比

### 5.1 对比列表

**接口**：`GET /api/v1/comparisons`

**说明**：返回所有概念对比数据

---

### 5.2 创建对比（管理）

**接口**：`POST /api/v1/comparisons`

**鉴权**：需要 `x-admin-token`

**请求体**：

```json
{
  "id": "cmp-001",
  "conceptA": "概念A",
  "conceptB": "概念B",
  "title": "对比标题",
  "concept_a_name": "概念A",
  "concept_a_discipline": "计算机",
  "concept_a_plain": "通俗解释A",
  "concept_a_symptom": "表现A",
  "concept_a_analogy": "类比A",
  "concept_a_fix": "解决A",
  "concept_b_name": "概念B",
  "concept_b_discipline": "经济学",
  "concept_b_plain": "通俗解释B",
  "concept_b_symptom": "表现B",
  "concept_b_analogy": "类比B",
  "concept_b_fix": "解决B",
  "summary": "一句话总结",
  "relationship_type": "关联性"
}
```

> ⚠ **已知坑（字段命名不一致）**：路由的存在性校验读的是驼峰 `conceptA` / `conceptB`（缺失即 400 `MISSING_FIELDS`），而 `services/概念对比.js` 落库时解构的却是下划线 `concept_a_*` / `concept_b_*`。因此请求体**必须同时**带 `conceptA`、`conceptB` 与实际的 `concept_a_name` 等字段，否则会被拒绝或写入空值。`id` 省略时自动生成 `cmp_<时间戳>`。

---

### 5.3 更新对比（管理）

**接口**：`PUT /api/v1/comparisons/:id`

**鉴权**：需要 `x-admin-token`

**可能错误**：`NO_FIELDS`（请求体为空对象）、`UPDATE_COMPARE_ERROR`

---

### 5.4 删除对比（管理）

**接口**：`DELETE /api/v1/comparisons/:id`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_ID`

---

## 6. 情景还原

### 6.1 情景列表

**接口**：`GET /api/v1/scenarios`

**说明**：返回所有情景还原数据（含对话）

---

## 7. 职业解构

### 7.1 职业列表

**接口**：`GET /api/v1/career`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `category` | string | 否 | 按分类过滤 |

---

### 7.2 职业分类

**接口**：`GET /api/v1/career/categories`

---

### 7.3 职业详情

**接口**：`GET /api/v1/career/:id`

**说明**：返回单个职业详情（含阶段/技能/资源/项目）

**可能错误**：`NOT_FOUND`

---

### 7.4 导出CSV（管理）

**接口**：`GET /api/v1/career/export/csv`

**鉴权**：需要 `x-admin-token`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `category` | string | 否 | 按分类导出 |

---

### 7.5 导入CSV（管理）

**接口**：`POST /api/v1/career/import/csv`

**鉴权**：需要 `x-admin-token`

**请求体**：

```json
{
  "content": "CSV字符串内容"
}
```

---

### 7.6 创建职业（管理）

**接口**：`POST /api/v1/career`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_FIELDS`

---

### 7.7 删除职业（管理）

**接口**：`DELETE /api/v1/career/:id`

**鉴权**：需要 `x-admin-token`

---

## 8. 产业岗位

### 8.1 产业列表

**接口**：`GET /api/v1/industry`

---

### 8.2 产业详情

**接口**：`GET /api/v1/industry/:id`

**可能错误**：`NOT_FOUND`

---

### 8.3 创建产业（管理）

**接口**：`POST /api/v1/industry`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_FIELDS`

---

### 8.4 删除产业（管理）

**接口**：`DELETE /api/v1/industry/:id`

**鉴权**：需要 `x-admin-token`

---

## 9. 概念抗体

### 9.1 抗体列表

**接口**：`GET /api/v1/antibody`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `term_id` | string | 否 | 按词条ID过滤 |
| `category` | string | 否 | 按分类过滤 |

---

### 9.2 抗体分类

**接口**：`GET /api/v1/antibody/categories`

---

### 9.3 导出CSV（管理）

**接口**：`GET /api/v1/antibody/export/csv`

**鉴权**：需要 `x-admin-token`

---

### 9.4 导入CSV（管理）

**接口**：`POST /api/v1/antibody/import/csv`

**鉴权**：需要 `x-admin-token`

---

### 9.5 创建抗体（管理）

**接口**：`POST /api/v1/antibody`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_FIELDS`

---

### 9.6 删除抗体（管理）

**接口**：`DELETE /api/v1/antibody/:id`

**鉴权**：需要 `x-admin-token`

---

## 10. 高薪技术岗

### 10.1 岗位分类列表

**接口**：`GET /api/v1/jobs/categories`

---

### 10.2 创建分类（管理）

**接口**：`POST /api/v1/jobs/categories`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_NAME`

---

### 10.3 岗位列表

**接口**：`GET /api/v1/jobs`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `categoryId` | number | 否 | 按分类ID过滤 |

---

### 10.4 带详情的岗位列表

**接口**：`GET /api/v1/jobs/detailed`

**说明**：N+1优化，返回所有岗位及其 stages/skills/resources

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `categoryId` | number | 否 | 按分类ID过滤 |

---

### 10.5 岗位详情

**接口**：`GET /api/v1/jobs/:id`

**说明**：返回单个岗位详情（含阶段/技能/资源/项目/知识卡片）

**可能错误**：`NOT_FOUND`

---

### 10.6 创建岗位（管理）

**接口**：`POST /api/v1/jobs`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_FIELDS`

---

### 10.7 更新岗位（管理）

**接口**：`PUT /api/v1/jobs/:id`

**鉴权**：需要 `x-admin-token`

---

### 10.8 删除岗位（管理）

**接口**：`DELETE /api/v1/jobs/:id`

**鉴权**：需要 `x-admin-token`

---

### 10.9 导出CSV（管理）

**接口**：`GET /api/v1/jobs/export/csv`

**鉴权**：需要 `x-admin-token`

---

### 10.10 导入CSV（管理）

**接口**：`POST /api/v1/jobs/import/csv`

**鉴权**：需要 `x-admin-token`

---

### 10.11 创建阶段（管理）

**接口**：`POST /api/v1/jobs/:id/stages`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_FIELDS`

---

### 10.12 创建技能（管理）

**接口**：`POST /api/v1/jobs/:id/stages/:stageId/skills`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_FIELDS`

---

## 11. 用户提交

### 11.1 待审核列表

**接口**：`GET /api/v1/submissions`

**说明**：默认返回 status=pending 的提交

---

### 11.2 已通过列表

**接口**：`GET /api/v1/submissions/approved`

---

### 11.3 提交建议

**接口**：`POST /api/v1/submissions`

**请求体（同物异名对）**：

```json
{
  "submission_type": "pair",
  "term1": "术语1",
  "term2": "术语2",
  "explanation": "解释",
  "examples": "示例",
  "contact": "联系方式"
}
```

**请求体（新词条）**：

```json
{
  "submission_type": "term",
  "term_name": "词条名称",
  "term_discipline": "学科ID",
  "term_translation": "翻译",
  "term_essence": "本质",
  "term_tip": "提示",
  "term_aliases": ["别名1", "别名2"],
  "contact": "联系方式"
}
```

**说明**：`submission_type` 省略时默认 `pair`（`validateEnum` 取枚举首项），只接受 `pair` / `term`；`term` 分支必填 `term_name`、`term_discipline`；`term_aliases` 只有传数组才会保留，传字符串会被静默替换为 `[]`。

**可能错误**：`MISSING_FIELDS`（400，仅当 service 抛出的错误文本恰为该字符串）、`INTERNAL_ERROR`（500；`submission_type` 非法或必填项缺失时 `validateEnum` / `validateString` 抛的是 `INVALID_PARAM:*` / `MISSING_PARAM:*`，路由未映射，故实际落到这里）

---

### 11.4 管理列表

**接口**：`GET /api/v1/submissions/admin`

**鉴权**：需要 `x-admin-token`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | 否 | 状态过滤：pending/approved/rejected |

---

### 11.5 更新状态（管理）

**接口**：`PUT /api/v1/submissions/admin/:id`

**鉴权**：需要 `x-admin-token`

**请求体**：

```json
{
  "status": "approved",
  "review_note": "审核备注"
}
```

**可能错误**：`MISSING_ID`, `MISSING_STATUS`

---

### 11.6 状态统计（管理）

**接口**：`GET /api/v1/submissions/admin/stats`

**鉴权**：需要 `x-admin-token`

**说明**：返回各状态的提交数量统计

---

### 11.7 审核通过（管理）

**接口**：`POST /api/v1/submissions/admin/:id/approve`

**鉴权**：需要 `x-admin-token`

**说明**：审核通过并自动创建词条

**可能错误**：`MISSING_ID`, `NOT_FOUND`, `MISSING_FIELDS`

---

### 11.8 审核拒绝（管理）

**接口**：`POST /api/v1/submissions/admin/:id/reject`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_ID`

---

### 11.9 删除提交（管理）

**接口**：`DELETE /api/v1/submissions/admin/:id`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_ID`

---

## 12. 社区协作 - 学科子领域映射

> 路由文件：`backend/routes/社区协作.js`，在 `server.js` 中挂载为 `/api/v1/community`（同时别名挂载 `/twym/api/v1/community`）。
> 数据表：`学科子领域映射`（字段：`子领域名称`(主键) / `核心学科` / `词条数量` / `显示顺序` / `描述` / `创建时间` / `更新时间`）。
> 本模块失败响应为 `{ success: false, message: "..." }`，**没有 `error.code`**。

### 12.1 获取全部映射

**接口**：`GET /api/v1/community/mapping`

**说明**：`LEFT JOIN 学科` 附带核心学科颜色，按 `核心学科, 显示顺序, 子领域名称` 排序

**返回**：

```json
{
  "success": true,
  "data": [
    {
      "子领域名称": "天文学",
      "核心学科": "物理学",
      "词条数量": 312,
      "显示顺序": 3,
      "描述": "天文学词库，归属物理学",
      "创建时间": "2025-...",
      "更新时间": "2025-...",
      "学科颜色": "#5B7BA0"
    }
  ]
}
```

---

### 12.2 按核心学科分组

**接口**：`GET /api/v1/community/mapping/grouped`

**返回**：`data` 是以核心学科名为 key 的对象

```json
{
  "success": true,
  "data": {
    "数学": [ { "子领域名称": "...", "核心学科": "数学" } ]
  }
}
```

---

### 12.3 创建映射（管理）

**接口**：`POST /api/v1/community/mapping`

**鉴权**：需要 `x-admin-token`

**请求体**：

```json
{
  "子领域名称": "子领域名称",
  "核心学科": "核心学科名称",
  "显示顺序": 99,
  "描述": "描述说明"
}
```

**说明**：`显示顺序` 默认 `99`、`描述` 默认 `""`；`子领域名称` 是主键，重复会走 SQLite 约束错误 → 500 `{success:false,message}`（路由未特判 `DUPLICATE`）。

---

### 12.4 更新映射（管理）

**接口**：`PUT /api/v1/community/mapping/:子领域名称`

**鉴权**：需要 `x-admin-token`

**请求体**：`{ "核心学科": "...", "显示顺序": 1, "描述": "..." }`（`显示顺序` / `描述` 走 `COALESCE`，省略即保留原值）

> ⚠ 当前恒返回 404（中文路径参数名 + path-to-regexp 0.1.13 已知问题）：`routes/社区协作.js` 里路径写成 `'/mapping/:子领域名称'`，该版本正则不识别中文参数名，编译后 `keys = []`，路由永不匹配，请求会落到全局 404。代码行为如此，文档按现状记录，未做修改。

---

### 12.5 删除映射（管理）

**接口**：`DELETE /api/v1/community/mapping/:子领域名称`

**鉴权**：需要 `x-admin-token`

> ⚠ 当前恒返回 404（中文路径参数名 + path-to-regexp 0.1.13 已知问题）

---

## 13. 社区协作 - 词条纠错建议

> 路由文件：`backend/routes/社区协作.js`，挂载前缀同第 12 节（`/api/v1/community`）。
> 数据表：`词条纠错建议`（字段：`建议ID`(自增主键) / `词条ID` / `词条名称` / `纠错类型`(默认 `学科归属`) / `建议内容` / `提交者标识`(默认 `匿名`) / `状态`(默认 `待审核`) / `审核备注` / `审核时间` / `创建时间`），由 `db/入口.js` 启动期 `CREATE TABLE IF NOT EXISTS` 建表。
> 失败响应统一为 `{ success: false, message: "..." }`（500），无 `error.code`；路由不做任何必填校验，缺字段直接落到 SQLite。

### 13.1 提交纠错建议

**接口**：`POST /api/v1/community/suggestions`

**鉴权**：公开

**请求体**：

```json
{
  "词条ID": "math_极限",
  "词条名称": "极限",
  "纠错类型": "学科归属",
  "建议内容": "建议改归到分析学",
  "提交者标识": "匿名"
}
```

**返回**：`{ "success": true, "message": "建议已提交，感谢您的贡献", "data": { "建议ID": 1 } }`

**说明**：`纠错类型` 与 `提交者标识` 省略时用上述默认值；`纠错类型` 无枚举校验，任意字符串均可入库。

---

### 13.2 建议列表（管理）

**接口**：`GET /api/v1/community/suggestions`

**鉴权**：需要 `x-admin-token`

**参数**：

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `状态` | string | 否 | `待审核` | 状态过滤，取值 `待审核` / `已通过` / `已拒绝`；想取全部必须显式传空 `?状态=`（默认值非空，过滤条件恒成立） |
| `纠错类型` | string | 否 | — | 按纠错类型精确过滤 |
| `page` | number | 否 | 1 | 页码 |
| `limit` | number | 否 | 20 | 每页数量 |

**返回**：分页字段在**顶层**而非 `data` 内：

```json
{
  "success": true,
  "data": [ { "建议ID": 1, "状态": "待审核" } ],
  "total": 0,
  "page": 1,
  "limit": 20
}
```

---

### 13.3 纠错统计

**接口**：`GET /api/v1/community/suggestions/stats`

**鉴权**：公开

**返回**：`data` 为按状态分组数组（无数据时为空数组，不会补零）

```json
{
  "success": true,
  "data": [ { "状态": "待审核", "数量": 3 } ]
}
```

---

### 13.4 审核建议（管理）

**接口**：`PUT /api/v1/community/suggestions/:建议ID`

**鉴权**：需要 `x-admin-token`

**请求体**：`{ "状态": "已通过", "审核备注": "已核实" }`

**说明**：审核仅更新建议表自身状态，**不会回写 `词条` 表**，也不存在任何图数据库同步（Neo4j 已放弃,不再启用）。

> ⚠ 当前恒返回 404（中文路径参数名 + path-to-regexp 0.1.13 已知问题）

---

## 14. 统计与健康检查

### 14.1 全局统计

**接口**：`GET /api/v1/stats`

**说明**：返回 `services/统计.js#getStats()` 的结果：`totalTerms`（= 主表 `词条` 977 + 19 张学科分表汇总）、`mainTerms`、`subjectTerms`、`hotTerms`、`totalLinks`、`totalComparisons`、`totalScenarios`、`byDiscipline`（学科名 → 词条数的对象）。学科分表不存在时逐表 `try/catch` 跳过。

---

### 14.2 健康检查

**接口**：`GET /api/v1/stats/health`

**返回**：

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "timestamp": "2025-01-01T00:00:00.000Z",
    "cache": { "keys": 0, "hits": 0, "misses": 0, "hitRate": "0.000" }
  }
}
```

---

### 14.3 提交用户反馈

**接口**：`POST /api/v1/stats/feedback`

**请求体**：

```json
{
  "type": "bug",
  "content": "反馈内容",
  "termId": "可选-相关词条ID",
  "contact": "可选-联系方式"
}
```

**说明**：仅 `type` 与 `content` 必填；`type` 无枚举校验，任意字符串都会原样入库；字段名是驼峰 `termId`，传 `term_id` 会被忽略。

**可能错误**：`MISSING_FIELDS`

---

## 15. 管理后台 - 词条

> 所有接口均需要 `x-admin-token`

### 15.1 词条管理列表

**接口**：`GET /api/v1/admin/terms`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | number | 否 | 页码，默认 1 |
| `pageSize` | number | 否 | 每页数量，默认 20 |
| `search` | string | 否 | 搜索关键词 |
| `discipline` | string | 否 | 学科过滤 |

---

### 15.2 批量创建词条

**接口**：`POST /api/v1/admin/terms`

**请求体**：词条对象数组（必须非空，每个词条必须包含 `name` 字段且为字符串类型）

**可能错误**：`INVALID_BODY`（非数组或空数组）、`INVALID_FIELDS`（缺少 name 字段）

```json
[
  {
    "id": "term-001",
    "discipline": "计算机",
    "name": "词条名",
    "translation": "翻译",
    "essence": "本质",
    "tip": "提示",
    "hot": 0
  }
]
```

---

### 15.3 更新单个词条

**接口**：`PUT /api/v1/admin/terms/:id`

**请求体**：至少包含一个要更新的字段（不能为空对象）

**可能错误**：`NO_FIELDS`（请求体为空或没有可更新字段）

---

### 15.4 删除单个词条

**接口**：`DELETE /api/v1/admin/terms/:id`

---

### 15.5 词条历史记录

**接口**：`GET /api/v1/admin/terms/:id/history`

**说明**：返回词条的修改历史

---

### 15.6 导出CSV

**接口**：`GET /api/v1/admin/terms/export/csv`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `discipline` | string | 否 | 按学科导出 |

---

### 15.7 导入CSV

**接口**：`POST /api/v1/admin/terms/import/csv`

**请求体**：

```json
{
  "content": "CSV字符串内容"
}
```

---

## 16. 管理后台 - 学科

> 所有接口均需要 `x-admin-token`

### 16.1 学科列表

**接口**：`GET /api/v1/admin/disciplines`

---

### 16.2 创建学科

**接口**：`POST /api/v1/admin/disciplines`

**请求体**：

```json
{
  "name": "数学",
  "color": "#5B7BA0",
  "description": "学科描述"
}
```

**说明**：只读 `name` / `color` / `description` 三个字段；`学科名称` 即主键（响应里的 `id` 与 `name` 相同），`display_order` 由当前学科总数推导，请求体里传 `id` / `display_order` 会被忽略。`color` 缺省为 `#6B7B5E`。

**可能错误**：`MISSING_FIELDS`（缺 `name`）, `DUPLICATE_KEY`

---

### 16.3 更新单个学科

**接口**：`PUT /api/v1/admin/disciplines/:id`

**说明**：`:id` 即 `学科名称`（中文名）。service 只白名单接收 `name`、`color` 两个字段，传 `description` / `display_order` 会被静默丢弃。

**可能错误**：`NO_FIELDS`

---

### 16.4 批量更新排序

**接口**：`PUT /api/v1/admin/disciplines/order`

**请求体**：`order` 是**学科名称字符串数组**，数组下标 +1 即为新的 `显示顺序`

```json
{
  "order": ["数学", "物理学", "计算机"]
}
```

**说明**：注册顺序在 `/disciplines/:id` 之前，因此不会被 `:id` 截获。非数组 → 400 `INVALID_ORDER`；空数组直接返回 `{ updated: 0 }` 不报错。

**可能错误**：`INVALID_ORDER`

---

### 16.5 删除学科

**接口**：`DELETE /api/v1/admin/disciplines/:id`

**说明**：学科下有词条时返回 `HAS_TERMS` 错误

**可能错误**：`HAS_TERMS`

---

## 17. 管理后台 - 备份与仪表盘

> 所有接口均需要 `x-admin-token`

### 17.1 创建备份

**接口**：`POST /api/v1/admin/backup`

**说明**：立即创建一份数据库备份到 `data/backups/`

**响应**：返回 `filename`（不含路径，避免暴露服务器目录结构）和 `timestamp`

```json
{
  "success": true,
  "data": {
    "filename": "backup_20260630_120000.db",
    "timestamp": "2026-06-30T12:00:00.000Z"
  }
}
```

---

### 17.2 备份列表

**接口**：`GET /api/v1/admin/backups`

**说明**：列出所有备份文件（按时间倒序）

---

### 17.3 仪表盘统计

**接口**：`GET /api/v1/admin/dashboard`

**说明**：返回仪表盘统计数据（词条数、学科数、对比数、情景数、各学科词数分布等）

---

### 17.4 数据质量报告

**接口**：`GET /api/v1/admin/data-quality`

---

### 17.5 数据库迁移

**接口**：`POST /api/v1/admin/migrate`

**说明**：执行在线数据库迁移（不需要重启服务）

**可能错误**：`MIGRATE_ERROR`

---

## 18. 管理后台 - 内容模块

> 所有接口均需要 `x-admin-token`

同一套资源模块在 `/api/v1/admin/` 下挂载，用于 CRUD 操作：

| 接口 | 功能 | 必填参数 |
|------|------|----------|
| `POST /api/v1/admin/graph/links` | 新增图谱关系 | Body: `sourceId` + `targetId`，可选 `label` |
| `DELETE /api/v1/admin/graph/links` | 删除图谱关系 | Query: `source` + `target` |

> 缺少必填参数时返回 `MISSING_FIELDS` 错误。

更多内容模块的管理接口请参考各模块路由文件：

- 职业解构：[职业.js](file:///e:/website/1.my-first-website/backend/routes/职业解构.js)
- 产业岗位：[产业.js](file:///e:/website/1.my-first-website/backend/routes/产业岗位.js)
- 概念抗体：[抗体.js](file:///e:/website/1.my-first-website/backend/routes/概念抗体.js)
- 高薪技术岗：[岗位.js](file:///e:/website/1.my-first-website/backend/routes/高薪技术岗.js)

---

## 19. 前端调用约定

前端采用两层 API 抽象：

1. **`client.ts`**：底层 `apiClient`，统一处理超时、重试、错误、JSON 解析：

```typescript
// 默认 30s 超时，自动重试网络错误；业务错误抛 APIErrorException。
apiClient.get<T>("/api/v1/terms?page=1&pageSize=20");
apiClient.post<T>("/api/v1/admin/disciplines", data);
```

2. **`services.ts`**：业务层封装，组件应调用此层函数而非直接使用 `apiClient` 或 `fetch`：

```typescript
import { searchTerms, getJobCategories, getDetailedJobs } from '@/api/services'
const results = await searchTerms('人工智能', 8)
const categories = await getJobCategories()
```

请求会通过 Vite proxy 转发到 `http://localhost:3000`，生产环境直接同源请求。

---

## 20. 路由文件索引

| 文件 | 挂载路径 | 说明 |
|------|---------|------|
| [词条.js](file:///e:/website/1.my-first-website/backend/routes/词条.js) | `/api/v1/terms` | 词条查询/搜索/CRUD |
| [图谱.js](file:///e:/website/1.my-first-website/backend/routes/知识图谱.js) | `/api/v1/graph` | 知识图谱 nodes/links |
| [对比.js](file:///e:/website/1.my-first-website/backend/routes/概念对比.js) | `/api/v1/comparisons` | 概念对比 |
| [情景.js](file:///e:/website/1.my-first-website/backend/routes/情景还原.js) | `/api/v1/scenarios` | 情景还原 |
| [职业.js](file:///e:/website/1.my-first-website/backend/routes/职业解构.js) | `/api/v1/career` | 职业解构 |
| [产业.js](file:///e:/website/1.my-first-website/backend/routes/产业岗位.js) | `/api/v1/industry` | 产业岗位 |
| [抗体.js](file:///e:/website/1.my-first-website/backend/routes/概念抗体.js) | `/api/v1/antibody` | 概念抗体 |
| [岗位.js](file:///e:/website/1.my-first-website/backend/routes/高薪技术岗.js) | `/api/v1/jobs` | 高薪技术岗 |
| [统计.js](file:///e:/website/1.my-first-website/backend/routes/统计.js) | `/api/v1/stats` | 统计 + 健康检查 + 用户反馈 |
| [提交.js](file:///e:/website/1.my-first-website/backend/routes/用户提交.js) | `/api/v1/submissions` | 用户提交 |
| [学科映射.js](file:///e:/website/1.my-first-website/backend/routes/学科映射.js) | `/api/v1/discipline-mapping` | 学科子领域映射管理（19表→10学科） |
| [纠错建议.js](file:///e:/website/1.my-first-website/backend/routes/纠错建议.js) | `/api/v1/corrections` | 词条纠错建议 |
| [管理.js](file:///e:/website/1.my-first-website/backend/routes/管理.js) | `/api/v1/admin` | 词条/学科/备份/仪表盘/图谱关系 |
| [AI.js](file:///e:/website/1.my-first-website/backend/routes/AI问答.js) | `/api/v1/ai` | AI 问答 |
| [语义.js](file:///e:/website/1.my-first-website/backend/routes/语义.js) | `/api/v1/semantics` | 语义词典（同义/反义/简称/抽象） |

---

*更新日期：2026-07-11*
