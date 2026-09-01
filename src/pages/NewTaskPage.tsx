// 三、新建任务页面：提交后创建 Mock Task 并进入「等待中」
// 模型与显卡分配由执行端 planner 自动决定，前端不选择

import { useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, FolderOpen, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { createTask } from '@/services/api'
import { PageHeader } from '@/components/widgets'

export default function NewTaskPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [folder, setFolder] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [allowBackground, setAllowBackground] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list)
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name))
      return [...prev, ...incoming.filter((f) => !seen.has(f.name))]
    })
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('请填写任务名称')
    if (!description.trim()) return setError('请填写任务描述 / 指令')
    if (!folder.trim() && files.length === 0) return setError('请指定输入文件夹，或拖入至少一个文件')
    setSubmitting(true)
    try {
      const task = await createTask({
        name: name.trim(),
        description: description.trim(),
        input: folder.trim() || `${files.length} 个拖入的文件`,
        inputFiles: files.length > 0 ? files.map((f) => f.name) : undefined,
        allowBackground,
      })
      navigate(`/tasks/${task.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="新建任务" description="任务将被发送到中国执行端排队执行（当前为 Mock）" />

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="text-base">任务信息</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">任务名称</Label>
              <Input
                id="name"
                className="min-h-11"
                placeholder="例如：分析 Research 文件夹中的 PDF"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc">任务描述 / 指令</Label>
              <Textarea
                id="desc"
                rows={4}
                placeholder="例如：分析 D:\Research\2026 中的所有 PDF，并生成一份中文总结。"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* 输入：指定文件夹 */}
            <div className="space-y-2">
              <Label htmlFor="folder">输入文件夹（执行端上的路径）</Label>
              <div className="relative">
                <FolderOpen className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="folder"
                  className="min-h-11 pl-9 font-mono"
                  placeholder="D:\Research\2026"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                />
              </div>
            </div>

            {/* 输入：拖入文件（类型不限，由执行端智能体判断能否处理） */}
            <div className="space-y-2">
              <Label>或直接拖入文件</Label>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
                  dragOver
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-zinc-700 hover:border-zinc-600',
                )}
              >
                <FileUp className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  把文件拖到这里，或点击选择文件
                </p>
                <p className="text-xs text-muted-foreground">
                  支持 PDF、Word、Excel、图片、音频、视频、代码、压缩包等——凡执行端智能体能处理的类型均可
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>

              {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {files.map((f) => (
                    <span
                      key={f.name}
                      className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs"
                    >
                      {f.name}
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`移除 ${f.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex min-h-12 items-center justify-between rounded-lg border border-zinc-800 px-4">
              <div>
                <Label htmlFor="bg" className="text-sm">允许后台执行</Label>
                <p className="text-xs text-muted-foreground">关闭后，执行端锁屏时将暂停该任务</p>
              </div>
              <Switch id="bg" checked={allowBackground} onCheckedChange={setAllowBackground} />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button type="submit" className="min-h-11 w-full" disabled={submitting}>
              {submitting ? '提交中……' : '创建任务（Mock）'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
