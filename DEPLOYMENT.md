# YehaoProxy 部署指南

## 推荐方案：宝塔 MySQL + 单容器

已在宝塔面板实机验证的推荐结构：

- 宝塔负责 MySQL、反向代理、域名和证书。
- Docker 只运行一个 `yehaoproxy` 容器。
- 网站、MySQL 桥接、X-Panel 桥接和定时任务由容器内启动器统一管理。
- 数据库连接在首次安装向导中填写，不写入 Compose，也不提交仓库。
- 正式更新使用宝塔的“更新镜像”；更新前先备份数据库和持久化目录。

仓库中的部署文件为 `docker-compose.single.yml`。旧的 `docker-compose.bt.yml` 是多容器兼容方案，不作为宝塔首选。

## 1. 宝塔环境

需要安装：

- Docker 管理器及 Docker Compose
- MySQL 5.7 或 MySQL 8（推荐 MySQL 8）
- 可选：Nginx，用于绑定域名、HTTPS 和反向代理

服务器至少预留 2 GB 内存。不要向公网开放 MySQL 的 `3306` 端口。

## 2. 创建数据库

在宝塔“数据库”中新建：

- 数据库名称：自定义，例如 `yehaoproxy`
- 用户名：建议与数据库同名
- 密码：使用宝塔生成的强密码
- 访问权限：`Localhost`
- 字符集：`utf8mb4`

单容器使用宿主机网络访问宝塔 MySQL，因此数据库可以继续保持 `Localhost` 权限。

## 3. 添加容器编排

进入“Docker → 容器编排 → 添加容器编排”：

1. 编排名称填写 `yehaoproxy`。
2. Compose 内容完整粘贴下面的示例。
3. `.env` 内容完整粘贴后面的模板，并修改服务器地址。

### Compose 内容

```yaml
services:
  yehaoproxy:
    # GitHub Container Registry 正式版镜像；生产环境固定版本号。
    image: ${YEHAOPROXY_IMAGE:-ghcr.io/yehao9589/yehaoproxy:v1.0.1}
    container_name: yehaoproxy

    # 统一启动网站、数据库桥接、X-Panel 桥接和定时任务。
    command: ["node", "scripts/single-container.mjs"]

    # 使用宿主机网络，通过 127.0.0.1 访问宝塔 MySQL。
    network_mode: host

    environment:
      NODE_ENV: production
      CONTAINER: "true"
      DATABASE_DRIVER: mysql

      # 单容器内置服务地址，保持默认即可。
      MYSQL_BRIDGE_URL: http://127.0.0.1:8789
      XPANEL_BRIDGE_URL: http://127.0.0.1:8787
      UPDATE_WEBHOOK_URL: http://127.0.0.1:8788

      # 网站实际访问地址，在下方 .env 中填写。
      PUBLIC_APP_URL: ${PUBLIC_APP_URL:?请配置 PUBLIC_APP_URL}

      # 固定版本与稳定更新通道。
      APP_VERSION: ${APP_VERSION:-v1.0.1}
      IMAGE_REPOSITORY: ${YEHAOPROXY_IMAGE:-ghcr.io/yehao9589/yehaoproxy:v1.0.1}
      UPDATE_CHANNEL: stable
      UPDATE_MANIFEST_URL: https://raw.githubusercontent.com/yehao9589/yehaoproxy/main/public/releases.json

      # 定时任务检查间隔，单位为毫秒；60000 表示 1 分钟。
      CRON_INTERVAL_MS: ${CRON_INTERVAL_MS:-60000}
      RUNTIME_ENV_FILE: /app/data/runtime.env

    volumes:
      # 安装配置及运行数据。
      - /www/wwwroot/yehaoproxy/data:/app/data
      # 后台上传的 Logo、图片和其他文件。
      - /www/wwwroot/yehaoproxy/uploads:/app/public/uploads
      # 系统备份文件。
      - /www/wwwroot/yehaoproxy/backups:/app/backups

    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 20
      start_period: 45s

    # Docker 或服务器重启后自动恢复服务。
    restart: unless-stopped
```

### .env 内容

```dotenv
# GitHub 正式版镜像；升级时修改版本号。
YEHAOPROXY_IMAGE=ghcr.io/yehao9589/yehaoproxy:v1.0.1

# 没有域名时使用 http://服务器IP:3000，配置证书后改成 HTTPS 域名。
PUBLIC_APP_URL=http://服务器IP:3000

# 后台显示的版本号。
APP_VERSION=v1.0.1

# 定时任务检查间隔，单位为毫秒。
CRON_INTERVAL_MS=60000
```

“同时存为模板”无需勾选，备注可填写 `YehaoProxy v1.0.1 宝塔单容器部署`。内部认证与资产加密数据由系统自动生成并随 `data` 目录持久化，Compose 和 `.env` 均不需要填写授权码或密钥。

