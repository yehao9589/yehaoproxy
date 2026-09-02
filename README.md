# YehaoProxy

<p align="center">
  <strong>面向代理 IP 与节点服务销售的一体化运营管理平台</strong>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-v1.0.0-2563eb">
  <img alt="Node" src="https://img.shields.io/badge/Node.js-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white">
  <img alt="MySQL" src="https://img.shields.io/badge/MySQL-5.7%20%7C%208.x-4479a1?logo=mysql&logoColor=white">
</p>

<p align="center">
  <strong>中文</strong> · <a href="./README.en.md">English</a>
</p>

YehaoProxy 将商城、客户、订单、账单、支付、资源交付、续费、售后、信用账单、通知、审计和运维集中到一个系统中，适合代理 IP、电脑节点、软路由中转及其他周期型网络服务的销售与运营。

## 功能概览

| 模块 | 能力 |
| --- | --- |
| 商品与销售 | 商品类型、地区价格、固定天数/自然月周期、库存、优惠券、批量下单 |
| 客户中心 | 订单、代理资产、节点订阅、售后申请、余额、信用账单、流水、通知、工单 |
| 业务运营 | 产品订单、续费核验、服务管理、人工交付、IP 更换、流量重置 |
| 财务支付 | 账单、交易流水、余额/信用额支付、支付宝支付、原路退款或退至余额 |
| 自动化 | 到期提醒、库存预警、客户与管理员邮件、定时任务、自动续费 |
| 管理与审计 | 角色权限、模拟客户登录、完整操作日志、真实来源 IP、备份与恢复 |
| 外部集成 | X-Panel 节点管理、流量同步、订阅链接与二维码 |

## 推荐部署架构

宝塔环境推荐使用“宝塔 MySQL + 单个 YehaoProxy Docker 容器”：

```text
Internet → Nginx / HTTPS → YehaoProxy :3000 → 宝塔 MySQL :3306
```

- 使用 [`docker-compose.single.yml`](./docker-compose.single.yml)。
- 宝塔 MySQL 权限保持 `Localhost`，不要向公网开放 `3306`。
- 首次安装从 `/install` 完成，数据库主机填写 `127.0.0.1`。
- 内部服务密钥和资产加密密钥首次启动时自动生成并持久化，无需手工配置。
- `data`、`uploads` 和 `backups` 均挂载到宿主机，重建容器不会清空业务数据。

完整步骤请阅读 [部署指南](./DEPLOYMENT.md)。正式上线前请逐项完成 [v1.0.0 发布核对清单](./RELEASE_CHECKLIST.md)。

## 快速部署

在宝塔“Docker → 容器编排”中使用 [`docker-compose.single.yml`](./docker-compose.single.yml)，`.env` 最少填写：

```dotenv
YEHAOPROXY_IMAGE=ghcr.io/yehao9589/yehaoproxy:v1.0.0
PUBLIC_APP_URL=https://你的域名
APP_VERSION=v1.0.0
CRON_INTERVAL_MS=60000
```

启动后访问：

```text
https://你的域名/install
```

安装向导会测试数据库连接、初始化数据表、配置站点并创建首个超级管理员。

## 本地开发

```bash
pnpm install --frozen-lockfile
pnpm dev
```

提交前运行完整质量门禁：

```bash
pnpm run check
```

该命令依次执行 ESLint、TypeScript 类型检查、生产构建和关键业务回归测试。

## 运行要求

- Node.js `>= 22.13.0`
- pnpm `11.x`
- Docker 与 Docker Compose
- MySQL `5.7` 或 `8.x`，生产环境推荐 MySQL 8

## 目录结构

```text
app/                         页面、组件与 API 路由
db/                          Drizzle 数据结构与数据库适配
lib/                         认证、支付、账单、通知等业务能力
scripts/                     单容器启动器、桥接、迁移、定时任务与备份
public/                      静态资源、上传目录与版本清单
docker-compose.single.yml    宝塔推荐单容器编排
DEPLOYMENT.md                完整部署与运维说明
RELEASE_CHECKLIST.md         正式发布前验收清单
```

## 数据、安全与升级

- 更新前同时备份宝塔 MySQL 与三个持久化目录。
- 生产环境使用固定版本镜像，不使用移动的 `latest` 或 `pre-release` 标签。
- 配置正式域名和 HTTPS 后再启用支付回调与邮件链接。
- 支付、退款、备份恢复和外部供应商接口必须先在预发布环境完成真实演练。
- 备份文件包含数据库和敏感配置，应加密保存并定期复制到异地。

## 许可证

当前仓库为私有项目。未经项目所有者授权，不得复制、分发或用于商业部署。
