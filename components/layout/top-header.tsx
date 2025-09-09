"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Settings, LogOut, KeyRound, Download, Users, Bell } from "lucide-react"
import { db } from "@/lib/database"
import { UserSettings } from "@/components/settings/user-settings"
import { PinChange } from "@/components/auth/pin-change"
import { UserManagement } from "@/components/settings/user-management"

interface TopHeaderProps {
  onLogout: () => void
}

export function TopHeader({ onLogout }: TopHeaderProps) {
  type NotifItem = { id: string; type: 'expense'|'budget'; projectName?: string; userName: string; ts: number }
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  // Fermer le menu si clic en dehors
  useEffect(() => {
    if (!isMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  

  // Fermer le menu lors d'un changement de page/onglet
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);
  const [userName, setUserName] = useState<string>("")
  const [showSettings, setShowSettings] = useState(false)
  const [showPinChange, setShowPinChange] = useState(false)
  const [showUserMgmt, setShowUserMgmt] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifItems, setNotifItems] = useState<NotifItem[]>([])
  const [showNotifMenu, setShowNotifMenu] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  // Fermer le menu de notifications si clic en dehors
  useEffect(() => {
    if (!showNotifMenu) return;
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifMenu]);

  useEffect(() => {
    // Récupérer le nom d'utilisateur depuis le stockage local
    const storedUser = localStorage.getItem("expenshare_user")
    if (storedUser) {
      const userData = JSON.parse(storedUser)
      setUserName(userData.name)
      // Determine admin
      db.getAdminUserId().then((aid) => {
        if (aid && userData.id === aid) setIsAdmin(true)
      }).catch(() => {})

      // Clés par utilisateur
      const unreadKey = `expenshare_notif_unread_${userData.id}`
      const itemsKey = `expenshare_notif_items_${userData.id}`
      const lastSeenKey = `expenshare_notif_lastSeen_${userData.id}`

      // Charger la liste des notifications (locale d'abord)
      try {
        const saved = JSON.parse(localStorage.getItem(itemsKey) || '[]')
        if (Array.isArray(saved)) setNotifItems(saved)
      } catch {}

  // lastSeen: ne pas initialiser automatiquement à "maintenant" pour que les utilisateurs voient
  // les nouvelles transactions même s'ils n'étaient pas connectés.
  // Si absent, on utilisera la date de création de l'utilisateur comme fallback (sinon 1970), sans l'écrire côté client.
  let lastSeen = localStorage.getItem(lastSeenKey) || ''

      // Calculer les non lus depuis lastSeen (serveur) pour garantir l’exactitude multi-appareils
      // Déterminer un since effectif
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
        // Fusionner avec un éventuel compteur local existant (priorité au max pour ne pas léser)
        const raw = localStorage.getItem(unreadKey)
        const localCount = raw ? Number(raw) || 0 : 0
        const effective = Math.max(serverCount, localCount)
        setUnreadCount(effective)
        localStorage.setItem(unreadKey, String(effective))

        // Si nous avons des non lus et que la liste locale est vide ou incomplète,
        // récupérer les transactions depuis lastSeen pour construire des éléments
        try {
          if (effective > 0) {
            const sinceVal = await sincePromise
            const serverTx = await db.getTransactionsSince(sinceVal, Math.min(50, effective + 5))
            if (Array.isArray(serverTx) && serverTx.length) {
              const mapped: NotifItem[] = serverTx.map((t: any) => ({
                id: `${t.id}_${t.created_at}`,
                type: t.type === 'expense' ? 'expense' as const : 'budget' as const,
                projectName: t.project_name || 'Projet',
                userName: t.user_name || 'Utilisateur',
                ts: new Date(t.created_at).getTime(),
              }))
              setNotifItems(prev => {
                // Fusionner sans doublons par id
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

  // Écouter les nouvelles transactions pour incrémenter le compteur

      // Écouter les nouvelles transactions pour incrémenter le compteur
      const onNewTx = async (evt: any) => {
        try {
          const detail = evt?.detail || {}
          // Vérifier si l'utilisateur courant appartient au projet concerné
      const memberships = await db.project_users.where('user_id').equals(String(userData.id)).toArray()
          const projectIds = new Set(memberships.map((m: any) => Number(m.project_id)))
          if (projectIds.has(Number(detail.projectId))) {
            // Mettre à jour compteur
            setUnreadCount(prev => {
              const next = (prev || 0) + 1
        localStorage.setItem(unreadKey, String(next))
              return next
            })

            // Ajouter l’item (type + projet + user)
            try {
              const u = await db.users.get(String(detail.userId))
              const proj = await db.getProjectById(Number(detail.projectId))
              const item = {
                id: `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
                type: (String(detail.type) === 'expense' ? 'expense' : 'budget') as 'expense'|'budget',
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
    }
  }, [])

  const getUserInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const handleExportData = async () => {
    try {
      // Créer un toast pour notification
      const toast = document.createElement("div")
      toast.className = "fixed top-4 right-4 bg-card border border-border shadow-lg rounded-lg p-4 z-50 flex items-center"
      toast.style.maxWidth = "300px"
      // Spinner
      const spinner = document.createElement("div")
      spinner.className = "animate-spin rounded-full h-5 w-5 border-b-2 border-primary mr-3"
      toast.appendChild(spinner)
      // Message
      const message = document.createElement("div")
      message.textContent = "Export des données en cours..."
      toast.appendChild(message)
      document.body.appendChild(toast)

      // Récupérer toutes les transactions (pas seulement les 10 dernières)
      const allTx = await db.getRecentTransactions(10000)
      // Colonnes à exporter (sauf Note)
      const headers = [
        'Type', 'Titre', 'Catégorie', 'Sous-catégorie', 'Montant', 'Projet', 'Utilisateur', 'Date'
      ]
      const rows = allTx.map((t: any) => [
        t.type === 'expense' ? 'Dépense' : 'Budget',
        t.title || '',
        t.parent_category_name || t.category_name || '',
        t.parent_category_name ? t.category_name : '',
        t.amount,
        t.project_name,
        t.user_name,
        t.created_at ? new Date(t.created_at).toLocaleString('fr-FR') : ''
      ])
      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'expenshare-transactions.csv'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)

      // Succès
      spinner.remove()
      const checkIcon = document.createElement("div")
      checkIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>'
      toast.insertBefore(checkIcon, message)
      message.textContent = "Données exportées avec succès!"
      setTimeout(() => {
        toast.remove()
      }, 3000)
    } catch (error) {
      console.error("Export failed:", error)
      alert("Erreur lors de l'export des données")
    }
  }

  const handleImportData = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".txt"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        // Fonctionnalité d'import non disponible avec Supabase
        alert("L'import de données n'est pas disponible avec la version Supabase de l'application.")
      } catch (error) {
        console.error("Import failed:", error)
        alert("Erreur lors de l'import des données")
      }
    }
    input.click()
  }

  return (
    <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-foreground">ExpenseShare</h1>
        <p className="text-sm text-muted-foreground">Gestion de projets et dépenses</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <Button 
            variant="ghost" 
            className="relative h-10 w-10 rounded-full" 
            onClick={() => setShowNotifMenu(v => !v)} 
            aria-label="Notifications"
          >
            <Bell className="h-6 w-6" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white font-bold text-[10px] leading-none rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow">
                {unreadCount}
              </span>
            )}
          </Button>
          {showNotifMenu && (
            <div className="absolute right-0 mt-2 w-72 rounded-md shadow-lg bg-card border border-border z-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Notifications</span>
                <Button 
                  variant="secondary" 
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    const storedUser = localStorage.getItem('expenshare_user')
                    if (storedUser) {
                      const userData = JSON.parse(storedUser)
                      const unreadKey = `expenshare_notif_unread_${userData.id}`
                      const itemsKey = `expenshare_notif_items_${userData.id}`
                      const lastSeenKey = `expenshare_notif_lastSeen_${userData.id}`
                      localStorage.setItem(unreadKey, '0')
                      localStorage.setItem(itemsKey, '[]')
                      localStorage.setItem(lastSeenKey, new Date().toISOString())
                    }
                    setUnreadCount(0)
                    setNotifItems([])
                    setShowNotifMenu(false)
                  }}
                >Marquer comme lues</Button>
              </div>
              {notifItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune nouvelle transaction</p>
              ) : (
                <ul className="max-h-64 overflow-auto divide-y">
                  {notifItems.map((n) => (
                    <li key={n.id} className="py-2 flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${n.type === 'expense' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {n.type === 'expense' ? 'Dépense' : 'Budget'}
                      </span>
                      {n.projectName && (
                        <span className="text-sm text-muted-foreground truncate">{n.projectName}</span>
                      )}
                      <span className="text-sm truncate">{n.userName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <Button variant="ghost" className="relative h-10 w-10 rounded-full" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getUserInitials(userName)}
            </AvatarFallback>
          </Avatar>
        </Button>

        {isMenuOpen && (
          <div ref={menuRef} className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-card border border-border z-50">
          <div className="flex flex-col space-y-1 p-3">
            <p className="text-sm font-medium leading-none">{userName}</p>
            <p className="text-xs leading-none text-muted-foreground">Connecté</p>
          </div>
          <div className="border-t border-border"></div>
          <div className="p-1">
            <Button 
              variant="ghost" 
              className="w-full justify-start text-left" 
              size="sm"
              onClick={() => {
                setIsMenuOpen(false);
                setShowPinChange(true);
              }}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              <span>Changer le PIN</span>
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start text-left" 
              size="sm"
              onClick={() => {
                setIsMenuOpen(false); 
                setShowSettings(true);
              }}
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>Paramètres</span>
            </Button>
            {isAdmin && (
              <Button 
                variant="ghost" 
                className="w-full justify-start text-left" 
                size="sm"
                onClick={() => {
                  setIsMenuOpen(false); 
                  setShowUserMgmt(true);
                }}
              >
                <Users className="mr-2 h-4 w-4" />
                <span>Gérer les utilisateurs</span>
              </Button>
            )}
            <div className="border-t border-border my-1"></div>
            <Button variant="ghost" className="w-full justify-start text-left" size="sm" onClick={() => {
                setIsMenuOpen(false);
                handleExportData();
              }}>
              <Download className="mr-2 h-4 w-4" />
              <span>Exporter les données</span>
            </Button>
            <div className="border-t border-border my-1"></div>
            <Button variant="ghost" className="w-full justify-start text-left text-destructive" size="sm" onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Déconnexion</span>
            </Button>
          </div>
        </div>
        )}
        </div>
      </div>

      {/* Dialog des paramètres utilisateur */}
      <UserSettings 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />
      
      {/* Dialog pour changer le PIN */}
      <PinChange
        isOpen={showPinChange}
        onClose={() => setShowPinChange(false)}
      />

      {/* Dialog gestion utilisateurs (admin only) */}
      <UserManagement
        isOpen={showUserMgmt}
        onClose={() => setShowUserMgmt(false)}
      />
    </header>
  )
}
