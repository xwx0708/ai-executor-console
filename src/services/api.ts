// ============================================================
// API Service 层 —— 前端与后端之间的唯一边界
//
// 当前实现：调用本地 Mock 数据引擎（services/store.ts），
// 并模拟 120–400ms 网络延迟。
//
// 第二阶段替换真实后端时：
//   1. 保留本文件的函数签名与返回类型不变
//   2. 把函数体改为 fetch(BASE_URL + 对应端点)
//   3. UI 组件无需任何修改
//
// 每个函数上方标注了对应的 REST 端点。
// ============================================================

import { db, ensureEngine, mockRestart, mockShutdown } from './store'
import type {
  AIModel,
  AppNotification,
  CreateTaskInput,
  DecisionChoice,
  Device,
  GpuMode,
  Invitation,
  LogEntry,
  Plan,
  ResultFile,
  ServerStatus,
  ServiceStatus,
  SystemAlert,
  Task,
  TaskStatus,
  User,
} from '@/types'

// ---------- Mock 用户身份（未来由登录态 / Token 取代） ----------

let currentUserId = 'u-owner'

function currentUser(): User {
  const u = db.users.find((x) => x.id === currentUserId)
  if (!u) throw new Error('当前用户不存在')
  return u
}

/** 有效管理权限：拥有者本人，或被授予管理员权限的成员 */
export function isElevated(u: User): boolean {
  return u.isOwner || u.adminGranted
}

function requireElevated() {
  if (!isElevated(currentUser())) {
    throw new Error('权限不足：该操作需要管理员权限')
  }
}

// ---------- 模拟网络延迟 ----------

