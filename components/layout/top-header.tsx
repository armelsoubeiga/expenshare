"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Settings, LogOut, KeyRound, Download, Users, Bell, ChevronDown } from "lucide-react"
import { db } from "@/lib/database"
import { UserManagement } from "@/components/settings/user-management"
import { useNavigation } from "@/lib/navigation-context"
import type { Transaction, ProjectUser } from "@/lib/types"

interface TopHeaderProps {
  onLogout: () => void
}

export function TopHeader({ onLogout }: TopHeaderProps) {
  const { navigate } = useNavigation()
  type NotifItem = { id: string; type: 'expense'|'budget'; projectName?: string; userName: string; ts: number }
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    if (!isMenuOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isMenuOpen])

  useEffect(() => { setIsMenuOpen(false) }, [pathname])

  const [userName, setUserName] = useState<string>("")
  const [showUserMgmt, setShowUserMgmt] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifItems, setNotifItems] = useState<NotifItem[]>([])
  const [showNotifMenu, setShowNotifMenu] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showNotifMenu) return
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showNotifMenu])

  useEffect(() => {
    const storedUser = localStorage.getItem("expenshare_user")
    if (!storedUser) return
    const userData = JSON.parse(storedUser)
    setUserName(userData.name)

    db.getAdminUserId().then((aid) => {
      if (aid && userData.id === aid) setIsAdmin(true)
    }).catch(() => {})

    const unreadKey = `expenshare_notif_unread_${userData.id}`
    const itemsKey = `expenshare_notif_items_${userData.id}`
    const lastSeenKey = `expenshare_notif_lastSeen_${userData.id}`

    try {
      const saved = JSON.parse(localStorage.getItem(itemsKey) || '[]')
      if (Array.isArray(saved)) setNotifItems(saved)
    } catch {}

    const lastSeen = localStorage.getItem(lastSeenKey) || ''

    const computeSince = async (): Promise<string> => {
      if (lastSeen) return lastSeen
      try {
        const me = await db.users.get(String(userData.id))
        const createdAt = me?.created_at ? new Date(me.created_at).toISOString() : null
        return createdAt || '1970-01-01T00:00:00.000Z'
      } catch {
        return '1970-01-01T00:00:00.000Z'
      }
    }

    const sincePromise = computeSince()
    sincePromise.then((since) => db.getNewTransactionsCountSince(since)).then(async (serverCount) => {
      const raw = localStorage.getItem(unreadKey)
      const localCount = raw ? Number(raw) || 0 : 0
      const effective = Math.max(serverCount, localCount)
      setUnreadCount(effective)
      localStorage.setItem(unreadKey, String(effective))
      try {
        if (effective > 0) {
          const sinceVal = await sincePromise
          const serverTx: Transaction[] = await db.getTransactionsSince(sinceVal, Math.min(50, effective + 5))
          if (Array.isArray(serverTx) && serverTx.length) {
            const mapped: NotifItem[] = serverTx.map((t) => ({
              id: `${t.id}_${t.created_at}`,
              type: t.type === 'expense' ? 'expense' : 'budget',
              projectName: t.project_name || 'Projet',
              userName: t.user_name || 'Utilisateur',
              ts: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
            }))
            setNotifItems(prev => {
              const seen = new Set(prev.map(p => p.id))
              const merged = [...mapped.filter(m => !seen.has(m.id)), ...prev].slice(0, 30)
              try { localStorage.setItem(itemsKey, JSON.stringify(merged)) } catch {}
              return merged
            })
          }
        }
      } catch {}
    }).catch(() => {
      const raw = localStorage.getItem(unreadKey)
      setUnreadCount(raw ? Number(raw) || 0 : 0)
    })

    interface NewTransactionEventDetail {
      projectId: number | string
      userId: number | string
      type: Transaction["type"]
    }
    const onNewTx = async (evt: Event) => {
      try {
        const detail = (evt as CustomEvent<NewTransactionEventDetail>)?.detail
        if (!detail) return
        // Ne pas se notifier de ses propres transactions
        if (String(detail.userId) === String(userData.id)) return
        const memberships: ProjectUser[] = await db.project_users.where('user_id').equals(String(userData.id)).toArray()
        const projectIds = new Set(memberships.map((m) => Number(m.project_id)))
        if (projectIds.has(Number(detail.projectId))) {
          setUnreadCount(prev => {
            const next = (prev || 0) + 1
            localStorage.setItem(unreadKey, String(next))
            return next
          })
          try {
            const u = await db.users.get(String(detail.userId))
            const proj = await db.getProjectById(Number(detail.projectId))
            const item: NotifItem = {
              id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              type: detail.type === 'expense' ? 'expense' : 'budget',
              projectName: proj?.name || 'Projet',
              userName: u?.name || 'Utilisateur',
              ts: Date.now(),
            }
            setNotifItems(prev => {
              const next = [item, ...prev].slice(0, 30)
              try { localStorage.setItem(itemsKey, JSON.stringify(next)) } catch {}
              return next
            })
          } catch {}
        }
      } catch {}
    }
    window.addEventListener('expenshare:new-transaction', onNewTx)
    return () => window.removeEventListener('expenshare:new-transaction', onNewTx)
  }, [])

  const getUserInitials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)

  const markAllRead = () => {
    const storedUser = localStorage.getItem('expenshare_user')
    if (storedUser) {
      const userData = JSON.parse(storedUser)
      localStorage.setItem(`expenshare_notif_unread_${userData.id}`, '0')
      localStorage.setItem(`expenshare_notif_items_${userData.id}`, '[]')
      localStorage.setItem(`expenshare_notif_lastSeen_${userData.id}`, new Date().toISOString())
    }
    setUnreadCount(0)
    setNotifItems([])
    setShowNotifMenu(false)
  }

  return (
    <>
      <header className="bg-card border-b border-border px-4 py-2.5 flex items-center justify-between sticky top-0 z-40">
        {/* Logo + titre */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">ES</span>
          </div>
          <span className="text-lg font-bold text-foreground tracking-tight">ExpenseShare</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              className="relative w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
              onClick={() => {
                setShowNotifMenu(v => {
                  const opening = !v
                  if (opening) {
                    // Marquer comme vu dès l'ouverture pour éviter la réapparition à la reconnexion
                    const storedUser = localStorage.getItem('expenshare_user')
                    if (storedUser) {
                      const ud = JSON.parse(storedUser)
                      localStorage.setItem(`expenshare_notif_unread_${ud.id}`, '0')
                      localStorage.setItem(`expenshare_notif_lastSeen_${ud.id}`, new Date().toISOString())
                    }
                    setUnreadCount(0)
                  }
                  return opening
                })
              }}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-card" />
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 top-12 w-80 rounded-2xl shadow-xl bg-card border border-border z-50 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <span className="font-semibold text-sm">Notifications</span>
                  {notifItems.length > 0 && (
                    <button onClick={markAllRead} className="text-xs text-primary font-medium hover:underline">
                      Tout marquer lu
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-auto">
                  {notifItems.length === 0 ? (
                    <div className="py-8 text-center">
                      <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Aucune notification</p>
                    </div>
                  ) : (
                    notifItems.map((n) => (
                      <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 border-b border-border/50 last:border-0">
                        <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.type === 'expense' ? 'bg-red-500' : 'bg-blue-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{n.projectName}</p>
                          <p className="text-xs text-muted-foreground">{n.userName} · {n.type === 'expense' ? 'Dépense' : 'Budget'}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button
              className="flex items-center gap-2 h-10 px-2 rounded-xl hover:bg-muted transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {getUserInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-12 w-56 rounded-2xl shadow-xl bg-card border border-border z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-semibold">{userName}</p>
                  <p className="text-xs text-muted-foreground">Connecté</p>
                </div>
                <div className="p-2 space-y-0.5">
                  {[
                    { icon: KeyRound, label: "Changer le PIN", action: () => { setIsMenuOpen(false); navigate({ type: 'change-pin' }) } },
                    { icon: Settings, label: "Paramètres", action: () => { setIsMenuOpen(false); navigate({ type: 'settings' }) } },
                    ...(isAdmin ? [{ icon: Users, label: "Gérer les utilisateurs", action: () => { setIsMenuOpen(false); setShowUserMgmt(true) } }] : []),
                  ].map(({ icon: Icon, label, action }) => (
                    <button key={label} onClick={action} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-muted transition-colors text-left">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {label}
                    </button>
                  ))}
                  <div className="my-1 border-t border-border" />
                  <button onClick={() => { setIsMenuOpen(false); navigate({ type: 'export' }) }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-muted transition-colors text-left">
                    <Download className="h-4 w-4 text-muted-foreground" />
                    Exporter les données
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 transition-colors text-left">
                    <LogOut className="h-4 w-4" />
                    Déconnexion
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <UserManagement isOpen={showUserMgmt} onClose={() => setShowUserMgmt(false)} />
    </>
  )
}
