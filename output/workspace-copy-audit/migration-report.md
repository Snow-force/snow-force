# OneDrive 工作目录迁移核验

核验日期：2026-10-04。旧目录 `C:/Project/snow-force`，新目录 `C:/Users/taiyu/OneDrive/Project/snow-force`。

原目录内部 131,200 个普通文件，现已全部复制并逐一确认 SHA256 内容一致。没有打印或保存文件内容或密钥。核验产物和本轮新产生的验收截图不计入原始复制快照。

## 核验结果

- Git 提交和分支一致：`a9738a4bf18f6a99e16766da2a8549bab75d4f2b`，`codex/commerce-public-admin`。18 个 Git 引用一致，原有 82 项未提交记录一致。
- 网站源码、后台源码、Products 商品资料、public 静态资源、数据库迁移、文档、PDF、依赖与已有构建产物均完整。
- 根目录环境文件、商城 `.env.development`、管理员凭据文件、Vercel 项目配置及两份使用手册 PDF 已确认逐字节一致；不在报告中记录其内容或哈希值。
- `.cache/railway-production` 原缺少的 14 个文件已按用户要求补拷；所有文件 SHA256 一致，访问权限保持原样，凭据仍被 Git 忽略。
- 5 个深层依赖文件在普通 Windows 路径下超出长度限制；已用 Windows 扩展路径重新核对，均一致。管理员凭据的受保护访问也已在获准的读取环境中核对。

## 唯一未复制的外部索引缓存

原 `.codegraph` 是指向项目目录外代码索引的 junction；新目录该位置是空目录。外部目标包含下面 6 个缓存文件，不属于项目源码或商城数据，可由代码索引工具重新生成。未修改原始 junction 或删除外部缓存。

- `.gitignore`（229 bytes）
- `codegraph.db`（9,547,776 bytes）
- `codegraph.db-shm`（32,768 bytes）
- `codegraph.db-wal`（5,187,112 bytes）
- `daemon.log`（5,900 bytes）
- `source.json`（61 bytes）

## 使用范围

本核验确认当前电脑上的文件完整性；OneDrive 云端同步完成与另一台电脑下载状态未验证。原目录保留不动。后续使用新目录，旧构建缓存可通过常规构建更新。

## 目标续办

已建立当前对话的每小时续办，先检查实际 usage；额度不可用时等待，额度可用后继续原已授权工作。当前目标已更新为公网后台部署后进行完整测试。付款继续关闭，账户和资金权限边界保持此前已批准范围。

详细机器核验结果见 `final-verification.json`；14 个文件的复制与访问权限检查见 `railway-cache-copy.json`。
