// 一、控制台：执行端健康状态总览（支持双 GPU 动态渲染）

import { Link } from 'react-router-dom'
import { Cpu, Thermometer, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useQuery } from '@/hooks/useQuery'
import { getServerStatus, listTasks } from '@/services/api'
import { formatRelative } from '@/lib/format'
import { EmptyState, MetricBar, OnlineBadge, PageHeader } from '@/components/widgets'
import { displayStatus } from '@/types'
import type { GPUStatus } from '@/types'

/** 从完整型号名提取短名：'NVIDIA GeForce RTX 3080' → 'RTX 3080' */
function shortGpuName(name: string): string {
  return name.replace(/^NVIDIA GeForce\s*/, '')
}

/** 单个 GPU 的一组指标 */
function GpuBlock({ gpu, index }: { gpu: GPUStatus; index: number }) {
  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          GPU {index} · {shortGpuName(gpu.name)}
        </span>
        <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <Thermometer className="h-3.5 w-3.5" />
          <span className={gpu.tempC >= 82 ? 'text-red-400' : ''}>{gpu.tempC}°C</span>
        </span>
      </div>
      <MetricBar label="GPU 使用率" valueText={`${gpu.utilPercent}%`} percent={gpu.utilPercent} tone="sky" />
      <MetricBar
        label="GPU 显存"
        valueText={`${gpu.vramUsedGB} / ${gpu.vramTotalGB} GB`}
        percent={(gpu.vramUsedGB / gpu.vramTotalGB) * 100}
        tone="sky"
      />
    </div>
  )
}

export default function DashboardPage() {
  const { data: server } = useQuery(getServerStatus, [], { interval: 3000 })
  const { data: tasks } = useQuery(() => listTasks(), [], { interval: 3000 })

  const runningTasks = tasks?.filter((t) => displayStatus(t.status) === 'running') ?? []

  // 标题副标题：OS 与显卡型号全部来自执行端上报的数据，换卡后自动跟随
  const subtitle = server
    ? `中国家中执行端 · ${server.os} · ${server.gpus.map((g) => shortGpuName(g.name)).join(' + ')}`
    : '中国家中执行端'

  return (
    <div className="space-y-5">
      <PageHeader title="控制台" description={subtitle} />

      {/* 服务器状态卡片 */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-emerald-400" />
              执行端状态
            </CardTitle>
            <OnlineBadge online={server?.online ?? false} />
          </div>
          <p className="text-xs text-muted-foreground">{server?.os ?? '—'}</p>
        </CardHeader>
        <CardContent>
          {!server?.online ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              执行端当前离线，等待重新连接……
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <MetricBar label="CPU 使用率" valueText={`${server.cpuPercent}%`} percent={server.cpuPercent} />
                <MetricBar
                  label="内存"
                  valueText={`${server.ramUsedGB} / ${server.ramTotalGB} GB`}
                  percent={(server.ramUsedGB / server.ramTotalGB) * 100}
                />
              </div>

              {/* 每个 GPU 一套指标，双卡时自动渲染两套 */}
              <div className="grid gap-4 sm:grid-cols-2">
                {server.gpus.map((g, i) => (
                  <GpuBlock key={g.id} gpu={g} index={i} />
                ))}
              </div>
            </div>
          )}

          {server?.online && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-zinc-800 pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" /> 运行任务
                <span className="font-mono text-foreground">{runningTasks.length}</span>
              </span>
              <span>
                最后心跳 <span className="font-mono text-foreground">{formatRelative(server.lastSeenAt)}</span>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 当前任务 */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">当前任务</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {runningTasks.length === 0 && <EmptyState text="当前没有正在执行的任务" />}
          {runningTasks.map((t) => (
            <Link
              key={t.id}
              to={`/tasks/${t.id}`}
              className="block rounded-lg border border-zinc-800 p-4 transition-colors hover:border-zinc-700"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">「{t.name}」</span>
                <span className="font-mono text-sm text-sky-300">{t.progress}%</span>
              </div>
              <Progress value={t.progress} className="h-2 bg-zinc-800" />
              <p className="mt-2 text-xs text-muted-foreground">
                #{t.id} · 模型 {t.model}
                {t.gpuIds && t.gpuIds.length > 0 && ` · ${t.gpuIds.length > 1 ? '双卡联合' : t.gpuIds[0]}`}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
