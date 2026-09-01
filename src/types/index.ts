// ============================================================
// 领域类型定义 —— 与未来真实后端 API 的 DTO 一一对应
// 替换真实后端时，这些类型应保持不变
// ============================================================

export type TaskStatus =
  | 'planning' // planner 正在制定计划
  | 'awaiting_approval' // 高成本计划，等待命令发起者批准
  | 'pending' // 排队等待
  | 'running' // worker 执行中
  | 'replanning' // worker 回流后，planner 正在修订计划
  | 'awaiting_decision' // 回流达到 3 次上限，等待命令发起者决策
  | 'completed'
  | 'failed'
  | 'cancelled'

/** 对外展示状态（精简版）：内部阶段映射为 6 种用户可见状态 */
export type DisplayTaskStatus =
  | 'awaiting_approval'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export function displayStatus(s: TaskStatus): DisplayTaskStatus {
  switch (s) {
    case 'awaiting_approval':
      return 'awaiting_approval'
    case 'planning':
    case 'awaiting_decision':
      return 'pending' // 等待中（等待资源或等待人）
    case 'running':
    case 'replanning':
      return 'running'
    default:
      return s
  }
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR'
export type DeviceType = 'windows-desktop' | 'windows-laptop' | 'ios'
export type NotificationKind = 'success' | 'error' | 'info' | 'warning'
export type ModelStatus = 'loaded' | 'available' | 'downloading'

/** 角色：拥有者（只有我一个）/ 成员。成员可被授予管理员权限，但本质上仍是成员 */
export type Role = 'owner' | 'member'

/** 单个 GPU 的实时状态（支持双卡） */
export interface GPUStatus {
  id: string // 'gpu-0' | 'gpu-1'
  name: string // 如 'NVIDIA GeForce RTX 3080'，换显卡后随真实硬件变化
  utilPercent: number
  tempC: number
  vramUsedGB: number
  vramTotalGB: number
}

/** GET /api/server/services */
export interface ServiceStatus {
  name: string
  label: string
  running: boolean
  detail: string
}

/** GET /api/server/status */
export interface ServerStatus {
  online: boolean
  os: string
  cpuPercent: number
  ramUsedGB: number
  ramTotalGB: number
  gpus: GPUStatus[] // 双卡时有两个元素
  disk: { usedGB: number; totalGB: number }
  uptimeSec: number
  lastSeenAt: string // ISO
}

/** 资源告警（顶部横幅）。GET /api/alerts */
export interface SystemAlert {
  id: number
  ts: string
  metric: string // 'CPU 使用率' | '内存' | 'GPU 0 使用率' | ...
  valueText: string // '92%'
  taskId?: number
  taskName?: string
}

export type TaskPriority = 'low' | 'normal' | 'high'

/** GET /api/tasks / GET /api/tasks/:id */
export interface Task {
  id: number
  name: string
  description: string
  input: string // 文件夹路径或文件列表摘要
  inputFiles?: string[] // 拖入的文件名
  createdAt: string
  createdByDevice: string
  createdByUserId: string
  status: TaskStatus
  progress: number // 0-100
  model: string // 由 planner 自动分配的模型
  priority: TaskPriority
  allowBackground: boolean
  gpuIds?: string[] // 执行时分配的显卡
  replanCount: number // 已回流修订次数（上限 3 次后升级为待决策）
  needsApproval: boolean // planner 判定为高成本，需命令发起者批准
  startedAt?: string
  finishedAt?: string
  resultSummary?: string
  error?: string
}

/** POST /api/tasks 的请求体 */
export interface CreateTaskInput {
  name: string
  description: string
  input: string
  inputFiles?: string[]
  allowBackground: boolean
}

// ---------------- planner / worker ----------------

export type SubtaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

/**
 * 子任务 —— 与 worker 完成的具体项目严格一一对应。
 * worker 出问题时按子任务回流给 planner，planner 据此定位环节。
 */
export interface Subtask {
  id: string
  name: string
  status: SubtaskStatus
  gpuId: string // 'gpu-0'（3090，主力推理）| 'gpu-1'（3080，轻量/辅助）
  progress: number
  retries: number // worker 技术性故障的自愈重试次数
  replans: number // 该子任务已回流的次数（上限 3）
  error?: string
}

export type PlanEventType =
  | 'created' // planner 生成计划 v1
  | 'approved' // 命令发起者批准
  | 'dispatched' // 子任务派发给 worker
  | 'blocked' // worker 回流：某子任务遇到问题
  | 'revised' // planner 修订计划（版本 +1）
  | 'decision_required' // 回流 3 次上限，升级给命令发起者
  | 'resumed' // 决策后继续

export interface PlanEvent {
  ts: string
  type: PlanEventType
  detail: string
}

/** GET /api/tasks/:id/plan */
export interface Plan {
  id: number
  taskId: number
  version: number
  createdAt: string
  subtasks: Subtask[]
  events: PlanEvent[]
}

/** 回流 3 次后，命令发起者的可选决策 */
export type DecisionChoice = 'retry' | 'skip' | 'cancel'

/** GET /api/logs / GET /api/tasks/:id/logs */
export interface LogEntry {
  id: number
  ts: string
  level: LogLevel
  message: string
  taskId?: number
}

/** GET /api/results / GET /api/tasks/:id/results */
export interface ResultFile {
  id: number
  taskId: number
  name: string
  sizeKB: number
  createdAt: string
  contentPreview: string
}

/** 模型运行显卡分配：单卡 0 / 单卡 1 / 双卡联合 */
export type GpuMode = 'gpu0' | 'gpu1' | 'dual'

/** GET /api/models */
export interface AIModel {
  id: string
  name: string
  sizeGB: number
  params: string
  status: ModelStatus
  running: boolean
  vramGB: number
  isDefault: boolean
  gpuMode: GpuMode
}

/** GET /api/devices */
export interface Device {
  id: string
  name: string
  type: DeviceType
  online: boolean
  lastSeenAt: string
  role: Role
  disabled: boolean
}

/** POST /api/invitations */
export interface Invitation {
  id: number
  code: string
  createdAt: string
  expiresAt: string
  maxUses: number
  usedCount: number
  /** 被邀请者加入后的角色（成员）及是否附带管理员权限 */
  adminGranted: boolean
}

/** GET /api/notifications */
export interface AppNotification {
  id: number
  ts: string
  kind: NotificationKind
  message: string
  read: boolean
}

/** GET /api/auth/me */
export interface User {
  id: string
  name: string
  isOwner: boolean
  adminGranted: boolean
}
