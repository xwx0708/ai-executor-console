// 九、用户与设备页面
// 拥有者视图：成员管理（授予管理员权限）+ 邀请密钥 + 设备列表
// 成员视图：输入邀请码绑定设备（看不到其他信息）

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Copy, KeyRound, Laptop, MonitorSmartphone, ShieldCheck, Smartphone, Trash2, UserRound } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  createInvitation,
  getCurrentUser,
  isElevated,
  listDevices,
  listInvitations,
  listUsers,
  redeemInvitation,
  removeDevice,
  setAdminGranted,
  toggleDeviceDisabled,
} from '@/services/api'
import { formatDateTime, formatRelative } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/widgets'
import type { Device } from '@/types'

const DEVICE_ICON = {
  'windows-desktop': Laptop,
  'windows-laptop': Laptop,
  ios: Smartphone,
} as const

const DEVICE_TYPE_LABEL = {
  'windows-desktop': 'Windows 台式机',
  'windows-laptop': 'Windows 笔记本',
  ios: 'iOS 手机',
} as const

function DeviceRow({ device, onChanged }: { device: Device; onChanged: () => void }) {
  const Icon = DEVICE_ICON[device.type]
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-800 px-3 py-3">
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{device.name}</p>
        <p className="text-xs text-muted-foreground">
          {DEVICE_TYPE_LABEL[device.type]} · 最后在线 {formatRelative(device.lastSeenAt)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={
            device.disabled
              ? 'border-zinc-700 text-muted-foreground'
              : device.online
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-zinc-700 text-muted-foreground'
          }
        >
          {device.disabled ? '已禁用' : device.online ? '在线' : '离线'}
        </Badge>
        <Badge variant="outline" className="border-zinc-700 text-muted-foreground">
          {device.role === 'owner' ? '拥有者' : '成员'}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10"
          onClick={async () => {
            await toggleDeviceDisabled(device.id)
            onChanged()
          }}
        >
          {device.disabled ? '启用' : '禁用'}
        </Button>
        {device.id !== 'dev-exec' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="min-h-10 text-red-400 hover:text-red-300">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>移除设备「{device.name}」？</AlertDialogTitle>
                <AlertDialogDescription>移除后该设备将无法再访问控制平台（Mock）。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await removeDevice(device.id)
                    onChanged()
                  }}
                >
                  移除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  )
}

