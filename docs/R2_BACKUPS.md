# VPS 面板备份存入 Cloudflare R2

本功能保留现有本地备份，再把面板数据库与可用的 Xray 配置打包、压缩并以独立的 AES-256-GCM 密钥加密后上传。默认关闭，不会创建存储桶、开启公开访问或自动上传历史文件。

## 配置步骤

1. 在自己的 Cloudflare 账号开通 R2，创建一个专门用于备份的私有存储桶，使用 Standard 存储。不要开启公开访问、自定义公开域名或 r2.dev 公开地址。
2. 创建 R2 S3 访问密钥，选择 Object Read & Write，并将范围限制为这个备份桶。不需要账号管理权限。保存 Account ID、Access Key ID 和 Secret Access Key；不是 Cloudflare Global API Key。
3. 在「VPS 运维 → 面板备份」点击「R2 设置」，在右侧面板填写账号、存储桶及访问密钥。一般选择默认区域；有 jurisdiction 的桶需选择对应的欧盟、美国或 FedRAMP 区域。
4. 下载解密密钥，另存到自己的电脑或离线介质。该密钥不等于 R2 访问密钥；不要放进同一备份桶。丢失密钥后无法恢复加密内容。
5. 开启「新备份自动上传 R2」并保存，再检测存储桶访问。检测只发 HEAD 请求，不上传文件，也不能代替真实写入验证。
6. 手动备份一次，在列表确认 R2 显示「已加密上传」。历史本地备份可逐条点击「上传 R2」。

R2 Access Key ID、Secret Access Key 和备份加密密钥在数据库内沿用现有资产加密方式保存，普通设置接口只返回配置状态，不返回密钥。备份索引、运维记录和审计日志不存储明文访问密钥或解密密钥。解密密钥只能经有设置权限的管理员主动下载导出。

## 上传、重试和保留

- 本地备份成功后才开始上传；R2 故障不删除本地文件。
- 云端内容是 `.yhbackup` 加密归档，包含可独立恢复所需的文件清单。上传使用内容摘要及 Content-MD5，并以 HEAD 核对对象大小与保存的摘要。
- 对象名包含面板名称、北京时间和唯一标识。请求带 `If-None-Match: *`，不覆盖现有对象，也不会调用云端删除。
- 自动重试沿用已有后台调度，初始等待 5 分钟，逐步退避，达到 5 次尝试后需手动重试。关闭 R2 后不再提交新上传，已经开始的任务会继续完成。
- 本地保留数量仍按每台面板计划生效；上传中的文件暂不清理。上传完成后，后续备份再执行正常清理。本地记录或文件被清理时，R2 对象不会被清理。
- 超出本地保留范围的云端副本可从 Cloudflare 控制台下载；本系统列表不是完整的云端文件目录。
- 云端保留期限、防覆盖/防删除规则应由管理员在 Cloudflare 控制台单独配置。锁定规则与自动到期清理应协调，避免无法删除的文件超出预算。
- R2 免费额度按整个账号累计。文件小不代表永远免费，应关注存储容量、请求数及账单；本功能不会设置费用硬上限。

## 离线解密验证

从面板下载解密工具 `yehaoproxy-decrypt-backup.mjs`，从 R2 下载 `.yhbackup` 文件，并准备单独保管的解密密钥 JSON。在已安装 Node.js 22 或更新版本的电脑运行：

```text
node yehaoproxy-decrypt-backup.mjs "备份.yhbackup" "解密密钥.json" "新的输出目录"
```

工具没有第三方依赖、不访问网络、不写入远端 VPS，只输出解密后的数据库与配置。它先完成加密认证，再核对每个文件的 SHA-256；密钥错误、归档损坏或输出目录已存在时拒绝覆盖。输出目录必须是新的目录。

应定期在隔离测试面板中演练恢复。这里不是整台 VPS 的磁盘镜像，不包含宿主机证书和系统文件，也不能替代 YehaoProxy 自身 MySQL、data、uploads 等数据的备份。

## 官方参考

- [R2 访问密钥和权限](https://developers.cloudflare.com/r2/api/tokens/)
- [R2 S3 API 兼容性](https://developers.cloudflare.com/r2/api/s3/api/)
- [R2 保留规则](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
- [R2 价格和免费额度](https://developers.cloudflare.com/r2/pricing/)
- [AWS SigV4 请求签名](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html)
