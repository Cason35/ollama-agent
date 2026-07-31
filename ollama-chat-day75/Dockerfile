# 第74天：使用 Node.js 22 Alpine 作为依赖安装阶段基础镜像。
FROM node:22-alpine AS deps
# 第74天：设置容器工作目录。
WORKDIR /app
# 第74天：复制依赖清单与锁文件以利用 Docker 缓存。
COPY package.json package-lock.json ./
# 第74天：按锁文件安装完整依赖，保证构建可复现。
RUN npm ci

# 第74天：使用依赖阶段作为 Next.js 构建阶段。
FROM node:22-alpine AS builder
# 第74天：设置构建工作目录。
WORKDIR /app
# 第74天：复制已经安装的依赖目录。
COPY --from=deps /app/node_modules ./node_modules
# 第74天：复制项目全部源代码。
COPY . .
# 第74天：关闭 Next.js 匿名遥测。
ENV NEXT_TELEMETRY_DISABLED=1
# 第74天：执行 Next.js 生产构建并生成 standalone 输出。
RUN npm run build

# 第74天：创建最小生产运行镜像。
FROM node:22-alpine AS runner
# 第74天：设置生产运行目录。
WORKDIR /app
# 第74天：声明 Node.js 生产模式。
ENV NODE_ENV=production
# 第74天：关闭 Next.js 匿名遥测。
ENV NEXT_TELEMETRY_DISABLED=1
# 第74天：声明 Next.js 服务监听全部网卡。
ENV HOSTNAME=0.0.0.0
# 第74天：声明 Next.js 默认监听端口。
ENV PORT=3000
# 第74天：创建无特权系统组。
RUN addgroup --system --gid 1001 nodejs
# 第74天：创建无特权系统用户。
RUN adduser --system --uid 1001 nextjs
# 第74天：复制 public 静态资源目录。
COPY --from=builder /app/public ./public
# 第74天：复制 standalone 生产服务器文件并设置所有者。
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# 第74天：复制 Next.js 静态构建资源并设置所有者。
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# 第74天：复制数据库迁移文件供发布和诊断使用。
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
# 第74天：切换到无特权用户运行服务。
USER nextjs
# 第74天：声明应用对外服务端口。
EXPOSE 3000
# 第74天：配置容器级存活检查。
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/live || exit 1
# 第74天：启动 standalone Next.js 生产服务器。
CMD ["node", "server.js"]
