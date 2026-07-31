-- 第74天：创建生产租户表并保持幂等执行。
CREATE TABLE IF NOT EXISTS tenants ( -- 第74天：保存 SaaS 租户组织。
  id VARCHAR(64) PRIMARY KEY, -- 第74天：保存租户唯一标识。
  name VARCHAR(128) NOT NULL, -- 第74天：保存租户名称。
  plan ENUM('free','pro','enterprise') NOT NULL DEFAULT 'free', -- 第74天：保存租户套餐。
  status ENUM('active','suspended') NOT NULL DEFAULT 'active', -- 第74天：保存租户状态。
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 第74天：保存租户创建时间。
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP -- 第74天：保存租户更新时间。
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; -- 第74天：使用支持事务和中文的存储配置。
