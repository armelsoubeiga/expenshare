"use client"

import { useState, useEffect, useRef } from "react"
import { Home, BarChart3, PlusCircle, LogOut, Settings, KeyRound, Users, Download, ChevronLeft, Bell } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { db } from "@/lib/database"
import { useNavigation } from "@/lib/navigation-context"
import { UserManagement } from "@/components/settings/user-management"
import type { TabType } from "./main-layout"

interface SidebarNavigationProps {
  activeTab: TabType | null
  onTabChange: (tab: TabType) => void
  onLogout: () => void
  isSubPage?: boolean
  onBack?: () => void
}

export function SidebarNavigation({ activeTab, onTabChange, onLogout, isSubPage, onBack }: SidebarNavigationProps) {
  const { navigate, currentPage } = useNavigation()
  const [userName, setUserName] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [showUserMgmt, setShowUserMgmt] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifItems, setNotifItems] = useState<{ id: string; type: "expense" | "budget"; projectName?: string; userName: string; ts: number }[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = localStorage.getItem("expenshare_user")
    if (!stored) return
    const userData = JSON.parse(stored)
    setUserName(userData.name || "")
    db.getAdminUserId().then(aid => { if (aid && userData.id === aid) setIsAdmin(true) }).catch(() => {})

    const unreadKey = `expenshare_notif_unread_${userData.id}`
    const itemsKey = `expenshare_notif_items_${userData.id}`

    const raw = localStorage.getItem(unreadKey)
    setUnreadCount(raw ? Number(raw) || 0 : 0)
    try {
      const saved = JSON.parse(localStorage.getItem(itemsKey) || "[]")
      if (Array.isArray(saved)) setNotifItems(saved)
    } catch {}

    const onNewTx = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail
      if (!detail || String(detail.userId) === String(userData.id)) return
      setUnreadCount(prev => {
        const next = prev + 1
        localStorage.setItem(unreadKey, String(next))
        return next
      })
    }
    window.addEventListener("expenshare:new-transaction", onNewTx)
    return () => window.removeEventListener("expenshare:new-transaction", onNewTx)
  }, [])

  // Fermer le panel notif si clic en dehors
  useEffect(() => {
    if (!showNotif) return
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showNotif])

  const openNotif = () => {
    setShowNotif(v => {
      if (!v) {
        const stored = localStorage.getItem("expenshare_user")
        if (stored) {
          const ud = JSON.parse(stored)
          localStorage.setItem(`expenshare_notif_unread_${ud.id}`, "0")
          localStorage.setItem(`expenshare_notif_lastSeen_${ud.id}`, new Date().toISOString())
        }
        setUnreadCount(0)
      }
      return !v
    })
  }

  const markAllRead = () => {
    const stored = localStorage.getItem("expenshare_user")
    if (stored) {
      const ud = JSON.parse(stored)
      localStorage.setItem(`expenshare_notif_unread_${ud.id}`, "0")
      localStorage.setItem(`expenshare_notif_items_${ud.id}`, "[]")
      localStorage.setItem(`expenshare_notif_lastSeen_${ud.id}`, new Date().toISOString())
    }
    setUnreadCount(0)
    setNotifItems([])
    setShowNotif(false)
  }

  const initials = userName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?"

  const navItems = [
    { id: "home" as TabType, label: "Accueil", icon: Home },
    { id: "stats" as TabType, label: "Projets", icon: BarChart3 },
    { id: "input" as TabType, label: "Ajouter", icon: PlusCircle },
  ]

  // Items de paramètres avec leur page associée pour la surbrillance
  const settingsItems = [
    { icon: KeyRound, label: "Changer le PIN", pageType: "change-pin", action: () => navigate({ type: "change-pin" }) },
    { icon: Settings, label: "Paramètres", pageType: "settings", action: () => navigate({ type: "settings" }) },
    ...(isAdmin ? [{ icon: Users, label: "Utilisateurs", pageType: "__users__", action: () => setShowUserMgmt(true) }] : []),
    { icon: Download, label: "Exporter", pageType: "export", action: () => navigate({ type: "export" }) },
  ]

  const currentPageType = currentPage.type

  return (
    <>
      <aside className="fixed left-0 top-0 h-screen w-[220px] bg-card border-r border-border flex flex-col z-40">
        {/* Logo / Back */}
        <div className="px-5 py-5 border-b border-border flex-shrink-0">
          {isSubPage && onBack ? (
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
              Retour
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground font-bold text-sm">ES</span>
              </div>
              <span className="font-bold text-base tracking-tight">ExpenseShare</span>
            </div>
          )}
        </div>

        {/* Navigation principale */}
        <nav className="px-3 py-4 space-y-0.5 flex-shrink-0">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id && currentPageType === "main"
            return (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                {label}
              </button>
            )
          })}
        </nav>

        <div className="flex-1" />

        {/* Paramètres */}
        <div className="px-3 py-3 border-t border-border space-y-0.5 flex-shrink-0">
          {settingsItems.map(({ icon: Icon, label, pageType, action }) => {
            const isActive = currentPageType === pageType
            return (
              <button
                key={label}
                onClick={action}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isActive
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                {label}
              </button>
            )
          })}
        </div>

        {/* Cloche notifications */}
        <div className="px-3 pb-2 flex-shrink-0" ref={notifRef}>
          <button
            onClick={openNotif}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              showNotif ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <div className="relative flex-shrink-0">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full ring-1 ring-card" />
              )}
            </div>
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="ml-auto text-xs font-semibold bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Utilisateur */}
        <div className="px-3 pb-4 pt-2 border-t border-border flex-shrink-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-muted-foreground">Connecté</p>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
              title="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Panel notifications — position fixe à droite de la sidebar */}
      {showNotif && (
        <div
          className="fixed z-50 w-80 rounded-2xl shadow-2xl bg-card border border-border overflow-hidden"
          style={{ left: "228px", bottom: "64px" }}
          ref={notifRef}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm">Notifications</span>
            {notifItems.length > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary font-medium hover:underline">
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-auto">
            {notifItems.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Aucune notification</p>
              </div>
            ) : (
              notifItems.map(n => (
                <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 border-b border-border/50 last:border-0">
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.type === "expense" ? "bg-red-500" : "bg-blue-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.projectName}</p>
                    <p className="text-xs text-muted-foreground">{n.userName} · {n.type === "expense" ? "Dépense" : "Budget"}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <UserManagement isOpen={showUserMgmt} onClose={() => setShowUserMgmt(false)} />
    </>
  )
}
