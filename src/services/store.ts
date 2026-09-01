// ============================================================
// Mock 数据引擎（第二阶段将被真实后端替换）
//
// 模拟一台双卡执行端（GPU 0 = RTX 3090 24G 主力推理；GPU 1 = RTX 3080 10G 轻量/辅助）
// 和一套 planner / worker 调度流程：
//
//   新任务 → planner 制定计划（任务表，子任务与 worker 执行单元严格对应）
//         → 高成本任务需命令发起者批准；低成本自动执行
//         → worker 逐个子任务执行（轻量子任务 → 3080，重推理 → 3090）
//         → worker 遇技术性故障先自愈重试（≤2 次）
//         → 自愈失败则回流 planner，planner 修订计划（版本 +1）
//         → 同一任务回流 3 次仍未解决 → 升级为「待决策」，通知命令发起者
//
// UI 组件不允许直接读写这里，必须通过 services/api.ts 访问。
// ============================================================

import type {
  AIModel,
  AppNotification,
  CreateTaskInput,
  Device,
  GPUStatus,
  Invitation,
  LogEntry,
  Plan,
  PlanEventType,
  ResultFile,
  ServerStatus,
  Subtask,
  SystemAlert,
  Task,
  User,
} from '@/types'

// ---------------- 简单发布订阅，用于驱动 React 刷新 ----------------

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  listeners.forEach((fn) => fn())
}

// ---------------- 工具 ----------------

const now = () => new Date().toISOString()

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString()
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

const MAX_REPLANS = 3 // 回流上限：3 次后升级给命令发起者
const MAX_SELF_RETRIES = 2 // worker 技术性故障的自愈重试上限，超过则回流

// ---------------- 用户与权限 ----------------

const users: User[] = [
  { id: 'u-owner', name: '我（拥有者）', isOwner: true, adminGranted: true },
  { id: 'u-member', name: '成员 · 小张', isOwner: false, adminGranted: false },
]

// ---------------- 初始数据 ----------------

const server: ServerStatus = {
  online: true,
  os: 'Windows 11 Pro 24H2',
  cpuPercent: 18,
  ramUsedGB: 21,
  ramTotalGB: 32,
  gpus: [
    { id: 'gpu-0', name: 'NVIDIA GeForce RTX 3090', utilPercent: 74, tempC: 67, vramUsedGB: 16.8, vramTotalGB: 24 },
    { id: 'gpu-1', name: 'NVIDIA GeForce RTX 3080', utilPercent: 12, tempC: 45, vramUsedGB: 1.1, vramTotalGB: 10 },
  ],
  disk: { usedGB: 612, totalGB: 1907 },
  uptimeSec: 3 * 24 * 3600 + 7 * 3600 + 42 * 60,
  lastSeenAt: now(),
}

const devices: Device[] = [
  { id: 'dev-exec', name: '中国家中台式机（执行端）', type: 'windows-desktop', online: true, lastSeenAt: now(), role: 'owner', disabled: false },
  { id: 'dev-laptop', name: '联想笔记本 · 英国', type: 'windows-laptop', online: true, lastSeenAt: now(), role: 'owner', disabled: false },
  { id: 'dev-iphone', name: 'iPhone · 英国', type: 'ios', online: true, lastSeenAt: minutesAgo(3), role: 'owner', disabled: false },
]

const models: AIModel[] = [
  { id: 'qwen2.5-14b', name: 'Qwen 2.5 14B Instruct', sizeGB: 9.2, params: '14B', status: 'loaded', running: true, vramGB: 7.4, isDefault: true, gpuMode: 'dual' },
  { id: 'deepseek-r1-8b', name: 'DeepSeek R1 Distill 8B', sizeGB: 5.1, params: '8B', status: 'available', running: false, vramGB: 0, isDefault: false, gpuMode: 'gpu0' },
  { id: 'llama3.1-8b', name: 'Llama 3.1 8B Instruct', sizeGB: 4.9, params: '8B', status: 'available', running: false, vramGB: 0, isDefault: false, gpuMode: 'gpu1' },
  { id: 'mistral-7b', name: 'Mistral 7B v0.3', sizeGB: 4.4, params: '7B', status: 'available', running: false, vramGB: 0, isDefault: false, gpuMode: 'gpu0' },
]

