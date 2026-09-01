// 二、任务页面：全部任务 + 状态标签筛选 + 搜索（名称 / 编号 / 日期）+ 日志抽屉

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ScrollText, Search, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useQuery } from '@/hooks/useQuery'
import { getCurrentUser, isElevated, listTasks } from '@/services/api'
import { formatDateTime } from '@/lib/format'
import { EmptyState, PageHeader, TaskStatusBadge } from '@/components/widgets'
import LogsPanel from '@/components/LogsPanel'
import { displayStatus } from '@/types'
import type { DisplayTaskStatus, Task } from '@/types'

const FILTERS: Array<{ value: DisplayTaskStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'awaiting_approval', label: '待批准' },
  { value: 'pending', label: '等待中' },
  { value: 'running', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '已失败' },
  { value: 'cancelled', label: '已取消' },
]

/** 按名称 / #编号 / 日期时间匹配 */
function matchesQuery(t: Task, q: string): boolean {
  const query = q.trim().toLowerCase()
  if (!query) return true
  if (t.name.toLowerCase().includes(query)) return true
  const idText = query.replace(/^#/, '')
  if (/^\d+$/.test(idText) && String(t.id).includes(idText)) return true
  if (formatDateTime(t.createdAt).includes(query)) return true
  return false
}

export default function TasksPage() {
  const [filter, setFilter] = useState<DisplayTaskStatus | 'all'>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  // 一次取全部，本地按展示状态 + 搜索词过滤（内部阶段已映射为精简状态）
  const { data: tasks, loading } = useQuery(() => listTasks(), [], { interval: 3000 })
  const { data: currentUser } = useQuery(getCurrentUser)
  const elevated = currentUser ? isElevated(currentUser) : false

  const visible =
    tasks?.filter((t) => (filter === 'all' || displayStatus(t.status) === filter) && matchesQuery(t, query)) ?? []

  return (
    <div>
      <PageHeader
        title="任务"
        description="查看执行端上的全部任务"
        actions={
          <>
            {/* 日志：快捷查看过往记录（成员不可见） */}
            {elevated && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="min-h-10">
                    <ScrollText className="mr-1.5 h-4 w-4" /> 日志
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full bg-zinc-950 sm:max-w-xl">
                  <SheetHeader>
                    <SheetTitle>运行日志</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <LogsPanel />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <Button
              variant={searchOpen ? 'secondary' : 'outline'}
              className="min-h-10"
              onClick={() => {
                setSearchOpen((v) => !v)
                if (searchOpen) setQuery('')
              }}
            >
              <Search className="mr-1.5 h-4 w-4" /> 搜索
            </Button>
            <Button asChild className="min-h-10">
              <Link to="/tasks/new">新建任务</Link>
            </Button>
          </>
        }
      />

      {/* 搜索栏：打开后可按名称 / 编号 / 日期查找 */}
      {searchOpen && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="min-h-11 pl-9 pr-9"
            placeholder="按任务名称、编号（如 1024）或日期（如 2026/9/1）搜索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery('')}
              aria-label="清空搜索"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as DisplayTaskStatus | 'all')}>
        <TabsList className="mb-4 h-auto flex-wrap justify-start">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value} className="min-h-9">
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading && !tasks && <p className="text-sm text-muted-foreground">加载中……</p>}
      {tasks && visible.length === 0 && (
        <EmptyState text={query ? '没有匹配的任务' : '该状态下暂无任务'} />
      )}

      <div className="space-y-3">
        {visible.map((t) => (
          <Link key={t.id} to={`/tasks/${t.id}`}>
            <Card className="border-zinc-800 bg-zinc-900/50 transition-colors hover:border-zinc-700">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{t.id}</span>
                      <span className="truncate font-medium">{t.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      创建于 {formatDateTime(t.createdAt)} · 来自 {t.createdByDevice} · 模型 {t.model}
                    </p>
                  </div>
                  <TaskStatusBadge status={t.status} />
                </div>
                {['running', 'pending'].includes(displayStatus(t.status)) && (
                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={t.progress} className="h-1.5 flex-1 bg-zinc-800" />
                    <span className="w-10 text-right font-mono text-xs text-muted-foreground">
                      {t.progress}%
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
