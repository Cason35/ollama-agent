import { DEFAULT_CONFIG_ITEMS } from "@/lib/config/config-defaults"; // 第62天：引入默认配置项列表。
import { ConfigManager } from "@/lib/config/config-manager"; // 第62天：引入配置管理器类。
import { EnvConfigProvider } from "@/lib/config/env-config-provider"; // 第62天：引入环境变量配置 Provider。
import { MemoryConfigProvider } from "@/lib/config/memory-config-provider"; // 第62天：引入内存配置 Provider，用于默认值和数据库模拟。
const globalForConfig = globalThis as typeof globalThis & { __day62ConfigManager?: ConfigManager }; // 第62天：扩展 globalThis，避免 Next.js 热重载时重复创建配置中心。
function createConfigManager(): ConfigManager { // 第62天：定义创建配置中心单例的工厂函数。
  const defaultProvider = new MemoryConfigProvider("default", DEFAULT_CONFIG_ITEMS); // 第62天：创建默认配置 Provider。
  const envProvider = new EnvConfigProvider(); // 第62天：创建环境变量配置 Provider。
  const databaseProvider = new MemoryConfigProvider("database"); // 第62天：用内存 Provider 模拟数据库配置覆盖层。
  return new ConfigManager([defaultProvider, envProvider, databaseProvider], databaseProvider); // 第62天：按 Default -> Env -> Database 优先级创建管理器。
} // 第62天：结束配置中心工厂函数。
export function getConfigManager(): ConfigManager { // 第62天：定义读取配置中心单例的方法。
  if (!globalForConfig.__day62ConfigManager) globalForConfig.__day62ConfigManager = createConfigManager(); // 第62天：首次访问时创建配置中心。
  return globalForConfig.__day62ConfigManager; // 第62天：返回共享配置中心实例。
} // 第62天：结束 getConfigManager 方法。
export const configManager = getConfigManager(); // 第62天：导出共享配置中心，供 Runtime、API 和测试脚本复用。