let nextTaskId = 1030
let nextLogId = 1
let nextResultId = 1
let nextNotificationId = 1
let nextInvitationId = 1
let nextAlertId = 1
let nextPlanId = 1

const tasks: Task[] = [
  {
    id: 1024,
    name: '分析 Research 文件夹中的 PDF',
    description: '分析 D:\\Research\\2026 中的所有 PDF，并生成一份中文总结。',
    input: 'D:\\Research\\2026',
    createdAt: minutesAgo(46),
    createdByDevice: '联想笔记本 · 英国',
    createdByUserId: 'u-owner',
    status: 'running',
    progress: 76,
    model: 'Qwen 2.5 14B Instruct',
    priority: 'normal',
    allowBackground: true,
    gpuIds: ['gpu-0'],
    replanCount: 0,
    needsApproval: false,
    startedAt: minutesAgo(41),
  },
  {
    id: 1025,
    name: '批量转换扫描件为可搜索 PDF',
    description: '对 D:\\Scans\\receipts 中的扫描件执行 OCR 并输出可搜索 PDF。',
    input: 'D:\\Scans\\receipts',
    inputFiles: ['scan_0001.pdf', 'scan_0002.pdf', 'scan_0003.pdf'],
    createdAt: minutesAgo(38),
    createdByDevice: 'iPhone · 英国',
    createdByUserId: 'u-member',
    status: 'pending',
    progress: 0,
    model: 'DeepSeek R1 Distill 8B',
    priority: 'normal',
    allowBackground: true,
    replanCount: 0,
    needsApproval: false,
  },
  {
    id: 1023,
    name: '整理 2025 年发票并生成 Excel 汇总',
    description: '读取 D:\\Finance\\2025 下的发票图片，提取金额与日期，生成 summary.xlsx。',
    input: 'D:\\Finance\\2025',
    createdAt: minutesAgo(60 * 5),
    createdByDevice: '联想笔记本 · 英国',
    createdByUserId: 'u-owner',
    status: 'completed',
    progress: 100,
    model: 'Qwen 2.5 14B Instruct',
    priority: 'normal',
    allowBackground: true,
    gpuIds: ['gpu-0'],
    replanCount: 0,
    needsApproval: false,
    startedAt: minutesAgo(60 * 5 - 2),
    finishedAt: minutesAgo(60 * 5 - 26),
    resultSummary: '已处理 148 张发票，生成 summary.xlsx 与 analysis.md。',
  },
  {
    id: 1022,
    name: '下载并转写会议录音',
    description: '将 D:\\Meetings\\0812.mp3 转写为文字稿。',
    input: 'D:\\Meetings\\0812.mp3',
    createdAt: minutesAgo(60 * 9),
    createdByDevice: 'iPhone · 英国',
    createdByUserId: 'u-owner',
    status: 'failed',
    progress: 43,
    model: 'Mistral 7B v0.3',
    priority: 'normal',
    allowBackground: false,
    gpuIds: ['gpu-1'],
    replanCount: 3,
    needsApproval: false,
    startedAt: minutesAgo(60 * 9 - 1),
    finishedAt: minutesAgo(60 * 9 - 12),
    error: '显存不足：模型加载时需要 5.8 GB，3080 当前仅剩 2.6 GB 可用。',
  },
  {
    id: 1021,
    name: '清理临时下载目录',
    description: '清理 D:\\Downloads\\tmp 中 30 天前的文件。',
    input: 'D:\\Downloads\\tmp',
    createdAt: minutesAgo(60 * 26),
    createdByDevice: '联想笔记本 · 英国',
    createdByUserId: 'u-owner',
    status: 'cancelled',
    progress: 12,
    model: 'Llama 3.1 8B Instruct',
    priority: 'normal',
    allowBackground: true,
    replanCount: 0,
    needsApproval: false,
    startedAt: minutesAgo(60 * 26 - 3),
    finishedAt: minutesAgo(60 * 26 - 8),
  },
]

