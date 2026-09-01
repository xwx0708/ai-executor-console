// 日志面板：供任务页抽屉 / 任务详情抽屉复用
// 传 taskId 时只显示该任务的日志，否则显示全部日志

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useQuery } from '@/hooks/useQuery'
import { getTaskLogs, listLogs } from '@/services/api'
import { formatDateTime } from '@/lib/format'
import { EmptyState } from '@/components/widgets'
import type { LogLevel } from '@/types'

const LEVELS: Array<{ value: LogLevel | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'INFO', label: 'INFO' },
  { value: 'WARN', label: 'WARN' },
  { value: 'ERROR', label: 'ERROR' },
]

export default function LogsPanel({ taskId }: { taskId?: number }) {
  const [level, setLevel] = useState<LogLevel | 'all'>('all')
  const { data: logs } = useQuery(
    () => (taskId ? getTaskLogs(taskId).then((l) => [...l].reverse()) : listLogs()),
    [taskId],
    { interval: 2000 },
  )

  const filtered = logs?.filter((l) => level === 'all' || l.level === level) ?? []

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-1.5">
        {LEVELS.map((l) => (
          <Button
            key={l.value}
            variant={level === l.value ? 'secondary' : 'ghost'}
            size="sm"
            className="min-h-9"
            onClick={() => setLevel(l.value)}
          >
            {l.label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="暂无日志" />
      ) : (
        <ScrollArea className="h-[55vh] flex-1 rounded-md bg-zinc-950">
          <div className="space-y-1 p-3 font-mono text-xs sm:text-sm">
            {filtered.map((l) => (
              <div key={l.id} className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-zinc-800/50 pb-1">
                <span className="shrink-0 text-muted-foreground">{formatDateTime(l.ts)}</span>
                <span
                  className={cn(
                    'w-12 shrink-0 font-semibold',
                    l.level === 'ERROR' && 'text-red-400',
                    l.level === 'WARN' && 'text-amber-400',
                    l.level === 'INFO' && 'text-sky-400',
                  )}
                >
                  {l.level}
                </span>
                <span className="min-w-0 flex-1 text-zinc-200">{l.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