function delay<T>(value: T): Promise<T> {
  const ms = 120 + Math.random() * 280
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

// ---------- 认证 / 用户 ----------

/** GET /api/auth/me */
export async function getCurrentUser(): Promise<User> {
  ensureEngine()
  return delay({ ...currentUser() })
}

/** POST /api/auth/mock-switch（仅原型阶段存在的 Mock 接口：'owner' | 'member'） */
export async function switchMockRole(role: 'owner' | 'member'): Promise<User> {
  currentUserId = role === 'owner' ? 'u-owner' : 'u-member'
  return delay({ ...currentUser() })
}

/** GET /api/users */
export async function listUsers(): Promise<User[]> {
  requireElevated()
  return delay(JSON.parse(JSON.stringify(db.users)))
}

/** POST /api/users/:id/admin-grant —— 只有拥有者本人可以授予 / 收回管理员权限 */
export async function setAdminGranted(userId: string, granted: boolean): Promise<User | null> {
  const me = currentUser()
  if (!me.isOwner) throw new Error('只有拥有者可以授予管理员权限')
  const u = db.users.find((x) => x.id === userId)
  if (!u) return delay(null)
  if (u.isOwner) throw new Error('不能修改拥有者的权限')
  u.adminGranted = granted
  return delay({ ...u })
}

/** POST /api/invitations/redeem（成员输入邀请码绑定设备，Mock） */
export async function redeemInvitation(code: string): Promise<{ ok: true }> {
  const inv = db.invitations.find((x) => x.code === code.trim().toUpperCase())
  if (!inv) throw new Error('邀请码无效或已过期（Mock 校验）')
  if (inv.usedCount >= inv.maxUses) throw new Error('该邀请码的使用次数已用完')
  inv.usedCount += 1
  return delay({ ok: true })
}

// ---------- 服务器 ----------

/** GET /api/server/status */
export async function getServerStatus(): Promise<ServerStatus> {
  ensureEngine()
  return delay(JSON.parse(JSON.stringify(db.server)))
}

/** GET /api/server/services —— 执行端上各服务的运行状态 */
export async function listServices(): Promise<ServiceStatus[]> {
  requireElevated()
  ensureEngine()
  const online = db.server.online
  return delay([
    { name: 'executor-agent', label: '执行端代理', running: online, detail: '心跳上报 · 指令接收' },
    { name: 'planner', label: 'planner 规划器', running: online, detail: '任务评估 · 计划制定与修订' },
    { name: 'worker', label: 'worker 执行器', running: online, detail: '子任务执行 · 故障自愈与回流' },
  ])
}

/** POST /api/server/restart */
export async function restartServer(): Promise<{ ok: true }> {
  requireElevated()
  mockRestart()
  return delay({ ok: true })
}

/** POST /api/server/shutdown */
export async function shutdownServer(): Promise<{ ok: true }> {
  requireElevated()
  mockShutdown()
  return delay({ ok: true })
}

// ---------- 资源告警 ----------

/** GET /api/alerts —— 当前活跃的告警 */
export async function listAlerts(): Promise<SystemAlert[]> {
  ensureEngine()
  return delay(JSON.parse(JSON.stringify(db.alerts)))
}

/** POST /api/alerts/:id/dismiss */
export async function dismissAlert(id: number): Promise<{ ok: true }> {
  db.dismissAlert(id)
  return delay({ ok: true })
}

// ---------- 任务 ----------

/** GET /api/tasks?status= */
export async function listTasks(status?: TaskStatus): Promise<Task[]> {
  ensureEngine()
  const user = currentUser()
  let list = [...db.tasks]
  if (!isElevated(user)) {
    list = list.filter((t) => t.createdByUserId === user.id)
  }
  if (status) list = list.filter((t) => t.status === status)
  return delay(JSON.parse(JSON.stringify(list)))
}

/** POST /api/tasks —— 模型与显卡分配由 planner 决定，前端不指定 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  ensureEngine()
  const deviceName = /Mobi|Android|iPhone/i.test(navigator.userAgent)
    ? 'iPhone · 英国'
    : '联想笔记本 · 英国'
  const defaultModel = db.models.find((m) => m.isDefault)?.name ?? db.models[0]?.name ?? '默认模型'
  const task = db.createTask(input, deviceName, currentUser().id, defaultModel)
  return delay({ ...task })
}

/** GET /api/tasks/:id */
export async function getTask(id: number): Promise<Task | null> {
  ensureEngine()
  const t = db.tasks.find((x) => x.id === id) ?? null
  return delay(t ? JSON.parse(JSON.stringify(t)) : null)
}

/** POST /api/tasks/:id/cancel */
export async function cancelTask(id: number): Promise<Task | null> {
  const t = db.tasks.find((x) => x.id === id)
  if (t && ['pending', 'running', 'replanning', 'planning', 'awaiting_approval', 'awaiting_decision'].includes(t.status)) {
    t.status = 'cancelled'
    t.finishedAt = new Date().toISOString()
    db.notifications.unshift({
      id: Date.now(),
      ts: new Date().toISOString(),
      kind: 'info',
      message: `任务 #${t.id} 已取消。`,
      read: false,
    })
  }
  return delay(t ? { ...t } : null)
}

/** GET /api/tasks/:id/logs */
export async function getTaskLogs(id: number): Promise<LogEntry[]> {
  ensureEngine()
  return delay(JSON.parse(JSON.stringify(db.logs.filter((l) => l.taskId === id))))
}

// ---------- planner / worker ----------

/** GET /api/tasks/:id/plan */
export async function getTaskPlan(id: number): Promise<Plan | null> {
  ensureEngine()
  const p = db.plans.find((x) => x.taskId === id) ?? null
  return delay(p ? JSON.parse(JSON.stringify(p)) : null)
}

/** POST /api/tasks/:id/plan/approve —— 命令发起者批准高成本计划 */
export async function approvePlan(id: number): Promise<Task | null> {
  const t = db.tasks.find((x) => x.id === id)
  if (!t) return delay(null)
  if (t.status !== 'awaiting_approval') throw new Error('该任务当前不在待批准状态')
  t.status = 'pending'
  const plan = db.plans.find((p) => p.taskId === id)
  if (plan) plan.events.push({ ts: new Date().toISOString(), type: 'approved', detail: '命令发起者批准了计划，任务进入队列' })
  return delay({ ...t })
}

/** POST /api/tasks/:id/plan/reject —— 拒绝执行计划（任务取消） */
export async function rejectPlan(id: number): Promise<Task | null> {
  const t = db.tasks.find((x) => x.id === id)
  if (!t) return delay(null)
  if (t.status !== 'awaiting_approval') throw new Error('该任务当前不在待批准状态')
  t.status = 'cancelled'
  t.finishedAt = new Date().toISOString()
  return delay({ ...t })
}

/**
 * POST /api/tasks/:id/decision —— 回流 3 次后由命令发起者决策
 * retry：重置重试计数，继续执行
 * skip：跳过出问题的子任务，继续后续环节
 * cancel：取消整个任务
 */
export async function resolveTaskDecision(id: number, choice: DecisionChoice): Promise<Task | null> {
  const t = db.tasks.find((x) => x.id === id)
  if (!t) return delay(null)
  if (t.status !== 'awaiting_decision') throw new Error('该任务当前不在待决策状态')
  const plan = db.plans.find((p) => p.taskId === id)
  const failedSub = plan?.subtasks.find((s) => s.error)
  const label = { retry: '继续尝试', skip: '跳过该子任务', cancel: '取消任务' }[choice]

  if (choice === 'cancel') {
    t.status = 'cancelled'
    t.finishedAt = new Date().toISOString()
  } else {
    if (failedSub) {
      if (choice === 'skip') {
        failedSub.status = 'skipped'
        failedSub.progress = 100
      } else {
        failedSub.status = 'pending'
        failedSub.progress = 0
        failedSub.retries = 0
      }
      failedSub.error = undefined
    }
    t.replanCount = 0
    t.status = 'running'
  }
  if (plan) {
    plan.events.push({
      ts: new Date().toISOString(),
      type: choice === 'cancel' ? 'decision_required' : 'resumed',
      detail: `命令发起者决策：${label}`,
    })
  }
  db.notifications.unshift({
    id: Date.now(),
    ts: new Date().toISOString(),
    kind: 'info',
    message: `任务 #${t.id} 已按你的决策「${label}」处理。`,
    read: false,
  })
  return delay({ ...t })
}

/** GET /api/tasks/:id/results */
export async function getTaskResults(id: number): Promise<ResultFile[]> {
  ensureEngine()
  return delay(JSON.parse(JSON.stringify(db.results.filter((r) => r.taskId === id))))
}

// ---------- 日志 ----------

/** GET /api/logs */
export async function listLogs(): Promise<LogEntry[]> {
  ensureEngine()
  return delay(JSON.parse(JSON.stringify([...db.logs].reverse())))
}

// ---------- 结果文件（输出） ----------

/** GET /api/results */
export async function listResults(): Promise<ResultFile[]> {
  ensureEngine()
  const user = currentUser()
  let list = [...db.results]
  if (!isElevated(user)) {
    const myTaskIds = new Set(db.tasks.filter((t) => t.createdByUserId === user.id).map((t) => t.id))
    list = list.filter((r) => myTaskIds.has(r.taskId))
  }
  return delay(JSON.parse(JSON.stringify(list)))
}

/** GET /api/results/:id/download（Mock：返回下载动作已触发） */
export async function downloadResult(id: number): Promise<{ ok: true; name: string }> {
  const r = db.results.find((x) => x.id === id)
  if (!r) throw new Error('结果文件不存在')
  return delay({ ok: true, name: r.name })
}

/** DELETE /api/results/:id */
export async function deleteResult(id: number): Promise<{ ok: true }> {
  const idx = db.results.findIndex((x) => x.id === id)
  if (idx >= 0) db.results.splice(idx, 1)
  return delay({ ok: true })
}

// ---------- AI 模型（后端接通后自动发现） ----------

/** GET /api/models */
export async function listModels(): Promise<AIModel[]> {
  ensureEngine()
  return delay(JSON.parse(JSON.stringify(db.models)))
}

/** POST /api/models/:id/default */
export async function setDefaultModel(id: string): Promise<{ ok: true }> {
  requireElevated()
  db.models.forEach((m) => (m.isDefault = m.id === id))
  return delay({ ok: true })
}

/** POST /api/models/:id/gpu-mode —— 分配运行显卡：gpu0 / gpu1 / dual */
export async function setModelGpuMode(id: string, mode: GpuMode): Promise<AIModel | null> {
  requireElevated()
  const m = db.models.find((x) => x.id === id)
  if (!m) return delay(null)
  m.gpuMode = mode
  return delay({ ...m })
}

/** POST /api/models/:id/start | /stop（Mock：切换运行状态与显存占用） */
export async function toggleModelRunning(id: string): Promise<AIModel | null> {
  requireElevated()
  const m = db.models.find((x) => x.id === id)
  if (!m) return delay(null)
  if (m.running) {
    m.running = false
    m.status = 'available'
    m.vramGB = 0
  } else {
    m.running = true
    m.status = 'loaded'
    m.vramGB = Math.round(m.sizeGB * 0.8 * 10) / 10
  }
  return delay({ ...m })
}

// ---------- 设备与用户 ----------

/** GET /api/devices */
export async function listDevices(): Promise<Device[]> {
  requireElevated()
  return delay(JSON.parse(JSON.stringify(db.devices)))
}

/** POST /api/devices/:id/disable */
export async function toggleDeviceDisabled(id: string): Promise<Device | null> {
  requireElevated()
  const d = db.devices.find((x) => x.id === id)
  if (d) d.disabled = !d.disabled
  return delay(d ? { ...d } : null)
}

/** DELETE /api/devices/:id */
export async function removeDevice(id: string): Promise<{ ok: true }> {
  requireElevated()
  const idx = db.devices.findIndex((x) => x.id === id)
  if (idx >= 0) db.devices.splice(idx, 1)
  return delay({ ok: true })
}

// ---------- 邀请密钥 ----------

/** GET /api/invitations */
export async function listInvitations(): Promise<Invitation[]> {
  requireElevated()
  return delay(JSON.parse(JSON.stringify(db.invitations)))
}

/** POST /api/invitations */
export async function createInvitation(opts: {
  validHours: number
  maxUses: number
  adminGranted: boolean
}): Promise<Invitation> {
  requireElevated()
  const seg = () =>
    Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[01]/g, 'X')
  const inv = db.addInvitation({
    code: `${seg()}-${seg()}-${seg()}`,
    expiresAt: new Date(Date.now() + opts.validHours * 3600_000).toISOString(),
    maxUses: opts.maxUses,
    adminGranted: opts.adminGranted,
  })
  return delay({ ...inv })
}

// ---------- 通知 ----------

/** GET /api/notifications */
export async function listNotifications(): Promise<AppNotification[]> {
  ensureEngine()
  return delay(JSON.parse(JSON.stringify(db.notifications)))
}

/** POST /api/notifications/read-all */
export async function markAllNotificationsRead(): Promise<{ ok: true }> {
  db.markNotificationsRead()
  return delay({ ok: true })
}
