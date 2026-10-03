# 单台 Linux 服务器部署 Medusa 管理后台

状态：配置准备与本地验证阶段，尚未部署到公网。适用于普通 Linux VPS，不依赖 DigitalOcean 专有服务。

2026-10-03 验证：Docker Compose 实际解析通过，六项针对测试通过，包含 Node TLS 真实握手与证书拒绝检查、CLI 凭据不泄露和拒绝覆盖；网站 954 项及后台 394 项测试、类型检查和构建通过。隔离 Linux Redis 容器的 TLS、密码认证和重启数据保留已验证；Medusa 镜像中的实际 ioredis 客户端连接通过，Caddy 在断网容器中通过配置校验。测试未连接真实商品数据库，已清理临时容器、网络和卷。尚未在 Linux 云主机运行完整应用组合，公网证书申请、商品编辑 / 上传 / 重启验收和实际容量仍需部署后验证。

一台机器运行 Medusa、Redis 和 Caddy，沿用现有 Supabase 的 `commerce` 数据与商品图片。首次仅运行商品管理模式，付款、订单与退款写入保持关闭。没有独立 Redis 订阅、额外 PostgreSQL 或独立 worker 机器费用。

## 容量与费用

DigitalOcean 2 GB / 1 vCPU 为 US$12 / 月，可作为初期容量验证档；4 GB / 2 vCPU 为 US$24 / 月。备份、税费另计。2 GB 并未通过真实服务器容量验收；容器默认限制 Medusa 1280 MB、Redis 384 MB、Caddy 128 MB，仍要给宿主机留出内存并观察峰值。4 GB 可将 `COMMERCE_MEMORY_LIMIT` 调整至 `2560m`，应依据实测设置。

服务器和开发机器分别运行应用镜像；不要在 2 GB 服务器上同时构建 Medusa。先在开发机器构建并验证镜像，再导出、传输、加载。当前已验收的镜像 ID 见 `stack.env.example`；加载后用 `docker image inspect` 核对 ID。源代码变更后必须重新构建、验证和更新该值。

## 部署前仍需提供

- 托管账号、选定套餐与付费授权、服务器管理访问方式。
- 可指向服务器的公网域名。`commerce.snow-force.com` 目前只是建议，没有配置 DNS。
- 现有商城专用数据库连接、CA、后台密钥及 Supabase Storage S3 access pair。使用商城角色，不使用数据库管理员或整个网站的 service-role key。

这些凭据不通过聊天发送，不保存到仓库，不放入镜像。

## Linux 主机准备

使用受支持的 Linux、Docker Engine 与 Docker Compose **2.30 或以上**（需要 `env_file.format: raw`），以及 Node.js 24 和 OpenSSL。先确认服务器访问与账号，再按 Docker 官方发行版指引安装；本目录不执行自动购买、SSH 或系统安装。

防火墙对公网开放 TCP 80 / 443，SSH 仅开放给管理员地址。不要开放 9000 或 6379。域名 A 记录应指向实际服务器；没有 IPv6 服务时不要保留错误的 AAAA 记录。Caddy 自动申请和更新公网 HTTPS 证书，证书数据保存在持久化卷中。

将本目录放到 `/opt/snowforce-commerce/deploy`，将受保护配置放到 `/opt/snowforce-commerce/secrets`。以下命令由服务器管理员在 Linux 运行，父目录仅 root 可访问：

```bash
sudo install -d -m 0700 /opt/snowforce-commerce/secrets
sudo node /opt/snowforce-commerce/deploy/init-redis-secrets.mjs /opt/snowforce-commerce/secrets/redis
```

初始化脚本拒绝覆盖已有目录，生成随机 Redis 密码、密码哈希 ACL 和仅供内部 `redis` 主机使用的 TLS 证书。输出不包含密码。Redis 使用密码认证和 TLS；客户端通过挂载 CA 进行证书验证。CA 私钥不挂载到任何容器。Compose 的文件型 secrets 为只读挂载，宿主机父目录的 0700 权限仍是保护措施，不能把此目录改成公网共享目录。

创建 root 所有、权限 0600 的 `/opt/snowforce-commerce/secrets/commerce.env`，填写公网部署方案中的数据库、Supabase Auth、S3、CORS、JWT / cookie 与同步密钥。这个文件使用 `KEY=value` 的**未加引号**原始值；不要插入 shell 表达式。`DATABASE_CA_CERT` 用字面量 `\n` 表示换行。Redis 连接由生成的 `redis.env` 注入，不手写或打印密码。

将 `stack.env.example` 复制到受保护的 `/opt/snowforce-commerce/secrets/stack.env`，填写实际域名、证书联系邮箱、环境文件路径和已加载的镜像 ID。它不包含数据库密码，也不要提交真实部署配置。

从部署目录运行，仅做校验时不要输出完整展开配置：

```bash
sudo docker compose --env-file /opt/snowforce-commerce/secrets/stack.env config --quiet
sudo docker compose --env-file /opt/snowforce-commerce/secrets/stack.env up -d
sudo docker compose --env-file /opt/snowforce-commerce/secrets/stack.env ps
```

`up` 不运行数据库迁移或草稿导入。Redis 必须先通过 TLS 和密码健康检查，Medusa 必须通过 `/health` 后 HTTPS 入口才启动。付款开关由 Compose 固定为关闭。Redis 没有宿主机端口，只有内部网络；Caddy 不连接 Redis 网络。

## 验收、升级和恢复

在实际 HTTPS 域名验证 `/health`、`/app`、未登录管理 API 拒绝访问、现有管理员登录。创建专用验收草稿，改美元价格及尺码库存，上传图片，然后重启容器，确认数据与图片仍存在。验证顾客付款及后台捕获、退款、订单写入仍关闭，再切换 Vercel 的网站后端地址。最后填入合伙人手册中的真实登录地址，并请她在自己的电脑上登录。

运行 `docker stats --no-stream` 观察内存，结合空闲、图片上传、批量编辑与重启时的峰值；检查 OOM、重启次数及 HTTP 错误。2 GB 容量不足时升级再验收，不降低持久化或证书校验要求。

Redis 开启 AOF、每秒刷盘、RDB 快照和 `noeviction`。它们保存在 `redis-data` 卷；容器重启保留，主机损坏仍需机器备份。不要使用 `docker compose down -v`。机器备份不包含外部 Supabase 数据及 Storage，沿用其备份方案。实际交接前应完成一次恢复演练。

内部 Redis 服务证书有效期一年。到期前用同一受保护 CA 为 `redis` 主机签发新证书，保留原密码和 ACL，更新证书后重启 Redis 与 Medusa；不要重跑初始化以更换全部凭据。可用 `openssl x509 -checkend 2592000 -noout -in server.pem` 检查是否在 30 天内到期。公网 HTTPS 证书由 Caddy 自动续期。

升级前记录实际 Redis / Caddy 镜像摘要、Medusa 镜像 ID 和当前配置版本，备份持久化卷；先验证新镜像，再更新 Medusa 镜像 ID。当前 Redis / Caddy 标签锁定大版本，补丁变更需主动拉取并重新验证，不承诺标签永不变化。

来源：[Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)、[Redis TLS](https://redis.io/docs/latest/operate/oss_and_stack/management/security/encryption/)、[Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)、[DigitalOcean 报价](https://www.digitalocean.com/pricing/droplets)。
