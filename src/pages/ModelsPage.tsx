// 七、AI 模型页面：管理执行端上的本地模型
// 后端接通后模型列表由执行端自动发现；显卡分配由 planner 规划、worker 调度，
// 这里提供分配意图的设置入口（Mock）

import { Bot, CirclePlay, CircleStop, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useQuery } from '@/hooks/useQuery'
import {
  getCurrentUser,
  getServerStatus,
  isElevated,
  listModels,
  setDefaultModel,
  setModelGpuMode,
  toggleModelRunning,
} from '@/services/api'
import { PageHeader } from '@/components/widgets'
import type { GpuMode } from '@/types'

const STATUS_LABEL = { loaded: '已加载', available: '可用', downloading: '下载中' } as const

export default function ModelsPage() {
  const { data: models, reload } = useQuery(listModels, [], { interval: 4000 })
  const { data: server } = useQuery(getServerStatus, [], { interval: 4000 })
  const { data: user } = useQuery(getCurrentUser)
  const elevated = user ? isElevated(user) : false
  const gpuCount = server?.gpus.length ?? 1

  // 显卡显示名全部来自执行端上报数据，换卡后自动跟随
  const gpuName = (idx: number) => server?.gpus[idx]?.name.replace(/^NVIDIA GeForce\s*/, '') ?? `GPU ${idx}`
  const gpuFullName = (idx: number) => server?.gpus[idx]?.name ?? `GPU ${idx}`

  function gpuModeLabel(mode: GpuMode): string {
    if (mode === 'dual') return '双卡联合'
    return mode === 'gpu0' ? `GPU 0 · ${gpuName(0)}` : `GPU 1 · ${gpuName(1)}`
  }

  // 成员无权访问模型管理
  if (user && !elevated) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-muted-foreground">
        AI 模型管理仅对拥有者开放
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="AI 模型"
        description="后端接通后由执行端自动发现本地模型；运行调度由 planner 规划、worker 执行（当前为 Mock）"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {models?.map((m) => (
          <Card key={m.id} className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Bot className="h-5 w-5 shrink-0 text-emerald-400" />
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      参数 {m.params} · 大小 {m.sizeGB} GB
                    </p>
                  </div>
                </div>
                {m.isDefault && (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                    <Star className="mr-1 h-3 w-3" /> 默认
                  </Badge>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-zinc-700 text-muted-foreground">
                  {STATUS_LABEL[m.status]}
                </Badge>
                {m.running ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    正在运行 · {gpuModeLabel(m.gpuMode)} · 显存 {m.vramGB} GB
                    {m.gpuMode === 'dual' && ' / 卡'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-zinc-700 text-muted-foreground">
                    未运行
                  </Badge>
                )}
              </div>

              {elevated && (
                <div className="mt-4 space-y-2">
                  {/* 显卡分配：双卡机器上可单卡 / 双卡联合 */}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground">运行显卡</span>
                    <Select
                      value={m.gpuMode}
                      onValueChange={async (v) => {
                        await setModelGpuMode(m.id, v as GpuMode)
                        reload()
                      }}
                    >
                      <SelectTrigger className="min-h-10 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpu0">GPU 0 · {gpuFullName(0)}（主力推理）</SelectItem>
                        {gpuCount >= 2 && (
                          <SelectItem value="gpu1">GPU 1 · {gpuFullName(1)}（轻量 / 辅助）</SelectItem>
                        )}
                        {gpuCount >= 2 && <SelectItem value="dual">双卡联合运行</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-10 flex-1"
                      onClick={async () => {
                        await toggleModelRunning(m.id)
                        reload()
                      }}
                    >
                      {m.running ? (
                        <>
                          <CircleStop className="mr-1.5 h-4 w-4" /> 停止
                        </>
                      ) : (
                        <>
                          <CirclePlay className="mr-1.5 h-4 w-4" /> 加载运行
                        </>
                      )}
                    </Button>
                    {!m.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-10"
                        onClick={async () => {
                          await setDefaultModel(m.id)
                          reload()
                        }}
                      >
                        设为默认
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        提示：两张显卡也可分工——一张运行 AI 模型，另一张运行辅助工具（如 OCR、转写）。
        实际调度由 planner 按任务计划决定，此处仅为分配意图。
      </p>
    </div>
  )
}