const plans: Plan[] = [
  {
    id: nextPlanId++,
    taskId: 1024,
    version: 1,
    createdAt: minutesAgo(41),
    subtasks: [
      { id: 's1', name: '扫描输入目录', status: 'completed', gpuId: 'gpu-1', progress: 100, retries: 0, replans: 0 },
      { id: 's2', name: '文本提取与分块', status: 'completed', gpuId: 'gpu-1', progress: 100, retries: 0, replans: 0 },
      { id: 's3', name: '模型推理分析', status: 'running', gpuId: 'gpu-0', progress: 62, retries: 0, replans: 0 },
      { id: 's4', name: '结果校验', status: 'pending', gpuId: 'gpu-1', progress: 0, retries: 0, replans: 0 },
      { id: 's5', name: '生成中文总结报告', status: 'pending', gpuId: 'gpu-0', progress: 0, retries: 0, replans: 0 },
    ],
    events: [
      { ts: minutesAgo(41), type: 'created', detail: 'planner 生成计划 v1：5 个子任务（轻量子任务 → 3080，推理 → 3090）' },
      { ts: minutesAgo(41), type: 'dispatched', detail: '子任务「扫描输入目录」已派发 worker' },
    ],
  },
]

const logs: LogEntry[] = [
  { id: nextLogId++, ts: minutesAgo(41), level: 'INFO', message: '收到任务 #1024「分析 Research 文件夹中的 PDF」', taskId: 1024 },
  { id: nextLogId++, ts: minutesAgo(41), level: 'INFO', message: 'planner 生成计划 v1，共 5 个子任务', taskId: 1024 },
  { id: nextLogId++, ts: minutesAgo(41), level: 'INFO', message: 'worker 开始「扫描输入目录」（GPU 1 · 3080）', taskId: 1024 },
  { id: nextLogId++, ts: minutesAgo(40), level: 'INFO', message: '找到 327 个文件', taskId: 1024 },
  { id: nextLogId++, ts: minutesAgo(39), level: 'INFO', message: 'worker 开始「文本提取与分块」（GPU 1 · 3080）', taskId: 1024 },
  { id: nextLogId++, ts: minutesAgo(31), level: 'INFO', message: 'worker 开始「模型推理分析」（GPU 0 · 3090，Qwen 2.5 14B）', taskId: 1024 },
  { id: nextLogId++, ts: minutesAgo(18), level: 'WARN', message: 'GPU 0 显存占用达到 16.8 GB（70%），继续保持监控', taskId: 1024 },
  { id: nextLogId++, ts: minutesAgo(12), level: 'INFO', message: '已完成 248 / 327 个文件的摘要', taskId: 1024 },
]

const results: ResultFile[] = [
  { id: nextResultId++, taskId: 1023, name: 'summary.xlsx', sizeKB: 214, createdAt: minutesAgo(60 * 5 - 26), contentPreview: '发票汇总表：148 行，包含日期、商户、金额、类别四列。' },
  { id: nextResultId++, taskId: 1023, name: 'analysis.md', sizeKB: 32, createdAt: minutesAgo(60 * 5 - 25), contentPreview: '# 2025 年发票分析\n\n全年共 148 张发票，总支出 ¥86,420……' },
]

const notifications: AppNotification[] = [
  { id: nextNotificationId++, ts: minutesAgo(60 * 5 - 26), kind: 'success', message: '任务 #1023 已完成。', read: false },
  { id: nextNotificationId++, ts: minutesAgo(60 * 30), kind: 'info', message: '服务器已重新启动。', read: true },
]

