# 私人远程 AI 执行端控制平台 — 项目档案

> 给 AI 助手：每次接到本项目的修改指令时，**先读本文件**，再按需读具体源码。
> 不要全文通读所有代码；按下方"文件地图"精准定位。
>
> 相关文档：`BACKEND_PROMPT.md` —— 后端对接约束（端点清单、行为语义、权限规则），
> 第二阶段编写后端时使用。

## 一句话定位

响应式 Web 前端原型：用户在英国（Windows 笔记本 / iPhone）远程管理中国家里的
Windows 执行端（RTX 3080 + i5-12600KF）。**当前只有前端，全部数据为 Mock**；
第二阶段才接真实后端 / Ollama / GPU。

## 运行方式（重要：npm 不在 PATH）

Git Bash 中必须先加 shim 路径：

```bash
export PATH="/c/Users/29412/bin:/c/Users/29412/AppData/Roaming/kimi-desktop/daimon-share/daimon/command-process-owner/bin:$PATH"
cd "/c/Users/29412/Documents/Kimi/Workspaces/互联/ai-console"
npm run dev -- --host --port 7100   # --host 才能手机访问
npm run build                        # 验证改动
```

- `/c/Users/29412/bin/npm` 是手写 shim（调用 npm.cmd），勿删。
- 电脑局域网 IP：`172.20.12.71`（手机访问用），`26.77.84.200` 是虚拟网卡。
- 技术栈：React 19 + TypeScript + Vite 7 + Tailwind 3.4 + shadcn/ui（40+ 组件已在 src/components/ui）+ react-router-dom 7。

## 文件地图

```
src/
├── types/index.ts            # 全部领域类型（= 未来后端 DTO），改字段先改这里
├── services/
│   ├── store.ts              # Mock 数据引擎：内存 DB + 每 2s tick（指标波动、
│   │                         #   任务推进、日志产生、完成/失败、通知）。UI 禁止直接访问
│   └── api.ts                # ★ 前后端唯一边界。每个函数标注对应 REST 端点
│                             #   （GET /api/tasks 等）。接真实后端只改这个文件
├── hooks/useQuery.ts         # useQuery(fetcher, deps, {interval})：轮询 + 订阅 store 变更
├── lib/format.ts             # 时间 / 大小格式化
├── components/
│   ├── widgets.tsx           # 共享组件：TaskStatusBadge / OnlineBadge / MetricBar /
│   │                         #   PageHeader / EmptyState
│   ├── layout/AppLayout.tsx  # ★ 全局布局：桌面侧边栏 + 移动底部标签栏 + 顶栏
│   │                         #   （在线状态、通知铃铛、Mock 身份切换）
│   └── ui/                   # shadcn 组件，勿手改
└── pages/                    # 9 个页面，文件名即路由：
    DashboardPage(/)  TasksPage(/tasks)  NewTaskPage(/tasks/new)
    TaskDetailPage(/tasks/:id)  LogsPage(/logs)  ResultsPage(/results)
    ModelsPage(/models)  ServerPage(/server)  UsersPage(/users)
```

路由表在 `src/App.tsx`。

## 关键约定

- **暗色控制台风格**：`index.html` 带 `class="dark"`；背景 zinc-950、卡片 zinc-900/50、
  边框 zinc-800；语义色：emerald=在线/成功、sky=执行中/信息、amber=警告/取消、red=失败/离线。
- **响应式断点 `lg`(1024px)**：桌面侧边栏 `hidden lg:flex`；移动底部标签栏 `lg:hidden`；
  移动次级页面入口在底部「更多」抽屉。按钮触摸目标 ≥ 44px（`min-h-11` 等）。
- **权限**：`api.ts` 内 `currentUserId` 切换 Mock 身份；普通用户只见自己的任务，
  管理员专属页面在导航中隐藏（`adminOnly`）+ service 层 `requireAdmin()` 双重控制。
- **Mock 生命周期**：store.ts 的 `tick()` 每 2 秒执行；任务约 12% 概率模拟失败；
  同时运行上限 2 个任务；pending 按 high>normal>low 启动。
- 任务 ID 从 1024 起，自增（store.ts `nextTaskId`）。

## 当前状态（2026-09-01 第二次迭代）

- ✅ 双 GPU 架构：`ServerStatus.gpus: GPUStatus[]`，Mock 双 RTX 3080；控制台 / 服务器管理
  按卡渲染多套指标；任务由 planner Mock 分配显卡（`task.gpuIds`）。
- ✅ 资源告警：CPU≥85% / 内存≥90% / GPU 使用率≥92% / 显存≥90% / 温度≥82°C 时，
  顶栏下方出现琥珀色横幅（含时间、任务、指标、数值），可关闭；见 AppLayout `AlertBanner`。
