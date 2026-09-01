// 全局布局：桌面端左侧导航 + 移动端底部标签栏
// 顶栏包含：资源告警横幅、执行端在线状态、通知中心、Mock 身份切换

import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  Bot,
  Cpu,
  FolderOutput,
  LayoutDashboard,
  ListChecks,
  MonitorSmartphone,
  PlusCircle,
  Server,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatRelative, formatTime } from '@/lib/format'
import { useQuery } from '@/hooks/useQuery'
import {
  dismissAlert,
  getCurrentUser,
  getServerStatus,
  isElevated,
  listAlerts,
  listNotifications,
  markAllNotificationsRead,
  switchMockRole,
} from '@/services/api'
import { OnlineBadge } from '@/components/widgets'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '控制台', icon: LayoutDashboard },
  { to: '/tasks', label: '任务', icon: ListChecks },
  { to: '/tasks/new', label: '新建任务', icon: PlusCircle },
  { to: '/results', label: '输出', icon: FolderOutput },
  { to: '/models', label: 'AI 模型', icon: Bot, adminOnly: true },
  { to: '/server', label: '服务器管理', icon: Server, adminOnly: true },
  { to: '/users', label: '用户与设备', icon: MonitorSmartphone },
]

// 移动端底部标签（核心操作）
const MOBILE_TABS: NavItem[] = [
  { to: '/', label: '控制台', icon: LayoutDashboard },
  { to: '/tasks', label: '任务', icon: ListChecks },
  { to: '/tasks/new', label: '新建', icon: PlusCircle },
]

function NavLinks({ onNavigate, elevated }: { onNavigate?: () => void; elevated: boolean }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.filter((i) => !i.adminOnly || elevated).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors',
              isActive
                ? 'bg-zinc-800 text-foreground'
                : 'text-muted-foreground hover:bg-zinc-800/60 hover:text-foreground',
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** 资源告警横幅：CPU / 内存 / GPU 超阈值时置顶显示 */
function AlertBanner() {
  const { data: alerts, reload } = useQuery(listAlerts, [], { interval: 3000 })
  if (!alerts || alerts.length === 0) return null
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1">
            <span className="font-mono text-amber-300">{formatTime(a.ts)}</span>
            {a.taskId ? (
              <>
                {' '}执行任务 <span className="font-mono">#{a.taskId}</span>「{a.taskName}」时，
              </>
            ) : (
              ' 系统空闲时，'
            )}
            {a.metric}达到警戒值 <span className="font-mono font-medium">{a.valueText}</span>
          </span>
          <button
            className="ml-2 shrink-0 rounded p-1 text-amber-400 hover:bg-amber-500/20"
            onClick={async () => {
              await dismissAlert(a.id)
              reload()
            }}
            aria-label="关闭告警"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

function NotificationBell() {
  const navigate = useNavigate()
  const { data: notifications, reload } = useQuery(listNotifications, [], { interval: 5000 })
  const unread = notifications?.filter((n) => !n.read).length ?? 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-medium">通知</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={async () => {
              await markAllNotificationsRead()
              reload()
            }}
          >
            全部已读
          </Button>
        </div>
        <ScrollArea className="max-h-80">
          {(notifications ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">暂无通知</p>
          )}
          {(notifications ?? []).slice(0, 20).map((n) => (
            <button
              key={n.id}
              onClick={() => navigate('/tasks')}
              className="flex w-full items-start gap-2.5 border-b px-4 py-3 text-left last:border-0 hover:bg-zinc-800/50"
            >
              <span
                className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  n.kind === 'success' && 'bg-emerald-400',
                  n.kind === 'error' && 'bg-red-400',
                  n.kind === 'warning' && 'bg-amber-400',
                  n.kind === 'info' && 'bg-sky-400',
                )}
              />
              <span className="min-w-0">
                <span className={cn('block text-sm', !n.read && 'font-medium')}>{n.message}</span>
                <span className="text-xs text-muted-foreground">{formatRelative(n.ts)}</span>
              </span>
            </button>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function RoleSwitcher() {
  const { data: user, reload } = useQuery(getCurrentUser)
  if (!user) return null
  const elevated = isElevated(user)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10 gap-2 px-3">
          {user.isOwner ? (
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          ) : (
            <UserRound className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{user.name}</span>
          <Badge variant="secondary" className="text-xs">
            {user.isOwner ? '拥有者' : elevated ? '成员 · 管理员' : '成员'}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mock 身份切换</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await switchMockRole('owner')
            reload()
            window.location.reload()
          }}
        >
          <ShieldCheck className="mr-2 h-4 w-4" /> 我（拥有者）
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await switchMockRole('member')
            reload()
            window.location.reload()
          }}
        >
          <UserRound className="mr-2 h-4 w-4" /> 普通成员
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function AppLayout() {
  const { data: server } = useQuery(getServerStatus, [], { interval: 4000 })
  const { data: user } = useQuery(getCurrentUser)
  const elevated = user ? isElevated(user) : false

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* 桌面端侧边栏 */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-zinc-800 bg-zinc-950 lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-zinc-800 px-5">
          <Cpu className="h-5 w-5 text-emerald-400" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">私人 AI 执行端</div>
            <div className="text-xs text-muted-foreground">远程控制平台</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks elevated={elevated} />
        </div>
        <div className="border-t border-zinc-800 p-4 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>执行端 · 中国</span>
            <OnlineBadge online={server?.online ?? false} />
          </div>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="lg:pl-60">
        {/* 顶栏 */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur lg:px-6">
          {/* 左上角预留：未来可放置新功能入口 */}

          <div className="flex items-center gap-2 lg:hidden">
            <span className="text-sm font-semibold">私人 AI 执行端</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {server && <OnlineBadge online={server.online} />}
            <NotificationBell />
            <RoleSwitcher />
          </div>
        </header>

        {/* 页面内容：底部留白给移动端标签栏 */}
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 lg:px-6 lg:pb-10">
          <AlertBanner />
          <div className="mt-5">
            <Outlet />
          </div>
        </main>
      </div>

      {/* 移动端底部标签栏 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-4">
          {MOBILE_TABS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]',
                  isActive ? 'text-emerald-400' : 'text-muted-foreground',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
          <Sheet>
            <SheetTrigger asChild>
              <button className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground">
                <FolderOutput className="h-5 w-5" />
                更多
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-zinc-950">
              <SheetHeader>
                <SheetTitle>更多功能</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-2 pb-6">
                {NAV_ITEMS.filter(
                  (i) => !MOBILE_TABS.some((t) => t.to === i.to) && (!i.adminOnly || elevated),
                ).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="flex min-h-12 items-center gap-2.5 rounded-md border border-zinc-800 px-3 text-sm"
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  )
}