/** 成员视图：输入邀请码绑定设备 */
function MemberView() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function onRedeem(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await redeemInvitation(code)
      setMessage({ ok: true, text: '绑定成功！你的设备已加入（Mock）。' })
      setCode('')
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : '绑定失败' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <PageHeader title="加入控制平台" description="输入管理员给你的邀请密钥，将此设备绑定为成员设备" />
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-5">
          <form onSubmit={onRedeem} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">邀请密钥</Label>
              <Input
                id="code"
                className="min-h-12 text-center font-mono text-lg tracking-widest"
                placeholder="XXXX-XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            {message && (
              <p className={`text-sm ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {message.text}
              </p>
            )}
            <Button type="submit" className="min-h-11 w-full" disabled={busy || !code.trim()}>
              {busy ? '验证中……' : '绑定设备'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        作为成员，你只能查看自己提交的任务、任务产出和执行端状态。
      </p>
    </div>
  )
}

/** 拥有者 / 管理员视图 */
function AdminView() {
  const { data: currentUser } = useQuery(getCurrentUser)
  const { data: users, reload: reloadUsers } = useQuery(listUsers, [])
  const { data: devices, reload: reloadDevices } = useQuery(listDevices, [])
  const { data: invitations, reload: reloadInvitations } = useQuery(listInvitations, [])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [validHours, setValidHours] = useState('24')
  const [maxUses, setMaxUses] = useState('1')
  const [grantAdmin, setGrantAdmin] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const isOwner = currentUser?.isOwner ?? false

  async function onCreateInvitation(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await createInvitation({
        validHours: Number(validHours) || 24,
        maxUses: Number(maxUses) || 1,
        adminGranted: grantAdmin,
      })
      setDialogOpen(false)
      reloadInvitations()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="用户与设备"
        description="邀请他人或其他设备加入（当前仅模拟，无真实认证）"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <KeyRound className="mr-1.5 h-4 w-4" /> 生成邀请密钥
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>生成邀请密钥</DialogTitle>
                <DialogDescription>其他成员可通过密钥绑定自己的设备（Mock）。</DialogDescription>
              </DialogHeader>
              <form onSubmit={onCreateInvitation} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hours">有效时间（小时）</Label>
                    <Input id="hours" type="number" min={1} className="min-h-11" value={validHours} onChange={(e) => setValidHours(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="uses">使用次数</Label>
                    <Input id="uses" type="number" min={1} className="min-h-11" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
                  </div>
                </div>
                <div className="flex min-h-12 items-center justify-between rounded-lg border border-zinc-800 px-4">
                  <div>
                    <Label htmlFor="grant" className="text-sm">附带管理员权限</Label>
                    <p className="text-xs text-muted-foreground">被邀请者仍是成员，仅获得管理操作能力</p>
                  </div>
                  <Switch id="grant" checked={grantAdmin} onCheckedChange={setGrantAdmin} />
                </div>
                <Button type="submit" className="min-h-11 w-full" disabled={creating}>
                  {creating ? '生成中……' : '生成密钥'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* 成员管理：只有拥有者本人可以授予管理员权限 */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">成员管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {users?.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-800 px-3 py-3">
              {u.isOwner ? (
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
              ) : (
                <UserRound className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">
                  {u.isOwner ? '拥有者（唯一）' : u.adminGranted ? '成员 · 已授予管理员权限' : '成员'}
                </p>
              </div>
              {/* 拥有者才可操作；被授予权限的成员看不到这个开关能改别人 */}
              {!u.isOwner && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">管理员权限</span>
                  <Switch
                    checked={u.adminGranted}
                    disabled={!isOwner}
                    onCheckedChange={async (v) => {
                      await setAdminGranted(u.id, v)
                      reloadUsers()
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          {!isOwner && (
            <p className="text-xs text-muted-foreground">
              你是被授予权限的成员，可以管理平台，但不能给其他成员授予管理员权限。
            </p>
          )}
        </CardContent>
      </Card>

      {/* 邀请密钥列表 */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">邀请密钥</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(!invitations || invitations.length === 0) && <EmptyState text="尚未生成邀请密钥" />}
          {invitations?.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-800 px-3 py-3">
              <code className="rounded bg-zinc-950 px-2.5 py-1 font-mono text-sm tracking-wider text-emerald-300">
                {inv.code}
              </code>
              <div className="text-xs text-muted-foreground">
                有效期至 {formatDateTime(inv.expiresAt)} · 可用 {inv.maxUses - inv.usedCount} / {inv.maxUses} 次 ·{' '}
                {inv.adminGranted ? '成员 + 管理员权限' : '普通成员'}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto min-h-10"
                onClick={() => {
                  navigator.clipboard?.writeText(inv.code).catch(() => {})
                  setCopied(inv.code)
                  setTimeout(() => setCopied(null), 2000)
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {copied === inv.code ? '已复制' : '复制'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 设备列表 */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorSmartphone className="h-4 w-4" /> 设备列表
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(!devices || devices.length === 0) && <EmptyState text="暂无设备" />}
          {devices?.map((d) => (
            <DeviceRow key={d.id} device={d} onChanged={reloadDevices} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default function UsersPage() {
  const { data: user } = useQuery(getCurrentUser)
  if (!user) return <p className="text-sm text-muted-foreground">加载中……</p>
  return isElevated(user) ? <AdminView /> : <MemberView />
}
