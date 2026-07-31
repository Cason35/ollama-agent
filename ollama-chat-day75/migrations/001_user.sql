-- 第74天：创建生产用户表并保持幂等执行。
CREATE TABLE IF NOT EXISTS users ( -- 第74天：保存平台用户身份。
  id VARCHAR(64) PRIMARY KEY, -- 第74天：保存用户唯一标识。
  email VARCHAR(255) NULL UNIQUE, -- 第74天：保存可选唯一邮箱。
  name VARCHAR(128) NOT NULL, -- 第74天：保存用户展示名称。
  status ENUM('active','disabled') NOT NULL DEFAULT 'active', -- 第74天：保存用户启用状态。
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 第74天：保存用户创建时间。
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP -- 第74天：保存用户更新时间。
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; -- 第74天：使用支持事务和中文的存储配置。