const invitations: Invitation[] = []

// ---------------- 资源告警 ----------------

const alerts: SystemAlert[] = []
const dismissedAlertKeys = new Set<string>()

interface AlertDef {
  key: string
  metric: string
  active: boolean
  valueText: string
}

function currentAlertDefs(): AlertDef[] {
  const defs: AlertDef[] = [
    { key: 'cpu', metric: 'CPU 使用率', active: server.cpuPercent >= 85, valueText: `${server.cpuPercent}%` },
    {
      key: 'ram',
      metric: '内存',
      active: server.ramUsedGB / server.ramTotalGB >= 0.9,
      valueText: `${server.ramUsedGB} / ${server.ramTotalGB} GB`,
    },
  ]
  server.gpus.forEach((g, i) => {
    defs.push({ key: `gpu-${i}-util`, metric: `GPU ${i} 使用率`, active: g.utilPercent >= 92, valueText: `${g.utilPercent}%` })
    defs.push({
      key: `gpu-${i}-vram`,
      metric: `GPU ${i} 显存`,
      active: g.vramUsedGB / g.vramTotalGB >= 0.9,
      valueText: `${g.vramUsedGB} / ${g.vramTotalGB} GB`,
    })
    defs.push({ key: `gpu-${i}-temp`, metric: `GPU ${i} 温度`, active: g.tempC >= 82, valueText: `${g.tempC}°C` })
  })
  return defs
}

function refreshAlerts() {
  const defs = currentAlertDefs()
  const runningTask = tasks.find((t) => t.status === 'running' || t.status === 'replanning')
  for (const def of defs) {
    const existing = alerts.findIndex((a) => a.metric === def.metric)
    if (def.active) {
      if (existing === -1 && !dismissedAlertKeys.has(def.key)) {
        alerts.push({
          id: nextAlertId++,
          ts: now(),
          metric: def.metric,
          valueText: def.valueText,
          taskId: runningTask?.id,
          taskName: runningTask?.name,
        })
      } else if (existing >= 0) {
        alerts[existing].valueText = def.valueText
      }
    } else {
      if (existing >= 0) alerts.splice(existing, 1)
      dismissedAlertKeys.delete(def.key)
    }
  }
}

// ---------------- 日志 / 通知 ----------------

function pushLog(level: LogEntry['level'], message: string, taskId?: number) {
  logs.push({ id: nextLogId++, ts: now(), level, message, taskId })
  if (logs.length > 500) logs.splice(0, logs.length - 500)
}

function pushNotification(kind: AppNotification['kind'], message: string) {
  notifications.unshift({ id: nextNotificationId++, ts: now(), kind, message, read: false })
  if (notifications.length > 50) notifications.pop()
}

function planEvent(plan: Plan, type: PlanEventType, detail: string) {
  plan.events.push({ ts: now(), type, detail })
}

// ---------------- planner：生成任务表 ----------------
// 子任务与 worker 执行单元严格一一对应；
// 轻量子任务派 3080（gpu-1），重推理派 3090（gpu-0）。

function buildSubtasks(): Subtask[] {
  return [
    { id: 's1', name: '扫描输入文件', status: 'pending', gpuId: 'gpu-1', progress: 0, retries: 0, replans: 0 },
    { id: 's2', name: '预处理 / 文本提取', status: 'pending', gpuId: 'gpu-1', progress: 0, retries: 0, replans: 0 },
    { id: 's3', name: '模型推理分析', status: 'pending', gpuId: 'gpu-0', progress: 0, retries: 0, replans: 0 },
    { id: 's4', name: '结果校验', status: 'pending', gpuId: 'gpu-1', progress: 0, retries: 0, replans: 0 },
    { id: 's5', name: '生成输出文件', status: 'pending', gpuId: 'gpu-0', progress: 0, retries: 0, replans: 0 },
  ]
}

