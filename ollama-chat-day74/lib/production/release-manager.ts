import type { EnvironmentConfig, PlatformRelease } from "@/lib/production/types"; // 第74天：引入环境配置与平台发布版本类型。

const RELEASE_CREATED_AT = Date.UTC(2026, 6, 21, 0, 0, 0); // 第74天：定义 Day74 发布候选版本的稳定教学时间。

export function createPlatformRelease(config: EnvironmentConfig): PlatformRelease { // 第74天：从生产配置生成统一平台发布版本。
  return { // 第74天：返回发布版本快照。
    version: config.release.version, // 第74天：写入平台语义版本。
    gitCommit: config.release.gitCommit, // 第74天：写入 Git 提交标识。
    databaseVersion: config.release.databaseVersion, // 第74天：写入数据库结构版本。
    deploymentId: config.release.deploymentId, // 第74天：写入滚动发布部署标识。
    createdAt: RELEASE_CREATED_AT, // 第74天：写入发布候选版本创建时间。
    changelog: ["完成 Docker standalone 容器化与 Compose 全环境编排。", "新增 MySQL Migration、健康检查、启动校验和备份恢复脚本。", "新增 Release Version、Feature Flag、Production Dashboard 与 CI 流水线。"], // 第74天：记录 Day74 三类核心发布变更。
  }; // 第74天：结束发布版本返回对象。
} // 第74天：结束平台发布版本生成函数。
