const MASK = "************"; // 第63天：定义统一脱敏输出，避免泄露密钥长度。
const SECRET_KEY_PATTERN = /(api[_-]?key|password|passwd|secret|token|authorization|access[_-]?key|secret[_-]?key)/i; // 第63天：定义需要按字段名脱敏的敏感关键字。
const SECRET_VALUE_PATTERN = /(sk-[a-zA-Z0-9_-]{8,}|Bearer\s+[a-zA-Z0-9._-]{8,}|[a-zA-Z0-9_-]{24,}\.[a-zA-Z0-9._-]{8,})/g; // 第63天：定义常见密钥值形态的兜底匹配规则。

export function maskSecretText(value: string): string { // 第63天：定义字符串级脱敏函数。
  return value.replace(SECRET_VALUE_PATTERN, MASK); // 第63天：把疑似密钥片段替换为固定掩码。
} // 第63天：结束 maskSecretText 函数。

export function maskSecretObject<T>(value: T): T { // 第63天：定义对象级脱敏函数。
  return maskUnknown(value) as T; // 第63天：委托递归函数处理任意结构并保持原类型。
} // 第63天：结束 maskSecretObject 函数。

function maskUnknown(value: unknown, parentKey = ""): unknown { // 第63天：定义递归脱敏任意值的函数。
  if (typeof value === "string") return SECRET_KEY_PATTERN.test(parentKey) ? MASK : maskSecretText(value); // 第63天：敏感字段名直接掩码，普通字符串做模式脱敏。
  if (Array.isArray(value)) return value.map((item) => maskUnknown(item, parentKey)); // 第63天：数组逐项递归脱敏。
  if (!value || typeof value !== "object") return value; // 第63天：空值和基础类型直接返回。
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SECRET_KEY_PATTERN.test(key) ? MASK : maskUnknown(item, key)])); // 第63天：对象按 key 判断并递归脱敏。
} // 第63天：结束 maskUnknown 函数。