function createPlan(task: Task): Plan {
  const plan: Plan = {
    id: nextPlanId++,
    taskId: task.id,
    version: 1,
    createdAt: now(),
    subtasks: buildSubtasks(),
    events: [],
  }
  planEvent(plan, 'created', `planner 生成计划 v1：${plan.subtasks.length} 个子任务（轻量 → 3080，推理 → 3090）`)
  plans.push(plan)
  pushLog('INFO', `任务 #${task.id}：planner 生成计划 v1，共 ${plan.subtasks.length} 个子任务`, task.id)
  return plan
}

export function getPlan(taskId: number): Plan | undefined {
  return plans.find((p) => p.taskId === taskId)
}

function syncTaskProgress(task: Task, plan: Plan) {
  const total = plan.subtasks.reduce((sum, s) => sum + s.progress, 0)
  task.progress = Math.round(total / plan.subtasks.length)
}

// ---------------- worker：执行与故障处理 ----------------

const TECH_FAILURES = ['读取文件超时', '临时显存抖动', '中间结果校验失败']

function tickSubtask(task: Task, plan: Plan) {
  const sub = plan.subtasks.find((s) => s.status === 'running') ?? plan.subtasks.find((s) => s.status === 'pending')
  if (!sub) {
    finishTask(task)
    return
  }
  if (sub.status === 'pending') {
    sub.status = 'running'
    const gpuName = sub.gpuId === 'gpu-0' ? 'GPU 0 · 3090' : 'GPU 1 · 3080'
    pushLog('INFO', `worker 开始「${sub.name}」（${gpuName}）`, task.id)
    planEvent(plan, 'dispatched', `子任务「${sub.name}」已派发 worker（${gpuName}）`)
    return
  }

  // worker 执行中：小概率技术性故障 → 先自愈重试，超限则回流 planner
  if (Math.random() < 0.05) {
    const failure = TECH_FAILURES[Math.floor(Math.random() * TECH_FAILURES.length)]
    if (sub.retries < MAX_SELF_RETRIES) {
      sub.retries++
      pushLog('WARN', `worker「${sub.name}」遇到技术性故障（${failure}），自动重试第 ${sub.retries} 次`, task.id)
    } else if (task.replanCount < MAX_REPLANS) {
      // 回流 planner：修订计划（版本 +1），把该子任务改派另一张显卡
      task.replanCount++
      sub.replans++
      task.status = 'replanning'
      pushLog('WARN', `worker 自愈失败，将「${sub.name}」回流给 planner`, task.id)
      planEvent(plan, 'blocked', `子任务「${sub.name}」技术性故障（${failure}），worker 自愈 ${MAX_SELF_RETRIES} 次失败，回流 planner`)
      setTimeout(() => {
        if (task.status !== 'replanning') return
        plan.version++
        sub.gpuId = sub.gpuId === 'gpu-0' ? 'gpu-1' : 'gpu-0'
        sub.retries = 0
        sub.error = undefined
        task.status = 'running'
        const target = sub.gpuId === 'gpu-0' ? 'GPU 0 · 3090' : 'GPU 1 · 3080'
        planEvent(plan, 'revised', `planner 修订计划 → v${plan.version}：「${sub.name}」改派 ${target}`)
        pushLog('INFO', `planner 修订计划 v${plan.version}：「${sub.name}」改派 ${target}`, task.id)
        emit()
      }, 2500)
    } else {
      // 回流 3 次仍未解决 → 升级给命令发起者决策
      task.status = 'awaiting_decision'
      sub.error = failure
      planEvent(plan, 'decision_required', `「${sub.name}」已回流 ${MAX_REPLANS} 次仍未解决，等待命令发起者决策`)
      pushLog('ERROR', `任务 #${task.id}：「${sub.name}」回流 ${MAX_REPLANS} 次仍未解决，等待发起者决策`, task.id)
      pushNotification('warning', `任务 #${task.id}「${task.name}」需要你决策：子任务「${sub.name}」多次失败。`)
    }
    return
  }

  // 正常推进
  sub.progress = Math.min(100, sub.progress + Math.round(rand(6, 14)))
  if (sub.progress >= 100) {
    sub.status = 'completed'
    pushLog('INFO', `子任务「${sub.name}」完成`, task.id)
  }
  syncTaskProgress(task, plan)
}

