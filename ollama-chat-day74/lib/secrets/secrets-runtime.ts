import { EnvSecretProvider } from "@/lib/secrets/env-secret-provider"; // 第63天：引入环境变量密钥 Provider。
import { MemorySecretProvider } from "@/lib/secrets/memory-secret-provider"; // 第63天：引入内存密钥 Provider。
import { SecretsManager } from "@/lib/secrets/secrets-manager"; // 第63天：引入统一密钥管理器。

const globalForSecrets = globalThis as typeof globalThis & { __day63SecretsManager?: SecretsManager; __day63MemorySecretProvider?: MemorySecretProvider }; // 第63天：扩展 globalThis，避免 Next.js 热重载重复创建密钥管理器。

function createSecretsManager(): SecretsManager { // 第63天：定义创建密钥管理器单例的工厂函数。
  const envProvider = new EnvSecretProvider(); // 第63天：创建只读环境变量密钥 Provider。
  const memoryProvider = new MemorySecretProvider(); // 第63天：创建可写内存密钥 Provider。
  globalForSecrets.__day63MemorySecretProvider = memoryProvider; // 第63天：保存内存 Provider，供测试验证加密值。
  return new SecretsManager([envProvider, memoryProvider], memoryProvider); // 第63天：按 env -> memory 优先级创建密钥管理器。
} // 第63天：结束 createSecretsManager 函数。

export function getSecretsManager(): SecretsManager { // 第63天：定义读取密钥管理器单例的方法。
  if (!globalForSecrets.__day63SecretsManager) globalForSecrets.__day63SecretsManager = createSecretsManager(); // 第63天：首次访问时创建单例。
  return globalForSecrets.__day63SecretsManager; // 第63天：返回共享密钥管理器。
} // 第63天：结束 getSecretsManager 方法。

export function getMemorySecretProvider(): MemorySecretProvider { // 第63天：定义读取内存 Provider 的方法，主要用于测试验证密文。
  getSecretsManager(); // 第63天：确保单例和内存 Provider 已经创建。
  return globalForSecrets.__day63MemorySecretProvider as MemorySecretProvider; // 第63天：返回共享内存 Provider。
} // 第63天：结束 getMemorySecretProvider 方法。

export const secretsManager = getSecretsManager(); // 第63天：导出共享 SecretsManager，供 Runtime、API 和测试脚本复用。
