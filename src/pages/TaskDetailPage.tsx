// 四、任务详情页面：完整信息 + 实时进度 + 执行计划（planner/worker）+ 日志 + 输出

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, CheckCheck, Download, FileText, GitBranch, ShieldQuestion } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useQuery } from '@/hooks/useQuery'
import {
  approvePlan,
  cancelTask,
  downloadResult,
  getCurrentUser,
  getTask,
  getTaskPlan,
  getTaskResults,
  isElevated,
  rejectPlan,
  resolveTaskDecision,
} from '@/services/api'
import { formatDateTime, formatSize, formatTime } from '@/lib/format'
import { EmptyState, PageHeader, TaskStatusBadge } from '@/components/widgets'
import LogsPanel from '@/components/LogsPanel'
import type { DecisionChoice, Plan, Subtask } from '@/types'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-1 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

const SUBTASK_STATUS: Record<Subtask['status'], { label: string; className: string }> = {
  pending: { label: '排队', className: 'border-zinc-700 text-muted-foreground' },
  running: { label: '执行中', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  completed: { label: '完成', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  failed: { label: '失败', className: 'border-red-500/30 bg-red-500/10 text-red-300' },
  skipped: { label: '已跳过', className: 'border-zinc-700 text-muted-foreground line-through' },
}

const EVENT_COLOR: Record<string, string> = {
  created: 'text-violet-300',
  approved: 'text-emerald-300',
  dispatched: 'text-zinc-300',
  blocked: 'text-amber-300',
  revised: 'text-violet-300',
  decision_required: 'text-red-300',
  resumed: 'text-emerald-300',
}

function gpuLabel(gpuId: string): string {
  return gpuId === 'gpu-0' ? 'GPU 0 · 3090' : 'GPU 1 · 3080'
}

/** 执行计划卡：任务表 + 计划事件时间线 */
function PlanCard({ plan }: { plan: Plan }) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-violet-300" /> 执行计划
          </CardTitle>
          <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 font-mono text-violet-300">
            v{plan.version}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          planner 制定 · worker 执行 · 子任务与 worker 执行单元一一对应
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 任务表 */}
        <div className="space-y-2">
          {plan.subtasks.map((s, i) => (
            <div key={s.id} className="rounded-md border border-zinc-800 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                <Badge variant="outline" className={cn('text-xs font-normal', SUBTASK_STATUS[s.status].className)}>
                  {SUBTASK_STATUS[s.status].label}
                </Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono">{gpuLabel(s.gpuId)}</span>
                {s.retries > 0 && <span>worker 自愈重试 {s.retries} 次</span>}
                {s.replans > 0 && <span className="text-amber-400">已回流 {s.replans} / 3 次</span>}
                {s.error && <span className="text-red-400">{s.error}</span>}
              </div>
              {(s.status === 'running' || s.progress > 0) && s.status !== 'skipped' && (
                <Progress value={s.progress} className="mt-2 h-1 bg-zinc-800" />
              )}
            </div>
          ))}
        </div>

        {/* 计划事件时间线 */}
        {plan.events.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">计划动态</p>
            <div className="space-y-1.5 border-l border-zinc-800 pl-3">
              {plan.events.map((e, i) => (
                <p key={i} className="text-xs">
                  <span className="font-mono text-muted-foreground">{formatTime(e.ts)} </span>
                  <span className={EVENT_COLOR[e.type] ?? 'text-zinc-300'}>{e.detail}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const taskId = Number(id)
  const [toast, setToast] = useState<string | null>(null)

  const { data: task, reload } = useQuery(() => getTask(taskId), [taskId], { interval: 2000 })
  const { data: plan } = useQuery(() => getTaskPlan(taskId), [taskId], { interval: 2000 })
  const { data: results } = useQuery(() => getTaskResults(taskId), [taskId])
  const { data: currentUser } = useQuery(getCurrentUser)

  if (!task) {
    return <p className="text-sm text-muted-foreground">加载中……</p>
  }

  const cancellable = ['pending', 'running', 'replanning', 'planning', 'awaiting_approval', 'awaiting_decision'].includes(
    task.status,
  )
  // 只有命令发起者本人（或拥有者）能批准 / 决策
  const canDecide = currentUser?.isOwner || currentUser?.id === task.createdByUserId
  const failedSub = plan?.subtasks.find((s) => s.error)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function decide(choice: DecisionChoice) {
    await resolveTaskDecision(taskId, choice)
    showToast('已按你的决策处理')
    reload()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={task.name}
        description={`任务 #${task.id}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/tasks">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> 返回任务列表
              </Link>
            </Button>
            {cancellable && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Ban className="mr-1.5 h-4 w-4" /> 取消任务
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>取消任务 #{task.id}？</AlertDialogTitle>
                    <AlertDialogDescription>
                      该操作会通知执行端停止此任务（当前为 Mock 行为）。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>再想想</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await cancelTask(taskId)
                        reload()
                      }}
                    >
                      确认取消
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        }
      />

      {toast && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
          {toast}
        </div>
      )}

      {/* 待批准：高成本计划需命令发起者点头 */}
      {task.status === 'awaiting_approval' && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <ShieldQuestion className="h-6 w-6 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-200">planner 判定这是高成本任务，计划已生成</p>
              <p className="text-xs text-amber-300/80">
                预计占用较多 GPU 资源。{canDecide ? '请审阅下方执行计划后决定是否批准。' : '等待命令发起者批准。'}
              </p>
            </div>
            {canDecide && (
              <div className="flex gap-2">
                <Button
                  className="min-h-10"
                  onClick={async () => {
                    await approvePlan(taskId)
                    showToast('已批准，任务进入队列')
                    reload()
                  }}
                >
                  <CheckCheck className="mr-1.5 h-4 w-4" /> 批准执行
                </Button>
                <Button
                  variant="outline"
                  className="min-h-10"
                  onClick={async () => {
                    await rejectPlan(taskId)
                    showToast('已拒绝，任务取消')
                    reload()
                  }}
                >
                  拒绝
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 待决策：回流 3 次仍未解决 */}
      {task.status === 'awaiting_decision' && (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ShieldQuestion className="mt-0.5 h-6 w-6 shrink-0 text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-red-200">
                  子任务「{failedSub?.name ?? '未知'}」回流 3 次仍未解决
                </p>
                <p className="mt-1 text-xs text-red-300/80">
                  worker 自愈与 planner 三次修订均未成功（{failedSub?.error ?? '未知错误'}），需要你决策：
                </p>
                {canDecide && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button className="min-h-10" onClick={() => decide('retry')}>
                      继续尝试
                    </Button>
                    <Button variant="outline" className="min-h-10" onClick={() => decide('skip')}>
                      跳过该子任务
                    </Button>
                    <Button variant="destructive" className="min-h-10" onClick={() => decide('cancel')}>
                      取消任务
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 进度 */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <TaskStatusBadge status={task.status} />
            <span className="font-mono text-lg text-sky-300">{task.progress}%</span>
          </div>
          <Progress value={task.progress} className="h-2.5 bg-zinc-800" />
          {task.replanCount > 0 && (
            <p className="mt-2 text-xs text-amber-400">已回流修订 {task.replanCount} / 3 次</p>
          )}
          {task.error && (
            <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {task.error}
            </p>
          )}
          {task.resultSummary && <p className="mt-3 text-sm text-emerald-300">{task.resultSummary}</p>}
        </CardContent>
      </Card>

      {/* 执行计划 */}
      {plan && <PlanCard plan={plan} />}

      {/* 基本信息 */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">任务信息</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="任务 ID" value={<span className="font-mono">#{task.id}</span>} />
          <Separator className="bg-zinc-800" />
          <InfoRow label="创建时间" value={formatDateTime(task.createdAt)} />
          <Separator className="bg-zinc-800" />
          <InfoRow label="任务来源" value={task.createdByDevice} />
          <Separator className="bg-zinc-800" />
          <InfoRow label="使用的模型" value={task.model} />
          <Separator className="bg-zinc-800" />
          <InfoRow
            label="分配显卡"
            value={
              task.gpuIds && task.gpuIds.length > 0
                ? task.gpuIds.map((g) => gpuLabel(g)).join(' + ')
                : '待 planner 分配'
            }
          />
          <Separator className="bg-zinc-800" />
          <InfoRow label="后台执行" value={task.allowBackground ? '允许' : '不允许'} />
          <Separator className="bg-zinc-800" />
          <InfoRow label="开始时间" value={task.startedAt ? formatDateTime(task.startedAt) : '—'} />
          <Separator className="bg-zinc-800" />
          <InfoRow label="完成时间" value={task.finishedAt ? formatDateTime(task.finishedAt) : '—'} />
          <Separator className="bg-zinc-800" />
          <div className="py-1.5 text-sm">
            <span className="text-muted-foreground">输入内容</span>
            <p className="mt-1 rounded-md bg-zinc-950 p-3 font-mono text-xs">{task.input}</p>
            {task.inputFiles && task.inputFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {task.inputFiles.map((f) => (
                  <span key={f} className="rounded bg-zinc-950 px-2 py-1 font-mono text-xs text-muted-foreground">
                    {f}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-muted-foreground">指令</p>
            <p className="mt-1 rounded-md bg-zinc-950 p-3 text-sm">{task.description}</p>
          </div>
        </CardContent>
      </Card>

      {/* 运行日志（成员不可见） */}
      {currentUser && isElevated(currentUser) && (
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">运行日志</CardTitle>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="min-h-9">
                    查看完整日志
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full bg-zinc-950 sm:max-w-xl">
                  <SheetHeader>
                    <SheetTitle>任务 #{task.id} 日志</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <LogsPanel taskId={task.id} />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </CardHeader>
          <CardContent>
            <LogsPanel taskId={task.id} />
          </CardContent>
        </Card>
      )}

      {/* 输出结果 */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">输出结果</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!results || results.length === 0 ? (
            <EmptyState text={task.status === 'completed' ? '暂无结果文件' : '任务完成后将在此显示输出'} />
          ) : (
            results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(r.sizeKB)}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const res = await downloadResult(r.id)
                    showToast(`已开始下载 ${res.name}（Mock）`)
                  }}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> 下载
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="text-center">
        <Button variant="ghost" className="text-muted-foreground" onClick={() => navigate('/results')}>
          前往输出页面
        </Button>
      </div>
    </div>
  )
}