const RESULT_POOL: Array<Omit<ResultFile, 'id' | 'taskId' | 'createdAt'>> = [
  { name: 'report.docx', sizeKB: 486, contentPreview: '中文总结报告：共 12 页，包含摘要、分章节要点与结论。' },
  { name: 'summary.xlsx', sizeKB: 188, contentPreview: '结构化汇总表，含统计透视 sheet。' },
  { name: 'analysis.md', sizeKB: 24, contentPreview: '# 分析报告\n\n本次任务处理完成，关键结论如下……' },
  { name: 'result.pdf', sizeKB: 1024, contentPreview: '排版后的 PDF 报告，可直接打印分享。' },
]

function finishTask(t: Task) {
  t.progress = 100
  t.finishedAt = now()
  t.status = 'completed'
  t.resultSummary = '任务完成，结果文件已生成。'
  pushLog('INFO', `任务 #${t.id} 完成`, t.id)
  pushNotification('success', `任务 #${t.id} 已完成。`)
  const count = 1 + Math.floor(Math.random() * 2)
  const shuffled = [...RESULT_POOL].sort(() => Math.random() - 0.5)
  for (let i = 0; i < count; i++) {
    results.unshift({ id: nextResultId++, taskId: t.id, createdAt: now(), ...shuffled[i] })
  }
}

/** planner 判定任务成本：多文件或长指令视为高成本，需发起者批准 */
export function judgeNeedsApproval(input: CreateTaskInput): boolean {
  return (input.inputFiles?.length ?? 0) >= 3 || input.description.length >= 40
}

/** planner 规划定时器记录 */
const planningTimers = new Set<number>()

function tickPlanning(task: Task) {
  if (planningTimers.has(task.id)) return
  planningTimers.add(task.id)
  pushLog('INFO', `任务 #${task.id}：planner 正在评估难度并制定计划……`, task.id)
  setTimeout(() => {
    planningTimers.delete(task.id)
    if (task.status !== 'planning') return
    createPlan(task)
    if (task.needsApproval) {
      task.status = 'awaiting_approval'
      pushNotification('info', `任务 #${task.id}「${task.name}」的执行计划已生成，等待你批准。`)
      pushLog('INFO', `任务 #${task.id}：planner 判定为高成本任务，等待发起者批准`, task.id)
    } else {
      task.status = 'pending'
    }
    emit()
  }, 2500)
}

function jitterGpu(g: GPUStatus, busy: boolean) {
  const maxVram = g.vramTotalGB - 0.4
  g.utilPercent = Math.round(clamp(g.utilPercent + rand(-6, 6), busy ? 40 : 3, 99))
  g.tempC = Math.round(clamp(g.tempC + rand(-1.5, 1.5), 38, 84))
  g.vramUsedGB = Math.round(clamp(g.vramUsedGB + rand(-0.5, 0.5), busy ? g.vramTotalGB * 0.4 : 0.8, maxVram) * 10) / 10
}

