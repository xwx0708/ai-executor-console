// 共享展示组件：状态徽标、指标条、页面标题、空状态

import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { displayStatus } from '@/types'
import type { DisplayTaskStatus, TaskStatus } from '@/types'

const DISPLAY_STATUS_MAP: Record<DisplayTaskStatus, { label: string; className: string }> = {
  awaiting_approval: { label: '待批准', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  pending: { label: '等待中', className: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
  running: { label: '执行中', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  completed: { label: '已完成', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  failed: { label: '已失败', className: 'bg-red-500/15 text-red-300 border-red-500/30' },
  cancelled: { label: '已取消', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
}

/** 任务状态徽标：内部阶段（规划中/改计划中/待决策）映射为精简的对外状态 */
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const display = displayStatus(status)
  const s = DISPLAY_STATUS_MAP[display]
  return (
    <Badge variant="outline" className={cn('font-normal', s.className)}>
      {display === 'running' && (
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
      )}
      {s.label}
    </Badge>
  )
}

export function OnlineBadge({ online }: { online: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal',
        online
          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          : 'bg-red-500/15 text-red-300 border-red-500/30',
      )}
    >
      <span
        className={cn(
          'mr-1.5 inline-block h-1.5 w-1.5 rounded-full',
          online ? 'animate-pulse bg-emerald-400' : 'bg-red-400',
        )}
      />
      {online ? '在线' : '离线'}
    </Badge>
  )
}

/** 指标进度条：用于 CPU / RAM / GPU / 显存 / 磁盘 */
export function MetricBar({
  label,
  valueText,
  percent,
  tone = 'auto',
}: {
  label: string
  valueText: string
  percent: number
  tone?: 'auto' | 'emerald' | 'sky'
}) {
  const color =
    tone === 'emerald'
      ? 'bg-emerald-400'
      : tone === 'sky'
        ? 'bg-sky-400'
        : percent >= 85
          ? 'bg-red-400'
          : percent >= 65
            ? 'bg-amber-400'
            : 'bg-emerald-400'
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{valueText}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-muted-foreground">
      {text}
    </div>
  )
}
