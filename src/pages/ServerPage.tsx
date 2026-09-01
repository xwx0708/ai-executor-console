// 八、服务器管理页面：执行端状态（适配双 GPU）+ Mock 管理操作

import { useState } from 'react'
import { Activity, Power, PowerOff, RefreshCw, ScrollText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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
import { useQuery } from '@/hooks/useQuery'
import { getCurrentUser, getServerStatus, isElevated, listServices, restartServer, shutdownServer } from '@/services/api'
import { formatRelative, formatUptime } from '@/lib/format'
import { MetricBar, OnlineBadge, PageHeader } from '@/components/widgets'
import LogsPanel from '@/components/LogsPanel'

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm">{value}</p>
    </div>
  )
}

function shortGpuName(name: string): string {
  return name.replace(/^NVIDIA GeForce\s*/, '')
}

/** 服务状态弹窗：数据来自 GET /api/server/services（Mock） */
function ServiceStatusDialog() {
  const [open, setOpen] = useState(false)
  const { data: services, loading } = useQuery(() => listServices(), [], { interval: 4000 })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-12 justify-start">
          <Activity className="mr-2 h-4 w-4" />
          查看服务状态
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>执行端服务状态</DialogTitle>
          <DialogDescription>各服务的实时运行状态（Mock）</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {loading && !services && <p className="text-sm text-muted-foreground">加载中……</p>}
          {services?.map((s) => (
            <div key={s.name} className="flex items-center gap-3 rounded-md border border-zinc-800 px-3 py-2.5">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${s.running ? 'animate-pulse bg-emerald-400' : 'bg-red-400'}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {s.label} <span className="font-mono text-xs text-muted-foreground">{s.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">{s.detail}</p>
              </div>
              <Badge
                variant="outline"
                className={
                  s.running
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-300'
                }
              >
                {s.running ? '运行中' : '已停止'}
              </Badge>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function ServerPage() {
  const { data: server, reload } = useQuery(getServerStatus, [], { interval: 3000 })
  const { data: user } = useQuery(getCurrentUser)
  const [busy, setBusy] = useState<string | null>(null)

  // 成员无权访问服务器管理
  if (user && !isElevated(user)) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-muted-foreground">
        服务器管理仅对拥有者开放
      </div>
    )
  }

  async function runAction(key: string, fn: () => Promise<unknown>) {
    setBusy(key)
    try {
      await fn()
      await reload(true)
    } finally {
      setBusy(null)
    }
  }

  if (!server) return <p className="text-sm text-muted-foreground">加载中……</p>

  return (
    <div className="space-y-5">
      <PageHeader
        title="服务器管理"
        description="中国家中 Windows 执行端（所有操作当前均为 Mock）"
        actions={<OnlineBadge online={server.online} />}
      />

      {/* 指标总览 */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">硬件状态</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <MetricBar label="CPU · i5-12600KF / i7-12700KF" valueText={`${server.cpuPercent}%`} percent={server.cpuPercent} />
            <MetricBar
              label="内存"
              valueText={`${server.ramUsedGB} / ${server.ramTotalGB} GB`}
              percent={(server.ramUsedGB / server.ramTotalGB) * 100}
            />
            <MetricBar
              label="硬盘空间"
              valueText={`${server.disk.usedGB} / ${server.disk.totalGB} GB`}
              percent={(server.disk.usedGB / server.disk.totalGB) * 100}
            />
          </div>

          {/* 每张显卡一套指标 */}
          {server.gpus.map((g, i) => (
            <div key={g.id} className="space-y-4 rounded-lg border border-zinc-800 p-4">
              <p className="text-sm font-medium">
                GPU {i} · {shortGpuName(g.name)}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{g.tempC}°C</span>
              </p>
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <MetricBar label="使用率" valueText={`${g.utilPercent}%`} percent={g.utilPercent} tone="sky" />
                <MetricBar
                  label="显存"
                  valueText={`${g.vramUsedGB} / ${g.vramTotalGB} GB`}
                  percent={(g.vramUsedGB / g.vramTotalGB) * 100}
                  tone="sky"
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 系统信息 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoItem label="操作系统" value={server.os} />
        <InfoItem label="显卡" value={server.gpus.map((g) => shortGpuName(g.name)).join(' + ')} />
        <InfoItem label="系统运行时间" value={server.online ? formatUptime(server.uptimeSec) : '—'} />
        <InfoItem label="最后在线时间" value={formatRelative(server.lastSeenAt)} />
      </div>

      {/* 管理操作 */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">管理操作</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="min-h-12 justify-start"
            disabled={busy !== null}
            onClick={() => runAction('refresh', async () => reload(true))}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
            刷新状态
          </Button>

          {/* 查看系统日志：抽屉展示 */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="min-h-12 justify-start">
                <ScrollText className="mr-2 h-4 w-4" /> 查看系统日志
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full bg-zinc-950 sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>系统日志</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <LogsPanel />
              </div>
            </SheetContent>
          </Sheet>

          {/* 查看服务状态：弹窗展示执行端各服务（Mock） */}
          <ServiceStatusDialog />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="min-h-12 justify-start" disabled={!server.online || busy !== null}>
                <Power className="mr-2 h-4 w-4" /> 重启服务器
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>重启执行端？</AlertDialogTitle>
                <AlertDialogDescription>
                  执行端将短暂离线约 5 秒（Mock），运行中的任务会暂停。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => runAction('restart', restartServer)}>
                  确认重启
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="min-h-12 justify-start sm:col-span-2"
                disabled={!server.online || busy !== null}
              >
                <PowerOff className="mr-2 h-4 w-4" /> 关闭服务器
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>关闭执行端？</AlertDialogTitle>
                <AlertDialogDescription>
                  关机后执行端将离线，需要到现场或通过智能插座唤醒（Mock 操作，不会真正关机）。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => runAction('shutdown', shutdownServer)}>
                  确认关机
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