function tick() {
  if (!server.online) return

  const running = tasks.filter((t) => t.status === 'running' || t.status === 'replanning')
  server.cpuPercent = Math.round(clamp(server.cpuPercent + rand(-4, 4), 8, 92))
  server.ramUsedGB = Math.round(clamp(server.ramUsedGB + rand(-0.4, 0.4), 9, 30) * 10) / 10

  // 双卡负载：按运行中任务的子任务分布决定
  const gpuBusy = { 'gpu-0': false, 'gpu-1': false }
  for (const t of running) {
    const plan = getPlan(t.id)
    const active = plan?.subtasks.find((s) => s.status === 'running')
    if (active) gpuBusy[active.gpuId as keyof typeof gpuBusy] = true
  }
  if (server.gpus[0]) jitterGpu(server.gpus[0], gpuBusy['gpu-0'] || running.length > 0)
  if (server.gpus[1]) jitterGpu(server.gpus[1], gpuBusy['gpu-1'])

  server.uptimeSec += 2
  server.lastSeenAt = now()

  // planner：规划中的任务
  for (const t of tasks.filter((x) => x.status === 'planning')) tickPlanning(t)

  // worker：推进运行中的任务
  for (const t of tasks.filter((x) => x.status === 'running')) {
    const plan = getPlan(t.id)
    if (plan) tickSubtask(t, plan)
  }

  // 启动等待中的任务（最多同时 2 个）
  if (running.length < 2) {
    const nextPending = tasks.filter((t) => t.status === 'pending').sort((a, b) => a.id - b.id)[0]
    if (nextPending) {
      nextPending.status = 'running'
      nextPending.startedAt = now()
      pushLog('INFO', `任务 #${nextPending.id} 开始执行（模型：${nextPending.model}）`, nextPending.id)
    }
  }

  refreshAlerts()
  emit()
}

let engineStarted = false

/** 启动模拟时钟（由 api 层首次调用时触发） */
export function ensureEngine() {
  if (engineStarted) return
  engineStarted = true
  setInterval(tick, 2000)
}

// ---------------- 供 api.ts 使用的底层存取 ----------------

export const db = {
  users,
  devices,
  models,
  invitations,
  get server() {
    return server
  },
  get tasks() {
    return tasks
  },
  get logs() {
    return logs
  },
  get results() {
    return results
  },
  get notifications() {
    return notifications
  },
  get alerts() {
    return alerts
  },
  get plans() {
    return plans
  },
  dismissAlert(id: number) {
    const idx = alerts.findIndex((a) => a.id === id)
    if (idx >= 0) {
      const def = currentAlertDefs().find((d) => d.metric === alerts[idx].metric)
      if (def) dismissedAlertKeys.add(def.key)
      alerts.splice(idx, 1)
    }
    emit()
  },
  createTask(input: CreateTaskInput, deviceName: string, userId: string, modelName: string): Task {
    const task: Task = {
      id: nextTaskId++,
      createdAt: now(),
      createdByDevice: deviceName,
      createdByUserId: userId,
      status: 'planning', // 新任务先交给 planner
      progress: 0,
      model: modelName,
      priority: 'normal',
      replanCount: 0,
      needsApproval: judgeNeedsApproval(input),
      ...input,
    }
    tasks.unshift(task)
    pushLog('INFO', `收到任务 #${task.id}「${task.name}」，已移交 planner`, task.id)
    emit()
    return task
  },
  addInvitation(inv: Omit<Invitation, 'id' | 'createdAt' | 'usedCount'>): Invitation {
    const full: Invitation = { ...inv, id: nextInvitationId++, createdAt: now(), usedCount: 0 }
    invitations.unshift(full)
    emit()
    return full
  },
  markNotificationsRead() {
    notifications.forEach((n) => (n.read = true))
    emit()
  },
}

// 重启 / 关机的 Mock 行为
export function mockRestart() {
  pushNotification('info', '服务器已重新启动。')
  pushLog('INFO', '收到重启指令，执行端正在重启……')
  server.online = false
  emit()
  setTimeout(() => {
    server.online = true
    server.uptimeSec = 0
    server.cpuPercent = 12
    server.gpus.forEach((g) => {
      g.utilPercent = 5
      g.tempC = 42
      g.vramUsedGB = 1.2
    })
    server.lastSeenAt = now()
    pushLog('INFO', '执行端已上线，服务正常。')
    emit()
  }, 5000)
}

export function mockShutdown() {
  pushLog('WARN', '收到关机指令，执行端即将离线。')
  pushNotification('info', '服务器已关闭。')
  server.online = false
  emit()
}