生产环境使用固定版本标签 `v1.0.1`，不要改成移动的 `latest` 或 `pre-release`，避免不可控升级。

## 4. 持久化目录

单容器默认使用：

```text
/www/wwwroot/yehaoproxy/data
/www/wwwroot/yehaoproxy/uploads
/www/wwwroot/yehaoproxy/backups
```

- `data`：安装向导保存的运行配置。
- `uploads`：站点上传文件。
- `backups`：备份文件。

删除或重建容器不会删除这些宿主机目录。迁移服务器时必须与 MySQL 备份一起迁移。

## 5. 首次安装

容器显示“运行中”后访问：

```text
http://服务器IP:3000/install
```

安装向导中选择 MySQL，并填写：

- 主机：`127.0.0.1`
- 端口：`3306`
- 数据库名称：宝塔创建的名称
- 用户名：宝塔数据库用户名
- 密码：宝塔数据库密码

先点击测试连接，成功后再建立管理员和站点。初始化完成后，数据库配置会写入 `/app/data/runtime.env`，相关子进程自动重启，安装入口随后锁定。

## 6. 域名与 HTTPS

安装验证完成后，在宝塔网站中创建域名并反向代理到：

```text
http://127.0.0.1:3000
```

申请 HTTPS 证书后，把 `PUBLIC_APP_URL` 改成正式的 `https://域名`，保存编排并重启容器。公网防火墙无需长期开放 `3000`，只允许 Nginx 从本机反向代理即可。

例如二级域名是 `proxy.yehaonc.com`，`.env` 应填写：

```dotenv
PUBLIC_APP_URL=https://proxy.yehaonc.com
```

这里不要追加 `:3000`。浏览器访问的是 Nginx 提供的 HTTPS 默认端口 `443`；宝塔反向代理的目标地址才使用应用监听端口 `http://127.0.0.1:3000`。保存 `.env` 和编排后重新创建容器，再直接访问 `https://proxy.yehaonc.com`。

单容器入口会在 `3000` 端口接收请求，再转发到容器内部的 Web 服务，并写入真实来源 IP。直接通过 `服务器IP:3000` 访问和以后使用宝塔 Nginx 反向代理时，登录日志、操作日志都能读取客户端 IP；不要在外层代理中清除 `X-Forwarded-For`。

## 7. 更新

正式版本镜像更新流程：

1. GitHub Actions 通过代码检查后构建 `ghcr.io/yehao9589/yehaoproxy:v1.0.1`。
2. 先备份宝塔 MySQL 和三个持久化目录。
3. 在宝塔容器编排点击“更新镜像”。
4. 确认容器重新创建后检查日志和 `/api/health`。

生产环境必须使用固定版本标签。升级失败时，把镜像标签改回旧版本并重建，然后按需要恢复数据库备份。

## 8. 备份与恢复

至少备份：

- 宝塔 MySQL 数据库
- `/www/wwwroot/yehaoproxy/data`
- `/www/wwwroot/yehaoproxy/uploads`
- `/www/wwwroot/yehaoproxy/backups`

数据库与文件备份应定期复制到服务器外，并在隔离环境进行恢复演练。

## 9. 常见问题

### 容器很多

宝塔推荐使用 `docker-compose.single.yml`，最终只会显示一个 `yehaoproxy` 容器。不要使用旧的多容器编排作为常规宝塔部署方案。

### 安装向导打不开

检查容器日志是否出现 `Production server running at http://0.0.0.0:3000`，并确认服务器安全组临时允许访问 `3000`。

### 安装前日志提示数据库连接失败

首次安装前尚未保存数据库地址时可能出现等待数据库的日志；只要网站和 `/install` 能打开即可。完成安装后该错误应消失。

### 宝塔仍使用旧镜像

点击“更新镜像”后保存并重建编排。若仍未更新，在宝塔终端执行拉取并强制重建：

```bash
docker pull ghcr.io/yehao9589/yehaoproxy:v1.0.1
docker compose up -d --force-recreate
```

### 安全要求

- 不在聊天、仓库、截图或日志中公开数据库密码和内部密钥文件。
- 密码意外暴露后立即在宝塔改密，并同步更新安装配置。
- 不要单独删除、覆盖或从其他部署复制 `data` 目录中的系统文件。

## 10. 上线验收

1. `/api/health` 返回 HTTP 200。
2. 注册、登录、退出和会话失效跳转正常。
3. 管理员权限与审计日志正常。
4. 商品、购物车、账单、余额支付和优惠券完成测试。
5. 代理 IP、节点购买、人工交付、续费、售后、退款和到期完成测试。
6. 邮件、定时任务、X-Panel 和流量同步完成真实环境测试。
7. MySQL 及文件备份可以在隔离环境恢复。
8. 固定版本镜像可以升级和回退。