- ✅ 控制台：标题副标题动态拼接（OS + 显卡型号）；删除最近完成/最近失败板块与新建任务按钮。
- ✅ 任务页：搜索栏（名称/#编号/日期，按钮展开）+ 状态标签 + 日志抽屉按钮。
- ✅ 新建任务：文件夹路径 + 拖拽文件（不限类型）；删除模型选择与优先级（planner 自动分配）。
- ✅ 日志独立页面删除，改为 `components/LogsPanel.tsx` 抽屉（任务页 / 任务详情 / 服务器管理复用）。
- ✅ "结果"改名"输出"（导航、页面、移动端更多）。
- ✅ AI 模型页：每模型可选 GPU 0 / GPU 1 / 双卡联合（`setModelGpuMode`），注明 planner/worker 调度。
- ✅ 权限重构：`User { isOwner, adminGranted }`；拥有者唯一；成员视图只见邀请码输入框；
  被授予权限的成员不能授予他人（service 层校验 `isOwner`）；Mock 身份切换 = 拥有者/成员。
- ✅ 删除侧边栏左下角 GPU 角标；移动端底部标签改为 4 格（控制台/任务/新建/更多）。
- ✅ 构建通过（2026-09-01）。
- ⏳ 未做：真实后端、真实认证、真实 GPU 数据——均属第二阶段，用户明确要求暂缓。
- 用户偏好：**先发指令再动手**；他的直觉提议要按实际情况肯定或反驳，不要盲从。

## 当前状态（2026-09-01 第三次迭代：planner/worker 架构）

- ✅ 双卡改为 **GPU 0 = RTX 3090 24G（主力推理）/ GPU 1 = RTX 3080 10G（轻量·辅助）**。
- ✅ planner/worker 流程（store.ts Mock 引擎）：
  新任务 → `planning`（planner 评估+生成任务表）→ 高成本（≥3 个拖入文件或指令 ≥40 字）
  需发起者批准（`awaiting_approval`），低成本直接排队执行；
  worker 按子任务表执行（轻量→3080，推理→3090）；技术性故障 worker 自愈 ≤2 次；
  自愈失败回流 planner，计划版本 +1 并改派显卡；**回流上限 3 次**后 →
  `awaiting_decision`，通知命令发起者三选一（继续尝试 / 跳过子任务 / 取消任务）。
- ✅ 任务状态**对外精简为 6 种**：待批准 / 等待中 / 执行中 / 已完成 / 已失败 / 已取消。
  内部阶段（planning / replanning / awaiting_decision）保留在引擎中，UI 通过
  `displayStatus()`（types/index.ts）映射：规划中→等待中，改计划中→执行中，待决策→等待中
  （由通知 + 详情页决策卡引导处理）。回流记录保留在详情页「计划动态」时间线与日志中。
- ✅ 任务详情页新增：执行计划卡（子任务表：状态/显卡/自愈次数/回流次数/进度）、
  计划动态时间线（created/approved/dispatched/blocked/revised/decision_required/resumed）、
  待批准横幅、待决策卡（仅命令发起者或拥有者可操作）。
- ✅ 新类型：Plan / Subtask / PlanEvent / DecisionChoice；新 API：getTaskPlan /
  approvePlan / rejectPlan / resolveTaskDecision（对应 /api/tasks/:id/plan 等端点）。
- ✅ NotificationKind 增加 warning（琥珀色圆点）。
- ✅ 终审修复（2026-09-01）：模型页显卡名从执行端数据动态读取（不再硬编码 3090/3080）；
  「查看服务状态」改为真实弹窗（GET /api/server/services，executor-agent/planner/worker 三服务）；
  成员路由守卫：/server /models 直接访问显示无权限；任务页日志按钮与任务详情日志卡
  对成员隐藏。
- 之前迭代（双 GPU、告警横幅、任务搜索、日志抽屉、拖拽上传、输出改名、权限模型）均保留。
- ⏳ 未做：真实后端、真实认证——第二阶段。
- 用户偏好：先发指令再动手；直觉提议要按实际情况肯定或反驳。

## 版本与备份

- GitHub 仓库（私有）：https://github.com/xwx0708/ai-executor-console
- V1 前端原型已于 2026-09-02 完整备份到 `main` 分支（含 package-lock.json，
  共 89 个文件），标签 `v1.0-frontend`。
- 本机 git 已与远程对齐（首批经 GitHub API 写入，后经 fetch + reset 合并历史）。
  之后正常 `git push/pull` 即可。
- 注意：本机默认 SSH 钥匙绑定的是另一个 GitHub 账号（wx0725）；本仓库已配置
  `core.sshCommand` 专用钥匙 `~/.ssh/id_ed25519_xwx0708`，不要删除该文件。

## 待办 / 想法池（用户提过但未确认的）

- 左上角预留位未来放什么（待定）。
- 真机 iPhone 测试反馈待收集。
- 第二阶段：planner/worker 真实实现（Python 服务 + 队列 + 计划版本持久化）。
