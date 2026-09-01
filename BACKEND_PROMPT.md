# 后端编写提示词 —— 与前端对接的注意事项

> 用途：给"编写私人 AI 执行端后端"的 AI 或开发者看的**对接约束文档**。
> 本文不写技术选型、不规定框架——那些由上层提示词决定。本文只回答一个问题：
> **后端要长成什么样，现有前端才能不改 UI 直接接上？**
>
> 前端位置：本目录（React 19 + TS + Vite + Tailwind + shadcn/ui）。
> 前端唯一的对接边界是 `src/services/api.ts`；类型契约在 `src/types/index.ts`。

## 0. 对接方式（最重要）

前端所有数据都经过 `src/services/api.ts` 的异步函数。接真实后端时：

1. **保持每个函数的签名与返回类型不变**，只把函数体改为 `fetch(BASE_URL + 端点)`；
2. 每个函数上方注释已标注对应的 REST 端点（如 `GET /api/tasks/:id/plan`）；
3. 返回值形状必须与 `src/types/index.ts` 中的类型**逐字段一致**（字段名、类型、嵌套结构）；
4. 删除 `ensureEngine()` 调用（那是 Mock 引擎的启动器）。

后端的验收标准可以很简单：**前端 UI 零修改，只改 api.ts，全部功能照常工作。**

**契约演进规则（裁决后的正式规则）**：
- **向后兼容的新增允许自由进行**——新增可选字段、新增端点、新增枚举值无需逐项确认
  （例：执行端采集清单中的 GPU 功耗、网络、Python/CUDA 版本等，以可选字段加入即可）；
- **破坏性变更必须先提案再修改**——字段改名、删除字段、修改类型或嵌套结构，
  需要先说明影响面，经确认后同步更新 types/index.ts + 本文档 + 前端适配；
- 契约的唯一来源是 `src/types/index.ts`。未来若引入 OpenAPI，必须明确单一事实来源，
  不允许 types、OpenAPI、后端 DTO 三套定义互相漂移。

## 1. 端点清单（前端当前消费的全部接口）

| 端点 | 用途 |
|---|---|
| `GET /api/auth/me` | 当前用户身份 |
| `GET /api/server/status` | 执行端实时状态（含 `gpus[]`） |
| `GET /api/server/services` | 执行端各服务运行状态 |
| `POST /api/server/restart` / `shutdown` | 重启 / 关机 |
| `GET /api/alerts` · `POST /api/alerts/:id/dismiss` | 资源告警 |
| `GET /api/tasks?status=` · `POST /api/tasks` · `GET /api/tasks/:id` · `POST /api/tasks/:id/cancel` | 任务 CRUD |
| `GET /api/tasks/:id/plan` · `POST /api/tasks/:id/plan/approve` · `POST /api/tasks/:id/plan/reject` | planner 计划 |
| `POST /api/tasks/:id/decision` | 回流超限后发起者决策（body: `{choice: 'retry' \| 'skip' \| 'cancel'}`） |
| `GET /api/tasks/:id/logs` · `GET /api/logs` | 日志 |
| `GET /api/results` · `GET /api/results/:id/download` · `DELETE /api/results/:id` | 输出文件 |
| `GET /api/models` · `POST /api/models/:id/default` · `POST /api/models/:id/gpu-mode` · `POST /api/models/:id/start\|stop` | 模型管理 |
| `GET /api/users` · `POST /api/users/:id/admin-grant` | 成员与授权 |
| `GET /api/devices` · `POST /api/devices/:id/disable` · `DELETE /api/devices/:id` | 设备管理 |
| `GET /api/invitations` · `POST /api/invitations` · `POST /api/invitations/redeem` | 邀请密钥 |
| `GET /api/notifications` · `POST /api/notifications/read-all` | 通知 |

## 2. 前端依赖的行为语义（后端必须复刻）

**任务状态机**：后端存储的内部状态可以是全集
（`planning / awaiting_approval / pending / running / replanning / awaiting_decision / completed / failed / cancelled`），
前端会自动把规划中/改计划中/待决策映射为精简显示，**不要在后端做这层映射**。
状态流转约束：awaiting_approval 只能由 approve/reject 离开；awaiting_decision 只能由 decision 离开。

**planner / worker 流水**：
- 新任务必须先经 planner 生成 Plan（子任务表），子任务名与 worker 执行单元严格一一对应；
- `needsApproval` 由 planner 的成本判断决定（前端的 Mock 规则只是示例，后端自定义）；
- 回流规则：worker 自愈重试有限次 → 失败回流 planner → `plan.version + 1` →
  同一任务**回流上限 3 次** → 转 `awaiting_decision` 并通知**命令发起者本人**；
- `task.progress` = 子任务进度平均值；子任务带 `gpuId` 指派；
- 计划修订时**已完成子任务的产出必须保留**（断点续做），不要整体重做；
- 每次关键节点都要追加 PlanEvent（created/approved/dispatched/blocked/revised/decision_required/resumed）——前端的时间线直接渲染它。

**双卡语义**：`gpus[]` 数组顺序即展示序号；`gpu-0` = 主力推理卡（当前 3090），`gpu-1` = 轻量/辅助卡（当前 3080）。
子任务的 `gpuId` 引用这个 id。换卡/单卡时数组长度变化，前端自动适配，**不要硬编码两张卡**。

