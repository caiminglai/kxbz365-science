/**
 * ============================================================
 *  数据库入口模块
 * ============================================================
 *
 *  设计原则：
 *    1. 同物异名.db 是唯一数据源，任何读写都直接操作磁盘文件
 *    2. 数据库文件不存在时，自动从 schema.sql 创建空表
 *    3. 写入操作立即同步到磁盘，确保外部修改立即可见
 *    4. 不使用内存数据库 + 定时回写机制，避免覆盖外部修改
 *
 *  技术选型：better-sqlite3（同步API，性能好，直接操作文件）
 * ============================================================
 */

const fs = require("fs");      // 文件系统模块
const path = require("path");  // 路径处理模块
const Database = require("better-sqlite3");  // SQLite 数据库驱动

// ==================== 路径配置 ====================

/**
 * 数据库文件路径
 * 优先级：环境变量 > 默认相对路径
 * 默认位置：项目根目录/data/同物异名.db
 */
const 数据库文件路径 = process.env.DB_PATH || path.join(__dirname, "..", "..", "data", "同物异名.db");

/** 数据库所在目录 */
const 数据目录 = path.dirname(数据库文件路径);

// ==================== 全局变量 ====================

let 数据库实例 = null;       // 数据库连接实例
let 是否已初始化 = false;   // 初始化标记，防止重复初始化

// ==================== 工具函数 ====================

/**
 * 清空所有缓存（写入操作后调用）
 * 确保读取的数据是最新的
 */
function 清空所有缓存() {
  try {
    const 缓存模块 = require("../services/缓存");
    if (缓存模块 && typeof 缓存模块.clearAll === "function") {
      缓存模块.clearAll();
    }
  } catch (_错误) {
    // 缓存模块可能还没初始化，忽略错误
  }
}

/**
 * 确保数据目录存在，不存在则创建
 */
function 确保数据目录存在() {
  if (!fs.existsSync(数据目录)) {
    fs.mkdirSync(数据目录, { recursive: true });
  }
}

/**
 * 执行轻量级 Schema 迁移
 * 自动检测并添加缺失的列，保证数据库结构是最新的
 *
 * 注意：这里的表名是中文的（词条、学科等），与数据库实际表名一致
 *
 * ⚠️ 下面几段用 `exec("SELECT sql FROM sqlite_master ...")` 判存在再 ALTER 的写法，
 * 一次都没生效过：better-sqlite3 的 exec() 不返回查询结果，它返回的是数据库对象本身
 * （用于链式调用），所以 `表信息.length` 是 undefined、`> 0` 恒为 false，ALTER 被静默跳过，
 * 而且它不抛错、连 catch 里的日志都不会打。实测：`db.exec("SELECT 1") === db` 为 true。
 * 要新增列，请照本函数末尾「概念抗体.是否启用」那段用 prepare + PRAGMA table_info 的写法。
 */
