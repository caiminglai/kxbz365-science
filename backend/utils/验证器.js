/**
 * 参数校验工具
 * 统一处理输入验证，确保数据类型安全
 */

/**
 * 验证字符串参数
 * @param {any} value 值
 * @param {string} name 参数名
 * @param {object} options 选项
 * @returns {string}
 */
function validateString(value, name, options = {}) {
  const { required = false, maxLength = 1000, minLength = 0 } = options;

  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`MISSING_PARAM:${name}`);
    }
    return "";
  }

  const str = String(value);

  if (str.length < minLength) {
    throw new Error(`INVALID_PARAM:${name} (最小${minLength}字符)`);
  }

  if (str.length > maxLength) {
    throw new Error(`INVALID_PARAM:${name} (最大${maxLength}字符)`);
  }

  return str;
}

/**
 * 验证枚举值
 * @param {any} value 值
 * @param {string} name 参数名
 * @param {array} allowed 允许的值
 * @returns {any}
 */
function validateEnum(value, name, allowed) {
  if (value === undefined || value === null) {
    return allowed[0]; // 返回默认值
  }

  if (!allowed.includes(value)) {
    throw new Error(`INVALID_PARAM:${name} (必须是: ${allowed.join("|")})`);
  }

  return value;
}

module.exports = {
  validateString,
  validateEnum,
};