**GPU ID 稳定性（裁决后的正式规则）**：`gpu-0` / `gpu-1` 这类 ID 必须是**稳定别名**，
不能是每次启动时的枚举序号——换卡、插拔会改变 PCI 枚举顺序，导致历史任务里的
"分配显卡"记录错乱。后端应在首次识别显卡时用其 UUID/序列号建立持久化映射
（如 `gpu-0 ↔ GPU-uuid-xxx`），重启后保持同一物理卡的 ID 不变。

**告警（alerts）**：后端按阈值判定（CPU≥85%、内存≥90%、GPU 使用率≥92%、显存≥90%、温度≥82°C），
每条告警带触发时间、关联任务（若有）、指标名与当前值；条件消失后从列表移除；
dismiss 只抑制展示，条件重置后可再次触发。

**心跳与在线判定**：执行端定期心跳，后端的 `server.online` 应由"最近一次心跳距今"
推导（建议 >30s 判定离线），`lastSeenAt` 传最后一次心跳时间。

**权限（必须在服务端强制执行，不能只靠前端隐藏）**：
- 拥有者唯一；其余皆为成员，成员可带 `adminGranted`；
- 成员：`GET /api/tasks` 只返回自己创建的；`GET /api/results` 只返回自己任务的产出；
  禁止访问 logs / server / models / users / devices / invitations 管理接口；
- 批准计划、决策只接受**任务发起者本人或拥有者**；
- 授予管理员权限只接受**拥有者本人**（被授予的成员无权再授予他人）；
- 邀请码：校验有效期与剩余次数，redeem 后绑定设备。

**通知**：完成任务、任务失败、需批准、需决策、服务器重启等事件都要产生通知
（kind: success/error/warning/info），前端铃铛直接轮询展示。

## 3. 数据格式约定

- 时间：全部 ISO 8601 字符串（`2026-09-01T13:37:00.000Z`），**统一 UTC、带 Z 后缀**——
  执行端在中国（UTC+8）、命令端在英国（UTC+0/+1），后端不输出本地时间，前端自行本地化；
- ID：任务/日志/结果/通知/告警/计划用数字自增；用户/设备/模型用字符串；
- 错误：非 2xx + `{ message: string }`——前端直接展示 `message`；
- **幂等性**：`POST /api/tasks` 必须支持幂等键（如客户端生成 `Idempotency-Key` 头），
  手机弱网重试不得产生重复任务；其余写操作（cancel / approve / decision）应天然幂等；
- 轮询友好：前端每 2–5 秒轮询上述 GET 接口，响应应轻量（预计算/缓存，不要每次现算）；
  若后续升级 WebSocket/SSE，保持同样的数据形状即可，前端只改 useQuery 层。

## 4. 持久化（原文档遗漏，后端必须有答案）

- 任务、计划（含版本历史）、PlanEvent、日志、通知、成员/设备/邀请码都需要持久化，
  建议单执行节点用 SQLite 起步，不要存在内存里；
- 明确输入文件与结果文件的目录结构、保留周期和清理策略；
- 定期备份：任务库 + 配置 + 邀请/设备绑定关系。

## 5. 执行端无人值守运行要求（回国部署清单之外、但决定系统生死的坑）

执行端是家里无人看管的 Windows 机器，以下任一缺失都会让远程系统在某个深夜暴毙：

1. **关闭 Windows 自动更新的自动重启**（更新可以装，重启必须人工或预约）；
2. **电源计划禁止自动睡眠/休眠**，合盖不睡眠；
3. **BIOS 开启来电自启（AC Power Recovery）+ 配智能插座**——断电后唯一可远程恢复的通路；
4. **executor-agent 必须开机自启 + 崩溃自恢复**（Task Scheduler / NSSM），
   否则重启后服务起不来，前面三条全部白搭；
5. **开启 NTP 时间同步**——心跳判定与时间戳全部依赖时钟准确；
6. 后端服务本身同理：自启动、崩溃自愈、日志落盘。

## 6. 当前 Mock 的已知简化（后端要补的课）

1. 拖拽文件目前只传文件名，真实版需要 `multipart/form-data` 上传并落盘到执行端输入目录；
2. 结果文件目前是元数据 + 预览文本，真实版要返回真实文件流（download）与预览；
3. Mock 的身份切换是前端全局变量，真实版用登录态 / Token，前端切换按钮随之删除；
4. Mock 的告警/指标是随机游走，真实版从执行端 agent 采集上报；
5. 网络面：命令端（英国）与执行端（中国）跨公网，需要中继/隧道或执行端主动长连接出站，
   前端只关心一个可达的 BASE_URL。

## 7. 建议的前端联调步骤

1. 后端先实现 `GET /api/server/status` + `GET /api/tasks`，把 api.ts 里这两个函数改成 fetch 验证通路；
2. 再迁移任务生命周期（plan / approve / decision）；
3. 最后迁移写操作（重启/授权/邀请）与文件上传下载；
4. 每迁移一组接口，前端对应页面应立即可用，无需改 UI。
