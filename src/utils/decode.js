import { Script } from '@bsv/sdk';

// 辅助验证函数
function validateBProtocol(opReturnData) {
  try {
    const parsed = parseBProtocol(opReturnData);
    return !!(parsed.address && parsed.mimeType && parsed.encoding);
  } catch {
    return false;
  }
}

function hexToUtf8(hex) {
  // 先将十六进制字符串转换为字节数组
  const bytes = new Uint8Array(hex.match(/.{2}/g).map(byte => parseInt(byte, 16)));

  // 使用 TextDecoder 将字节数组转换为 UTF-8 字符串
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes);
}

/**
 * 解析 OP_RETURN 的 hex 字符串
 * @param {string} hexString - OP_RETURN 的 hex 字符串
 * @returns {object|null} 解析后的数据
 */
const B_PROTOCOL_PREFIX = '19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut';

function parseBProtocol(hex) {
  let script = Script.fromHex(hex);
  let asm = script.toASM();
  let arr = asm.split(' ');
  let parts = arr.slice(2).map(i => hexToUtf8(i));
  if (!parts[0].startsWith(B_PROTOCOL_PREFIX)) {
    console.log('input: ', parts);
    throw new Error('地址前缀不匹配 B 协议');
  }
  return {
    parts,
    content: parts[1], // 重新组合完整地址
    mimeType: parts[2], // MIME 类型
    encoding: parts[3], // 编码方式
  };
  // debugger;
}

// const hex =
//   '006a2231394878696756345179427633744870515663554551797131707a5a56646f417574034273760d746578742f6d61726b646f776e055554462d38';
// const asm = parseBProtocol(hex);
// console.log('asm', asm);

export { parseBProtocol };
