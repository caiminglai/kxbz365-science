/**
 * 概念抗体管理端点 —— 供 admin.html「概念抗体」页签调用
 *
 * 挂载在 /api/v1/admin/concept-antibodies，路径与字段名以 admin.html 里
 * 早已写好的 loadConceptAntibodies/saveConceptAntibody/deleteConceptAntibody
 * 为准（GET 列表 / POST 新增与编辑 / DELETE /:id），页面无需再改第二遍。
 */
const express = require("express");
const router = express.Router();
const service = require("../services/概念抗体维护");
const { adminAuth } = require("../middleware/安全");

// 与 routes/管理.js 同一套鉴权：整个子路由都要 x-admin-token
router.use(adminAuth);

router.get("/", (req, res) => {
  try {
    res.json({ success: true, data: service.列管理条目() });
  } catch (error) {
    console.error("[概念抗体管理][列表失败]", error);
    res
      .status(500)
      .json({ success: false, error: { code: "LIST_ERROR", message: "读取概念抗体失败" } });
  }
});

// 页签的保存按钮新增和编辑都走 POST（编辑时表单里的 id 已填好且输入框被禁用），
// 所以这里是 upsert 而不是纯 insert。
router.post("/", (req, res) => {
  try {
    const result = service.保存条目(req.body || {});
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.message === "MISSING_FIELDS") {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "ID、词条ID和标题为必填" },
      });
    }
    // 词条ID 上有外键约束，填了不存在的词条会抛 SQLITE_CONSTRAINT，
    // 属于用户输入问题，要回 400 让人看得懂，不能糊成 500。
    if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_TERM_ID", message: "词条ID 不存在，请先在词条管理中确认" },
      });
    }
    console.error("[概念抗体管理][保存失败]", error);
    res
      .status(500)
      .json({ success: false, error: { code: "SAVE_ERROR", message: "保存概念抗体失败" } });
  }
});

router.delete("/:id", (req, res) => {
  try {
    res.json({ success: true, data: service.删除条目(req.params.id) });
  } catch (error) {
    if (error.message === "NOT_FOUND") {
      return res
        .status(404)
        .json({ success: false, error: { code: "NOT_FOUND", message: "概念抗体不存在" } });
    }
    console.error("[概念抗体管理][删除失败]", error);
    res
      .status(500)
      .json({ success: false, error: { code: "DELETE_ERROR", message: "删除概念抗体失败" } });
  }
});

module.exports = router;
