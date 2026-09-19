# 同物异名 · API 参考文档

> **统一入口**：`backend/server.js`
> **统一前缀**：`/api/v1`
> **统一响应格式**：`{ success: boolean, data: any, error?: { code, message } }`
> **数据源**：磁盘 SQLite `data/同物异名.db`（better-sqlite3 驱动）+ Meilisearch 全文搜索引擎（Neo4j 4.4.40 图数据库**未启用**，相关接口见下方标注）
> **更新日期**：2026-07-11

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
12. [学科映射管理](#12-学科映射管理)
13. [词条纠错建议](#13-词条纠错建议)
14. [统计与健康检查](#14-统计与健康检查)
15. [管理后台 - 词条](#15-管理后台---词条)
16. [管理后台 - 学科](#16-管理后台---学科)
17. [管理后台 - 备份与仪表盘](#17-管理后台---备份与仪表盘)
18. [管理后台 - 内容模块](#18-管理后台---内容模块)
19. [前端调用约定](#19-前端调用约定)
20. [路由文件索引](#20-路由文件索引)

---

## 1. 接口总览

| 路由前缀 | 功能 | 状态 | 鉴权 |
|---------|------|------|------|
| `/api/v1/terms` | 词条查询、搜索、学科、详情、CRUD | ✅ 活跃 | 部分需要 |
| `/api/v1/graph` | 知识图谱节点与关系（Neo4j） | ⏸️ 依赖 Neo4j，未启用 | 公开 |
| `/api/v1/comparisons` | 概念对比 | ✅ 活跃 | 部分需要 |
| `/api/v1/scenarios` | 情景还原 | ✅ 活跃 | 公开 |
| `/api/v1/career` | 职业解构 | ✅ 活跃 | 部分需要 |
| `/api/v1/industry` | 产业岗位 | ✅ 活跃 | 部分需要 |
| `/api/v1/antibody` | 概念抗体 | ✅ 活跃 | 部分需要 |
| `/api/v1/jobs` | 高薪技术岗（分类、岗位、阶段、技能） | ✅ 活跃 | 部分需要 |
| `/api/v1/submissions` | 用户提交同物异名 | ✅ 活跃 | 部分需要 |
| `/api/v1/discipline-mapping` | 学科子领域映射管理（19表→10学科） | ✅ 活跃 | 部分需要 |
| `/api/v1/corrections` | 词条纠错建议 | ✅ 活跃 | 部分需要 |
| `/api/v1/stats` | 统计 + 健康检查 + 用户反馈 | ✅ 活跃 | 公开 |
| `/api/v1/admin` | 管理后台（需 `x-admin-token`） | ✅ 活跃 | 需要 |
| `/api/v1/ai` | AI 问答（RAG + LLM） | ✅ 活跃 | 需要 |

---

## 2. 基础规范

### 2.1 成功响应

```json
{
  "success": true,
  "data": { ... }
}
```

### 2.2 失败响应

```json
{
  "success": false,
  "error": { "code": "ERROR_CODE", "message": "错误描述" }
}
```

### 2.3 分页结构

列表接口统一使用以下结构：

```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "total": 120,
    "page": 1,
    "pageSize": 20
  }
}
```

词条列表使用的字段名为 `terms` 而非 `items`：

```json
{
  "success": true,
  "data": {
    "terms": [ ... ],
    "total": 1069,
    "page": 1,
    "pageSize": 1000
  }
}
```

### 2.4 常见错误码

| 错误码 | HTTP状态码 | 含义 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 资源不存在 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |
| `RATE_LIMITED` | 429 | 请求过于频繁 |
| `BLOCKED` | 403 | IP 被临时封禁 |
| `INVALID_INPUT` | 400 | 输入包含非法字符（SQL 注入检测） |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体超过 1MB |
| `UNAUTHORIZED` | 401 | 管理员 Token 无效 |
| `ADMIN_NOT_CONFIGURED` | 500 | 未配置 ADMIN_TOKEN |
| `MISSING_QUERY` | 400 | 搜索缺少关键词 |
| `MISSING_FIELDS` | 400 | 缺少必填字段 |
| `MISSING_ID` | 400 | 缺少ID参数 |
| `MISSING_STATUS` | 400 | 缺少状态参数 |
| `NO_FIELDS` | 400 | 没有要更新的字段 |
| `DUPLICATE_KEY` | 400 | 学科标识已存在 |
| `INVALID_ORDER` | 400 | 排序数据格式错误 |
| `HAS_TERMS` | 400 | 学科下存在词条，无法删除 |
| `MISSING_API_KEY` | 400 | AI 问答缺少 API Key |
| `BACKUP_ERROR` | 500 | 备份失败 |
| `MIGRATE_ERROR` | 500 | 数据库迁移失败 |
| `INVALID_BODY` | 400 | 请求体格式不正确（如 POST /admin/terms 需要非空数组） |
| `INVALID_FIELDS` | 400 | 请求体字段类型不合法 |
| `MISSING_CSV` | 400 | CSV 导入缺少内容 |
| `EMPTY_CSV` | 400 | CSV 内容为空或无可导入数据 |
| `MISSING_NAME` | 400 | 缺少名称字段 |
| `EXPORT_ERROR` | 500 | CSV 导出失败 |
| `IMPORT_ERROR` | 500 | CSV 导入失败 |
| `NOT_FOUND` | 404 | 资源不存在（通用） |
| `GET_CATEGORIES_ERROR` | 500 | 获取分类失败 |
| `CREATE_CATEGORY_ERROR` | 500 | 创建分类失败 |
| `GET_JOBS_ERROR` | 500 | 获取岗位数据失败 |
| `CREATE_JOB_ERROR` | 500 | 创建岗位失败 |
| `UPDATE_JOB_ERROR` | 500 | 更新岗位失败 |
| `DELETE_JOB_ERROR` | 500 | 删除岗位失败 |
| `CREATE_STAGE_ERROR` | 500 | 创建阶段失败 |
| `CREATE_SKILL_ERROR` | 500 | 创建技能失败 |
| `ANTIBODY_ERROR` | 500 | 抗体数据操作失败 |
| `CAREER_ERROR` | 500 | 职业数据操作失败 |
| `MAPPING_NOT_FOUND` | 404 | 学科映射不存在 |
| `MAPPING_CREATE_ERROR` | 500 | 创建学科映射失败 |
| `MAPPING_UPDATE_ERROR` | 500 | 更新学科映射失败 |
| `MAPPING_DELETE_ERROR` | 500 | 删除学科映射失败 |
| `CORRECTION_NOT_FOUND` | 404 | 纠错建议不存在 |
| `CORRECTION_CREATE_ERROR` | 500 | 创建纠错建议失败 |
| `CORRECTION_APPROVE_ERROR` | 500 | 审核纠错建议失败 |
| `NEO4J_CONNECTION_ERROR` | 500 | Neo4j 数据库连接失败 |
| `NEO4J_SYNC_ERROR` | 500 | Neo4j 数据同步失败 |

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
| `pageSize` | number | 否 | 每页数量，默认 50 |
| `discipline` | string | 否 | 按学科过滤（学科名称，如 `物理学`） |
| `keyword` | string | 否 | 关键词（名称/翻译/本质模糊匹配） |
| `hot` | boolean | 否 | 是否只返回热门词条 |

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
        "aliases": "[]",
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

**限流**：600 请求/分钟
**搜索引擎**：Meilisearch 优先，不可用时自动降级 SQLite LIKE 模糊搜索

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `q` | string | 是 | 搜索词 |
| `limit` | number | 否 | 返回条数，默认 8 |

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

> 数据源：Neo4j 4.4.40 图数据库（**未启用**，方向已搁置；数据曾由 SQLite 一次性同步）
> 数据规模：19,703 词条节点、10 学科节点、18,000+ 关系

### 4.1 图谱节点

**接口**：`GET /api/v1/graph/nodes`

**说明**：返回所有图谱节点（Neo4j 查询）

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `discipline` | string | 否 | 按学科过滤 |
| `limit` | number | 否 | 返回数量限制 |

---

### 4.2 图谱关系

**接口**：`GET /api/v1/graph/links`

**说明**：返回所有节点间的关系（Neo4j 查询）

---

### 4.3 节点邻居查询

**接口**：`GET /api/v1/graph/:id/neighbors`

**说明**：查询指定节点的邻居节点（Neo4j 图遍历）

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `depth` | number | 否 | 遍历深度，默认 1 |

---

### 4.4 最短路径查询

**接口**：`GET /api/v1/graph/path`

**说明**：查询两个节点间的最短路径（Neo4j 图算法）

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `from` | string | 是 | 起点节点 ID |
| `to` | string | 是 | 终点节点 ID |

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

---

### 5.3 更新对比（管理）

**接口**：`PUT /api/v1/comparisons/:id`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_ID`

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
  "example": "示例",
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
  "term_aliases": "[]",
  "contact": "联系方式"
}
```

**可能错误**：`MISSING_FIELDS`

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

## 12. 学科映射管理

> 管理 19 个学科词库表到 10 个核心学科的映射关系

### 12.1 获取全部映射

**接口**：`GET /api/v1/discipline-mapping`

**说明**：返回所有学科子领域到核心学科的映射关系

**返回**：

```json
{
  "success": true,
  "data": [
    {
      "id": "math-001",
      "sub_discipline": "数学",
      "core_discipline": "数学",
      "description": "..."
    }
  ]
}
```

---

### 12.2 按核心学科查询

**接口**：`GET /api/v1/discipline-mapping/core/:discipline`

**说明**：查询某个核心学科下包含的所有子领域

**可能错误**：`NOT_FOUND`

---

### 12.3 创建映射（管理）

**接口**：`POST /api/v1/discipline-mapping`

**鉴权**：需要 `x-admin-token`

**请求体**：

```json
{
  "sub_discipline": "子领域名称",
  "core_discipline": "核心学科名称",
  "description": "描述说明"
}
```

**可能错误**：`MISSING_FIELDS`, `DUPLICATE_KEY`

---

### 12.4 更新映射（管理）

**接口**：`PUT /api/v1/discipline-mapping/:id`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_ID`, `NOT_FOUND`, `NO_FIELDS`

---

### 12.5 删除映射（管理）

**接口**：`DELETE /api/v1/discipline-mapping/:id`

**鉴权**：需要 `x-admin-token`

**可能错误**：`MISSING_ID`, `NOT_FOUND`

---

## 13. 词条纠错建议

> 社区协作第二层：用户提交词条纠错建议，管理员审核后生效

### 13.1 提交纠错建议

**接口**：`POST /api/v1/corrections`

**说明**：用户提交词条纠错或补充建议

**请求体**：

```json
{
  "term_id": "词条ID",
  "correction_type": "error",
  "field_name": "翻译",
  "current_value": "当前内容",
  "suggested_value": "建议内容",
  "reason": "纠错理由",
  "contact": "联系方式（可选）"
}
```

**correction_type 可选值**：`error`（错误纠正）/ `improvement`（改进建议）/ `addition`（内容补充）

**可能错误**：`MISSING_FIELDS`, `TERM_NOT_FOUND`

---

### 15.2 我的纠错记录

**接口**：`GET /api/v1/corrections/mine`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `contact` | string | 是 | 联系方式标识 |

---

### 15.3 管理列表（管理）

**接口**：`GET /api/v1/corrections/admin`

**鉴权**：需要 `x-admin-token`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | 否 | 状态过滤：pending/approved/rejected |
| `page` | number | 否 | 页码，默认 1 |
| `pageSize` | number | 否 | 每页数量，默认 20 |

---

### 15.4 审核通过（管理）

**接口**：`POST /api/v1/corrections/:id/approve`

**鉴权**：需要 `x-admin-token`

**说明**：审核通过并自动更新词条内容，同步到 Neo4j

**请求体**：

```json
{
  "review_note": "审核备注"
}
```

**可能错误**：`MISSING_ID`, `NOT_FOUND`

---

### 15.5 审核拒绝（管理）

**接口**：`POST /api/v1/corrections/:id/reject`

**鉴权**：需要 `x-admin-token`

**请求体**：

```json
{
  "reject_reason": "拒绝理由"
}
```

**可能错误**：`MISSING_ID`, `NOT_FOUND`

---

### 15.6 状态统计（管理）

**接口**：`GET /api/v1/corrections/admin/stats`

**鉴权**：需要 `x-admin-token`

**说明**：返回各状态的纠错建议数量统计

---

## 14. 统计与健康检查

### 16.1 全局统计

**接口**：`GET /api/v1/stats`

**说明**：返回全局统计数据（词条数、学科数、对比数、情景数等）

---

### 16.2 健康检查

**接口**：`GET /api/v1/stats/health`

**返回**：

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": 1718000000000,
    "uptime": 3600
  }
}
```

---

### 16.3 提交用户反馈

**接口**：`POST /api/v1/stats/feedback`

**请求体**：

```json
{
  "type": "bug",
  "content": "反馈内容",
  "term_id": "可选-相关词条ID",
  "contact": "可选-联系方式"
}
```

**type 可选值**：`bug` / `suggest` / `other`

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
  "id": "数学",
  "name": "数学",
  "color": "#5B7BA0",
  "description": "学科描述",
  "display_order": 1
}
```

**可能错误**：`MISSING_FIELDS`, `DUPLICATE_KEY`

---

### 16.3 更新单个学科

**接口**：`PUT /api/v1/admin/disciplines/:id`

**可能错误**：`NO_FIELDS`

---

### 16.4 批量更新排序

**接口**：`PUT /api/v1/admin/disciplines/order`

**请求体**：

```json
{
  "order": [
    { "id": "math", "order": 1 },
    { "id": "physics", "order": 2 }
  ]
}
```

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
