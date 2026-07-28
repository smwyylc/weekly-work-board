// 跳过代码签名：无证书环境下使用
// electron-builder 会调用此函数，返回 false 表示不签名
exports.default = async function sign() {
  return false;
};
