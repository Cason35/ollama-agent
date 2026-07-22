import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // 第74天：生成最小 standalone 生产运行目录，供多阶段 Docker 镜像复制。
  poweredByHeader: false, // 第74天：隐藏默认 X-Powered-By 响应头，减少不必要的技术栈暴露。
  compress: true, // 第74天：启用生产响应压缩，降低页面与接口传输体积。
  deploymentId: process.env.DEPLOYMENT_VERSION, // 第74天：注入发布版本标识，降低滚动发布期间的版本错配风险。
};

export default nextConfig;
