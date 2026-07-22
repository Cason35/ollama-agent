/**
 * 第21天：MySQL 连接池（仅服务端 import，不可在客户端使用）。
 * 每行带中文行尾注释。
 */

import mysql from "mysql2/promise"; // mysql2 的 Promise 版驱动
import { configManager } from "@/lib/config/config-runtime"; // 第62天：引入配置中心，统一读取 MySQL 非敏感连接配置。
import { secretsManager } from "@/lib/secrets/secrets-runtime"; // 第63天：引入密钥管理器，统一读取 MySQL 密码。

/** 全局连接池，供 MySQLWorkflowStore 复用。 */
export const pool = mysql.createPool({
  host: configManager.getString("database.mysqlHost", process.env.MYSQL_HOST ?? ""), // 第62天：主机优先来自配置中心，空值时兼容旧环境变量。
  port: configManager.getNumber("database.mysqlPort", Number(process.env.MYSQL_PORT || 3306)), // 第62天：端口优先来自配置中心，默认 3306。
  user: process.env.MYSQL_USER, // 用户名
  password: secretsManager.getSync("MYSQL_PASSWORD"), // 第63天：密码来自 SecretsManager，不再由运行时直接读取敏感环境变量。
  database: configManager.getString("database.mysqlDatabase", process.env.MYSQL_DATABASE ?? "agent_runtime"), // 第62天：数据库名优先来自配置中心。
  waitForConnections: true, // 连接耗尽时等待而非立刻报错
  connectionLimit: 10, // 最大连接数
}); // createPool 结束
