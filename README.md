# YehaoProxy

<p align="center">
  <strong>中文</strong> · <a href="./README.en.md">English</a>
</p>

YehaoProxy 是一个面向代理 IP 与节点服务销售场景的全栈业务管理系统，包含商品销售、客户中心、订单与账单、人工交付、续费、售后、财务、通知、审计、VPS/X-Panel 对接、在线更新和灾难恢复等功能。

> 当前项目仍处于持续开发阶段。正式部署前请先在测试环境完成支付、交付、续费、退款、备份恢复等完整流程验证。

## 主要功能

- 商品管理：代理 IP、电脑节点、软路由中转及自定义商品类型
- 客户中心：订单、账单、服务、余额、工单和售后申请
- 业务管理：产品订单、续费订单、服务管理和人工交付
- 财务运营：交易流水、收款账单、余额充值和优惠券
- 服务能力：自动续费、IP 更换、流量重置、订阅链接和二维码
- 运维能力：定时任务、邮件/短信通知、审计日志和管理员权限
- VPS 集成：对接 X-Panel，同步流量并查看入站节点
- 数据库：支持 MySQL 8 与 SQLite/D1，两种模式均可部署
- 更新与备份：更新前备份、失败回滚、手动备份、下载、导入与恢复

## 运行要求

- Node.js `>= 22.13.0`
- pnpm `11.x`
- 推荐使用 Docker 与 Docker Compose
- MySQL 部署推荐 MySQL `8.4`

## Docker 部署

宝塔面板已经创建 MySQL 数据库时，可直接使用 `docker-compose.bt.yml`，无需再启动 MySQL 容器：

```bash
cp .env.bt.example .env
docker compose -f docker-compose.bt.yml up -d
```

宝塔专用编排通过宿主机网络访问本地 MySQL，无需修改数据库的 `Localhost` 权限，也不要在服务器防火墙中将 `3306` 端口开放给公网。

首次启动时 `DATABASE_URL` 可以留空。打开 `/install`，在安装向导中填写 `127.0.0.1`、宝塔数据库名称、用户名和密码；连接测试与初始化成功后，系统会将连接配置保存到服务器 `.env` 并自动重启相关服务。

### 1. 获取代码

```bash
git clone https://github.com/yehao9589/yehaoproxy.git
cd yehaoproxy
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

正式部署前至少应修改以下值：

- `INVENTORY_ENCRYPTION_KEY`
- `MYSQL_ROOT_PASSWORD`
- `MYSQL_PASSWORD`
- `MYSQL_BRIDGE_SECRET`
- Docker Compose 中的任务、更新和 X-Panel 桥接密钥

请使用足够长的随机字符串，不要把真实密钥提交到 Git 仓库。

### 3. 启动服务

使用 MySQL（推荐）：

```bash
docker compose --profile mysql --profile system-update up -d --build
```

使用 SQLite：

```bash
docker compose --profile system-update up -d --build
```

### 4. 首次安装

浏览器访问：

```text
http://服务器地址:3000/install
```

安装向导可选择数据库、检测 MySQL 连接、初始化数据表、设置站点名称并创建首个超级管理员。

安装完成后访问：

- 前台：`http://服务器地址:3000/`
- 客户中心：`http://服务器地址:3000/dashboard`
- 管理后台：`http://服务器地址:3000/admin`

## 本地开发

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm build       # 生产构建检查
pnpm test        # 运行项目测试
pnpm lint        # 代码检查
pnpm db:generate # 生成 Drizzle 数据库迁移
```

## 数据库说明

- MySQL：推荐用于正式部署和多容器环境。
- SQLite/D1：适合轻量部署、开发测试或 Cloudflare 环境。
- 两种数据库使用统一业务接口，但切换数据库前必须先完成迁移与备份。
- 不要直接复制 SQLite 文件覆盖 MySQL；请使用安装向导、迁移脚本或备份恢复流程。

## 备份与恢复

进入管理后台的 `系统管理 → 更新与备份`：

- 创建完整系统备份
- 下载 `.tar.gz` 备份文件
- 导入已有备份
- 从恢复点还原数据库、上传文件与关键配置
- 更新前自动建立备份，更新失败时自动回滚

备份文件包含数据库和敏感配置，请存放在受保护的位置，并定期复制到异地或对象存储。

## 目录结构

```text
app/                 页面、组件和 API 路由
db/                  Drizzle 数据结构与数据库适配
drizzle/             数据库迁移文件
lib/                 业务服务与通用能力
scripts/             定时任务、MySQL/X-Panel 桥接和更新执行器
public/uploads/      站点上传文件
docker-compose.yml   Docker 服务编排
```

## 安全建议

- 生产环境必须更换示例密码和默认密钥。
- 仅向可信管理员开放更新、恢复、财务和权限管理功能。
- 配置 HTTPS、反向代理、防火墙及数据库访问白名单。
- 定期下载备份并实际演练恢复流程。
- 上线支付功能前验证回调签名、幂等处理和退款链路。

## 许可证

当前仓库为私有项目。未经项目所有者授权，不得复制、分发或用于商业部署。
