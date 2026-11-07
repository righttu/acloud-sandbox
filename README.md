# acloud-sandbox：容器中的工单复核

[![部署到 Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/righttu/acloud/tree/main/acloud-sandbox)

需要 Workers **付费计划**及 Containers 使用权限。按钮只部署本子项目。容器使用 Docker 构建；本地部署需运行 Docker。资源名：Worker `acloud-sandbox`，R2 `acloud-sandbox-backups`，Durable Object `AcloudSandbox`。实例上限 2，演示共用一个实例，空闲 2 分钟停止，不适合多租户生产使用。

## 部署后

1. 用部署界面或 `npx wrangler secret put ACLOUD_SANDBOX_TOKEN` 设置随机长令牌，Agent 端设置同一个密钥。
2. 自定义域名 `acloud-sandbox.righttu.uk` 需要当前账号管理 righttu.uk；其他账号先移除 routes，使用 workers.dev 备用地址。
3. 可选设置 `MCP_URL=https://acloud-mcp-s.righttu.uk/mcp` 和密钥 `ACLOUD_MCP_TOKEN`。默认留空，使用 12 条少量示例。密钥不传入 Python、不写入 R2、不出现在模型上下文。
4. 确认 BACKUPS 桶已由部署界面创建。给未完成的 multipart 上传设置 R2 生命周期清理规则。
5. 打开首页输入沙箱令牌。不要在共享电脑留着页面，演示后刷新。

## 演示

- 点「分析第 45 周工单」，查看 stats、findings、stdout、cold_start 和 elapsed_ms。使用 pandas 统计，固定 2026-11-09 00:00 +08:00 为 SLA 判断截点。
- 线索：登录失败从周三起日均增加（与规格预设的周二 22:00 发布只有时间重合，发布记录不是输入中的已验证证据）；3 张 VIP 超时未回复；星河物流一周 4 次工单，是否均为投诉仍需复核。
- 点「备份工作目录」，R2 保存 tickets.json 与 result.json，DO 存保存记录。
- 点「销毁并从备份恢复」，实际 destroy 容器，再启动干净实例，DirectoryBackup 恢复整个工作目录并校验 SHA-256，界面返回备份里的结果。未备份的修改会丢失。只保留最近一次备份，备份不含进程内存或运行状态。
- 刷新页面不等于销毁容器。停止后的文件不会自动恢复；要点恢复按钮。

冷启动实际观察值：**未测量**，当前只做 CI 构建和类型检查，没有付费账户运行环境。请现场记录第一次 `cold_start: true` 的 elapsed_ms 与随后热启动对比。该指标包含启动、输入写入、Python 和结果读取，不是纯 VM 启动耗时，不能作为 SLA。

## 接口与 MCP 契约

所有 POST 路由均需 `Authorization: Bearer <ACLOUD_SANDBOX_TOKEN>`。GET / 是公开说明页，无密钥。

- `POST /analyze`：JSON `{ "week（可写 45 或 "2026-W45"）": 45, "tickets": [...] }` → `{stats, findings, stdout, cold_start, elapsed_ms}`。工单字段遵守仓库 SPEC。最多 1000 条、请求文本最多约 2 MB，仅第 45 周；重复 ID 拒绝。
- `POST /demo`：MCP 或内置示例；MCP 错误不降级为示例。
- `POST /backup`：备份 `/workspace/work`。
- `POST /restore`：销毁并恢复最近备份，返回 result。

MCP 使用标准 Streamable HTTP（JSON 和 SSE）、initialize、initialized、tools/call、会话头及 DELETE 清理。已核对远帆子项目契约 `list_tickets({week:45,limit:200,offset:0})`，返回 structuredContent 或 text JSON 中的 `{tickets:[...],total,next_offset}`。循环读取至 next_offset 为 null，检查总数，最多 10 页且总量不超过 1000 条；不以第一页冒充完整周报。密钥仅由 Worker 注入出站请求头。

## 组件、阶段与手册对照

|组件|用途及阶段|章节|
|---|---|---|
|Workers / Durable Objects SQLite|鉴权、串行操作和备份记录；稳定功能|4.3、6.5、9.x|
|Containers|Linux VM、Python 3.13、pandas；演进中的平台 API，部署前复核账户权限和限制|5.5|
|Sandbox SDK 1.0.3 Files / DirectoryBackup|官方 1.0 API，非旧版 Sandbox 类；升级前核实镜像与 helper 一致|6.5、9.x|
|R2|目录归档；稳定功能|9.x|

容器适合这里是因为需要完整 Linux、Python 和 pandas，不是单纯 JS 计算。Docker 多阶段构建以官方 `cloudflare/sandbox:1.0.3` 提供 helper，Python 基础层安装 pandas；SDK 文档允许这样组合，无需在运行时联网安装包。

出站：`enableInternet:false`，不配置通用代理。DirectoryBackup 只为 `backups.sandbox.internal` 注册操作级内部路由，只能触及当前备份对象；没有 R2 或 MCP 密钥进入容器。固定 argv 和镜像内脚本，不提供任意代码执行或文件路径接口。

限制：单用户演示共享状态，缺少生产用租户隔离、配额、速率限制与审计；令牌使用者可读取和覆盖此演示工作区。请求大小检查发生在读取正文后，公网生产入口应另加 WAF 请求限制。Python 和平台真实启动、R2 恢复需部署后验收，CI dry-run 不代表运行时已验证。

## 验证与官方文档

`npm install` → `npm run check`（wrangler types + tsc --noEmit）→ `npm run dryrun`（wrangler deploy --dry-run --outdir .dryrun）。CI ubuntu 提供 Docker，不跳过镜像检查。没有真实密钥。

- [SDK 1.0 安装和镜像要求](https://developers.cloudflare.com/sandbox/reference/)
- [Files API](https://developers.cloudflare.com/sandbox/reference/files/)
- [DirectoryBackup API](https://developers.cloudflare.com/sandbox/reference/directory-backups/)
- [Python 运行方式](https://developers.cloudflare.com/sandbox/commands/run-python-code/)
- [Containers API、出站与生命周期](https://developers.cloudflare.com/containers/api/durable-object-container/)
- [Containers 与付费计划](https://developers.cloudflare.com/containers/)
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
