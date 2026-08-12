# YehaoProxy 生产部署指南

## 推荐方案

正式环境推荐使用 `docker-compose.production.yml`：应用、MySQL、数据库桥接、定时任务、X-Panel 桥接和更新/备份服务会作为一套服务启动。SQLite 仍可用于本地开发或小型单机部署，但上线前必须在与正式环境相同的数据库驱动上完成一次全流程验收。

## 1. 环境要求

- Linux 服务器、Docker Engine 和 Docker Compose v2
- 已解析到服务器的 HTTPS 域名
- 可拉取私有镜像的容器仓库凭据
- Node.js 22.13 或更高版本（仅源码构建时需要）

## 2. 生产密钥

复制 `.env.example` 为 `.env`，至少设置以下项目：

- `YEHAOPROXY_IMAGE`：应用镜像。预发布测试使用 `ghcr.io/yehao9589/yehaoproxy:pre-release`，正式环境使用明确的 `v1.0.0` 等版本标签。
- `YEHAOPROXY_UPDATER_IMAGE`：更新器镜像。预发布测试使用 `ghcr.io/yehao9589/yehaoproxy-updater:pre-release`。
- `MYSQL_ROOT_PASSWORD`、`MYSQL_PASSWORD`：数据库独立强密码。
- `MYSQL_BRIDGE_SECRET`：数据库桥接服务认证密钥，至少 32 位随机字符。
- `INVENTORY_ENCRYPTION_KEY`：库存凭据加密密钥，至少 32 位；已有数据后不能随意更换。
- `INSTALL_TOKEN`：首次安装页的部署密钥，至少 32 位。
- `CRON_SECRET`：定时任务调用密钥。
- `XPANEL_BRIDGE_SECRET`：X-Panel 桥接密钥。
- `UPDATE_WEBHOOK_TOKEN`：在线更新与备份服务密钥。
- `PUBLIC_APP_URL`：正式 HTTPS 地址。

任何 `.env`、`.env.local`、`.backup.env` 文件都不能提交到 Git。备份包只包含数据库和上传目录，不包含这些密钥；服务器重建时要从独立的密码管理器恢复环境变量。

## 3. 首次启动

```bash
docker login ghcr.io
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

打开 `https://你的域名/install`，输入 `INSTALL_TOKEN`，选择 MySQL，测试连接后创建数据库和超级管理员。安装成功后入口会自动锁定，不能再次初始化。

然后检查：

```bash
curl -fsS https://你的域名/api/health
docker compose -f docker-compose.production.yml ps
```

`/api/health` 必须返回 HTTP 200，并且 `database`、`encryptionConfigured` 均为 `true`。

## 4. SQLite 模式

应用代码同时保留 `DATABASE_DRIVER=sqlite`。SQLite 适合本地开发、演示和低并发单机部署；必须持久化 `.wrangler/state`，否则重建容器会丢失数据。MySQL 更适合正式业务并发、事务和长期运维。

SQLite 容器部署使用独立编排文件，不需要启动 MySQL：

```bash
docker compose -f docker-compose.sqlite.yml pull
docker compose -f docker-compose.sqlite.yml up -d
```

首次打开安装页时选择 SQLite。后续在线更新、健康检查和备份恢复会沿用 `docker-compose.sqlite.yml`，不会误启动 MySQL 服务。

两个驱动的 SQL 行为并不完全相同。任何数据库结构或订单/钱包逻辑改动，都要分别完成类型检查，并至少在正式采用的驱动上执行真实集成测试。

## 5. 更新、备份与回滚

- 后台“更新与备份”可以创建、下载、导入和恢复数据备份。
- 在线更新只接受带明确版本标签的镜像。
- 更新前会自动备份数据库和上传文件；新版本健康检查失败时自动恢复上一个镜像和数据。
- 导入备份会校验压缩包路径并拒绝符号链接、目录穿越和非白名单文件。
- 至少每天把备份复制到服务器之外，并定期在隔离环境演练恢复。

仓库内的 `.github/workflows/publish-images.yml` 会在测试分支、主分支和版本标签推送时自动发布 GHCR 镜像。首次发布后如果镜像包仍显示 Private，需要在 GitHub 仓库的 Packages 页面进入两个镜像的 Package settings，将可见性改成 Public；源码仓库公开并不一定会自动改变既有镜像包的可见性。

## 6. 当前功能边界

- 余额支付可以使用。
- Stripe、支付宝、微信、USDT、PayPal 等真实外部支付适配器和回调验签尚未接入，因此后台会拒绝启用这些渠道，避免生成伪成功交易。
- 邮件正式发送当前仅开放已配置密钥的 Resend；短信和供应商自动采购在真实适配器接入前不能启用。
- 上线前必须选定实际支付渠道，并完成下单、异步回调、重复回调、退款和对账的沙箱测试。

## 7. 上线验收清单

1. 注册、登录、退出、会话过期跳转和管理员权限正常。
2. 首次安装完成后 `/install` 不可再次修改系统。
3. 商品价格由服务端计算，购物车参数不能篡改金额。
4. 钱包付款、优惠券、重复点击、余额不足、订单关闭均按预期处理。
5. 代理 IP 和节点分别完成购买、人工交付、续费、拒绝、退款和到期测试。
6. 工单、售后、通知、定时任务和审计日志能够追溯具体操作者、对象和结果。
7. 手动创建备份并在隔离环境恢复成功。
8. 使用一个测试版本执行在线更新，并验证失败时自动回滚。
9. 运行 `pnpm run build`、`pnpm test` 和 `pnpm audit --prod`。
10. 压测 MySQL 连接池与钱包并发支付，确认没有重复扣款或重复开通。