function 执行迁移() {
  if (!数据库实例) return;

  // ---- 词条表迁移 ----
  try {
    const 表信息 = 数据库实例.exec(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='词条'",
    );
    const 表存在 = 表信息.length > 0 && 表信息[0].values.length > 0;
    if (表存在 && !表信息[0].values[0][0].includes("跨学科别名")) {
      数据库实例.exec("ALTER TABLE 词条 ADD COLUMN 跨学科别名 TEXT DEFAULT '[]'");
      console.log("[数据库迁移] 词条.跨学科别名 列已添加");
    }
  } catch (错误) {
    console.log("[数据库迁移] 词条.跨学科别名 已存在或无需迁移", 错误.message);
  }

  // ---- 用户提交表迁移 ----
  try {
    const 表信息 = 数据库实例.exec(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='用户提交'",
    );
    const 表存在 = 表信息.length > 0 && 表信息[0].values.length > 0;
    if (表存在 && !表信息[0].values[0][0].includes("提交类型")) {
      数据库实例.exec("ALTER TABLE 用户提交 ADD COLUMN 提交类型 TEXT DEFAULT 'pair'");
      数据库实例.exec("ALTER TABLE 用户提交 ADD COLUMN 词条名称 TEXT");
      数据库实例.exec("ALTER TABLE 用户提交 ADD COLUMN 词条学科 TEXT");
      数据库实例.exec("ALTER TABLE 用户提交 ADD COLUMN 词条翻译 TEXT");
      数据库实例.exec("ALTER TABLE 用户提交 ADD COLUMN 词条本质 TEXT");
      数据库实例.exec("ALTER TABLE 用户提交 ADD COLUMN 词条提示 TEXT");
      数据库实例.exec("ALTER TABLE 用户提交 ADD COLUMN 词条别名 TEXT DEFAULT '[]'");
      console.log("[数据库迁移] 用户提交 扩展列已添加");
    }
  } catch (错误) {
    console.log("[数据库迁移] 用户提交 扩展列已存在或无需迁移", 错误.message);
  }

  // ---- 概念对比表迁移 ----
  try {
    const 表信息 = 数据库实例.exec(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='概念对比'",
    );
    const 表存在 = 表信息.length > 0 && 表信息[0].values.length > 0;
    if (表存在 && !表信息[0].values[0][0].includes("关系类型")) {
      数据库实例.exec("ALTER TABLE 概念对比 ADD COLUMN 关系类型 TEXT DEFAULT '关联性'");
      console.log("[数据库迁移] 概念对比.关系类型 列已添加");
    }
  } catch (错误) {
    console.log("[数据库迁移] 概念对比.关系类型 已存在或无需迁移", 错误.message);
  }

  // ---- 学科子领域映射表 ----
  try {
    数据库实例.exec(`
      CREATE TABLE IF NOT EXISTS 学科子领域映射 (
        子领域名称 TEXT PRIMARY KEY,
        核心学科 TEXT NOT NULL,
        词条数量 INTEGER DEFAULT 0,
        显示顺序 INTEGER DEFAULT 99,
        描述 TEXT DEFAULT '',
        创建时间 DATETIME DEFAULT CURRENT_TIMESTAMP,
        更新时间 DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[数据库迁移] 学科子领域映射表 已就绪");
  } catch (错误) {
    console.log("[数据库迁移] 学科子领域映射表 创建失败", 错误.message);
  }

  // ---- 词条纠错建议表 ----
  try {
    数据库实例.exec(`
      CREATE TABLE IF NOT EXISTS 词条纠错建议 (
        建议ID INTEGER PRIMARY KEY AUTOINCREMENT,
        词条ID TEXT,
        词条名称 TEXT,
        纠错类型 TEXT DEFAULT '学科归属',
        建议内容 TEXT,
        提交者标识 TEXT DEFAULT '匿名',
        状态 TEXT DEFAULT '待审核',
        审核备注 TEXT,
        审核时间 DATETIME,
        创建时间 DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[数据库迁移] 词条纠错建议表 已就绪");
  } catch (错误) {
    console.log("[数据库迁移] 词条纠错建议表 创建失败", 错误.message);
  }

  // ---- 概念抗体表 ----
  // schema.sql 只在注释里被提到、实际从未被执行，本函数是启动期唯一的建表入口，
  // 所以这张表必须在这里补一句 CREATE IF NOT EXISTS，才能保证全新库有表、老库不缺表。
  // 列定义与 schema.sql 保持逐字一致，避免两条路径建出结构不同的表。
  try {
    数据库实例.exec(`
      CREATE TABLE IF NOT EXISTS 概念抗体 (
        抗体ID          TEXT PRIMARY KEY,
        词条ID     TEXT NOT NULL,
        抗体标题       TEXT NOT NULL,
        抗体描述 TEXT NOT NULL,
        抗体类别    TEXT NOT NULL,
        抗体内容     TEXT NOT NULL,
        创建时间  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (词条ID) REFERENCES 词条(词条ID) ON DELETE CASCADE
      )
    `);
    数据库实例.exec(
      `CREATE INDEX IF NOT EXISTS idx_概念抗体_词条 ON 概念抗体(词条ID)`,
    );
    console.log("[数据库迁移] 概念抗体表 已就绪");
  } catch (错误) {
    console.log("[数据库迁移] 概念抗体表 创建失败", 错误.message);
  }

  // ---- 概念抗体.是否启用 ----
  // 免鉴权的前台接口只吐启用的条目。默认 1 是有意的：antibody.html 与
  // /api/v1/antibody 的既有写入路径都不带这个字段，补列后老数据必须仍然照常上架，
  // 否则上线这一步会把现网已有的概念抗体整批变成不可见。
  //
  // 这里刻意不抄上面几段 sqlite_master 的写法：那种守卫恒为 false（原因见本函数头部注释），
  // 要用 prepare + PRAGMA 才拿得到真实列名。
  try {
    const 列清单 = 数据库实例
      .prepare(`PRAGMA table_info(概念抗体)`)
      .all()
      .map((列) => 列.name);
    if (列清单.length > 0 && !列清单.includes("是否启用")) {
      数据库实例.exec(
        "ALTER TABLE 概念抗体 ADD COLUMN 是否启用 INTEGER DEFAULT 1",
      );
      console.log("[数据库迁移] 概念抗体.是否启用 列已添加");
    }
  } catch (错误) {
    console.log("[数据库迁移] 概念抗体.是否启用 迁移失败", 错误.message);
  }
}

// ==================== 初始化 ====================

/**
 * 初始化数据库连接
 * 1. 确保数据目录存在
 * 2. 打开数据库连接
 * 3. 执行迁移（自动添加缺失列）
 * 4. 注册退出时的清理函数
 */
function 初始化数据库() {
  // 防止重复初始化
  if (是否已初始化 && 数据库实例) return;

  try {
    // 1. 确保目录存在
    确保数据目录存在();

    // 2. 打开数据库（文件不存在会自动创建）
    数据库实例 = new Database(数据库文件路径, { verbose: null });

    // 3. 设置数据库参数
    数据库实例.pragma("journal_mode = WAL");   // WAL模式，读写并发更好
    数据库实例.pragma("foreign_keys = ON");    // 启用外键约束

    console.log("[数据库] 已连接:", 数据库文件路径);

    // 4. 标记已初始化
    是否已初始化 = true;

    // 5. 执行迁移
    执行迁移();

    // 6. 进程退出时关闭连接
    process.on("exit", 关闭数据库);
    process.on("SIGINT", () => { 关闭数据库(); process.exit(0); });
    process.on("SIGTERM", () => { 关闭数据库(); process.exit(0); });

  } catch (错误) {
    console.error("[数据库初始化失败]", 错误);
    throw 错误;
  }
}

/**
 * 关闭数据库连接
 * better-sqlite3 直接操作文件，不需要额外保存
 */
function 关闭数据库() {
  if (数据库实例) {
    try {
      数据库实例.close();
    } catch (_错误) {
      // 关闭失败忽略
    }
    数据库实例 = null;
  }
}

// ==================== 对外查询接口 ====================

/**
 * 预编译 SQL 语句
 * 返回一个包装对象，提供 all/get/run/exec 方法
 *
 * 这是数据库操作的核心函数，所有业务代码都通过这个函数执行 SQL
 *
 * @param {string} sql - SQL 语句（用 ? 占位符传参）
 * @returns {{all: Function, get: Function, run: Function, exec: Function}}
 */
function 预编译(sql) {
  if (!数据库实例) throw new Error("数据库未初始化");

  const 语句 = 数据库实例.prepare(sql);

  return {
    /**
     * 查询多行数据
     * @param  {...any} 参数 - SQL参数
     * @returns {Array} 查询结果数组
     */
    all: function (...参数) {
      const 实际参数 = 参数.length === 1 ? 参数[0] : 参数;
      if (实际参数 !== undefined && 实际参数 !== null) {
        if (!Array.isArray(实际参数)) {
          return 语句.all(实际参数);
        }
        return 语句.all(...实际参数);
      }
      return 语句.all();
    },

    /**
     * 查询单行数据
     * @param  {...any} 参数 - SQL参数
     * @returns {Object|null} 查询结果对象，没有则返回null
     */
    get: function (...参数) {
      const 实际参数 = 参数.length === 1 ? 参数[0] : 参数;
      if (实际参数 !== undefined && 实际参数 !== null) {
        if (!Array.isArray(实际参数)) {
          return 语句.get(实际参数);
        }
        return 语句.get(...实际参数);
      }
      return 语句.get();
    },

    /**
     * 执行写入操作（INSERT/UPDATE/DELETE）
     * 执行后自动清空缓存
     * @param  {...any} 参数 - SQL参数
     * @returns {{changes: number, lastInsertRowid: number}}
     */
    run: function (...参数) {
      const 实际参数 = 参数.length === 1 ? 参数[0] : 参数;
      let 结果;
      if (实际参数 !== undefined && 实际参数 !== null) {
        if (!Array.isArray(实际参数)) {
          结果 = 语句.run(实际参数);
        } else {
          结果 = 语句.run(...实际参数);
        }
      } else {
        结果 = 语句.run();
      }
      // 写入操作后清空缓存，确保下次读取最新数据
      标记已修改();
      return {
        changes: 结果.changes,
        lastInsertRowid: 结果.lastInsertRowid,
      };
    },

    /**
     * 执行 SQL 语句（用于 DDL 等无返回值的操作）
     */
    exec: function () {
      return 语句.exec();
    },
  };
}

/**
 * 直接执行 SQL 语句（不预编译，用于多条 SQL 或 DDL）
 * @param {string} sql - SQL 语句
 */
function 执行SQL(sql) {
  if (!数据库实例) throw new Error("数据库未初始化");
  return 数据库实例.exec(sql);
}

/**
 * 标记数据库已被修改
 * 触发缓存清空，确保下次读取拿到最新数据
 */
function 标记已修改() {
  清空所有缓存();
}

// ==================== 模块导出 ====================

module.exports = {
  /** 初始化数据库（服务启动时调用一次） */
  initDB: 初始化数据库,

  /**
   * 保存数据库（兼容旧代码，better-sqlite3 写入即保存，此函数为空实现）
   * 保留这个函数是为了不破坏现有调用
   */
  saveDB: () => {
    // better-sqlite3 直接操作文件，写入即保存，无需手动调用
  },

  /**
   * 重新加载数据库（从磁盘重新读取）
   * 用于外部修改了数据库文件后，让后端重新加载
   */
  reloadDB: () => {
    关闭数据库();
    数据库实例 = new Database(数据库文件路径, { verbose: null });
    数据库实例.pragma("journal_mode = WAL");
    数据库实例.pragma("foreign_keys = ON");
    清空所有缓存();
    console.log("[数据库] 已从磁盘重新加载");
  },

  /** 获取原始数据库实例（高级用法，谨慎使用） */
  getDb: () => 数据库实例,

  /** 预编译 SQL（主要查询接口） */
  prepare: 预编译,

  /** 直接执行 SQL */
  exec: 执行SQL,

  /** 标记已修改（手动触发缓存清空） */
  markDirty: 标记已修改,

  /** 数据库文件路径 */
  DB_PATH: 数据库文件路径,

  /** 关闭数据库 */
  closeDb: 关闭数据库,
};
