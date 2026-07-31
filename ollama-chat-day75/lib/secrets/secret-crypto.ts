import crypto from "crypto"; // 第63天：引入 Node.js crypto 模块，用于 AES-256-GCM 加密和解密。

const ENCRYPTION_PREFIX = "day63:v1"; // 第63天：定义密文版本前缀，便于后续升级加密格式。
const IV_LENGTH = 12; // 第63天：定义 GCM 推荐的 12 字节随机初始化向量长度。
const AUTH_TAG_LENGTH = 16; // 第63天：定义 GCM 认证标签长度，用于校验密文未被篡改。

function getMasterSecret(): string { // 第63天：定义读取主密钥明文的函数。
  return process.env.SECRETS_MASTER_KEY || process.env.SECRET_ENCRYPTION_KEY || "day63-local-development-master-key"; // 第63天：优先使用环境主密钥，开发环境兜底使用固定教学密钥。
} // 第63天：结束 getMasterSecret 函数。

function getEncryptionKey(): Buffer { // 第63天：定义派生 256 位 AES 密钥的函数。
  return crypto.createHash("sha256").update(getMasterSecret()).digest(); // 第63天：用 SHA-256 把主密钥规范为 32 字节密钥。
} // 第63天：结束 getEncryptionKey 函数。

export function encryptSecretValue(plainText: string): string { // 第63天：定义密钥值加密函数。
  const iv = crypto.randomBytes(IV_LENGTH); // 第63天：为每次加密生成独立随机 IV，避免相同明文产生相同密文。
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv, { authTagLength: AUTH_TAG_LENGTH }); // 第63天：创建 AES-256-GCM 加密器。
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]); // 第63天：执行加密并合并密文块。
  const tag = cipher.getAuthTag(); // 第63天：读取 GCM 认证标签。
  return [ENCRYPTION_PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join("."); // 第63天：返回带版本、IV、认证标签和密文的安全字符串。
} // 第63天：结束 encryptSecretValue 函数。

export function decryptSecretValue(cipherText: string): string { // 第63天：定义密钥值解密函数。
  if (!isEncryptedSecretValue(cipherText)) return cipherText; // 第63天：兼容未加密输入，便于环境变量 Provider 直接返回明文。
  const [, ivText, tagText, encryptedText] = cipherText.split("."); // 第63天：拆分密文字符串中的 IV、认证标签和密文。
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivText, "base64url"), { authTagLength: AUTH_TAG_LENGTH }); // 第63天：创建 AES-256-GCM 解密器。
  decipher.setAuthTag(Buffer.from(tagText, "base64url")); // 第63天：设置认证标签，确保密文被篡改时会解密失败。
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]); // 第63天：执行解密并合并明文块。
  return decrypted.toString("utf8"); // 第63天：把明文 Buffer 转回字符串。
} // 第63天：结束 decryptSecretValue 函数。

export function isEncryptedSecretValue(value: string): boolean { // 第63天：定义判断字符串是否为本系统密文的函数。
  return value.startsWith(`${ENCRYPTION_PREFIX}.`); // 第63天：通过版本前缀快速识别加密值。
} // 第63天：结束 isEncryptedSecretValue 函数。
