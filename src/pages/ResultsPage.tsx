// 六、结果页面：已完成任务的产物文件，支持 查看 / 下载 / 删除（均 Mock）

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Eye, FileText, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { deleteResult, downloadResult, listResults } from '@/services/api'
import { formatDateTime, formatSize } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/widgets'
import type { ResultFile } from '@/types'

export default function ResultsPage() {
  const { data: results, reload } = useQuery(listResults, [], { interval: 4000 })
  const [preview, setPreview] = useState<ResultFile | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div>
      <PageHeader title="输出" description="已完成任务产生的文件（Mock 文件，无真实内容）" />

      {toast && (
        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
          {toast}
        </div>
      )}

      {results && results.length === 0 && <EmptyState text="暂无结果文件" />}

      <div className="space-y-3">
        {results?.map((r) => (
          <Card key={r.id} className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <FileText className="h-8 w-8 shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-medium">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatSize(r.sizeKB)} · {formatDateTime(r.createdAt)} ·{' '}
                  <Link to={`/tasks/${r.taskId}`} className="underline-offset-2 hover:underline">
                    任务 #{r.taskId}
                  </Link>
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="min-h-10" onClick={() => setPreview(r)}>
                  <Eye className="mr-1.5 h-4 w-4" /> 查看
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-10"
                  onClick={async () => {
                    const res = await downloadResult(r.id)
                    showToast(`已开始下载 ${res.name}（Mock）`)
                  }}
                >
                  <Download className="mr-1.5 h-4 w-4" /> 下载
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="min-h-10 text-red-400 hover:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除 {r.name}？</AlertDialogTitle>
                      <AlertDialogDescription>此操作仅删除 Mock 记录，不影响真实文件。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          await deleteResult(r.id)
                          showToast(`${r.name} 已删除（Mock）`)
                          reload()
                        }}
                      >
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 查看 Mock 内容 */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono">{preview?.name}</DialogTitle>
            <DialogDescription>
              {preview && `${formatSize(preview.sizeKB)} · 生成于 ${formatDateTime(preview.createdAt)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap rounded-md bg-zinc-950 p-4 text-sm text-zinc-300">
            {preview?.contentPreview}
            <p className="mt-4 text-xs text-muted-foreground">（Mock 预览 —— 第二阶段将展示真实文件内容）</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
