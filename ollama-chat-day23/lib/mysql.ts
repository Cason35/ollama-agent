/**
 * 第21天：MySQL 连接池（仅服务端 import，不可在客户端使用）。
 * 每行带中文行尾注释。
 */

import mysql from "mysql2/promise"; // mysql2 的 Promise 版驱动

/** 全局连接池，供 MySQLWorkflowStore 复用。 */
export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST, // 主机，来自 .env.local
  port: Number(process.env.MYSQL_PORT || 3306), // 端口，默认 3306
  user: process.env.MYSQL_USER, // 用户名
  password: process.env.MYSQL_PASSWORD, // 密码
  database: process.env.MYSQL_DATABASE, // 数据库名 agent_runtime
  waitForConnections: true, // 连接耗尽时等待而非立刻报错
  connectionLimit: 10, // 最大连接数
}); // createPool 结束
