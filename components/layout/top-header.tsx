"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Settings, LogOut, KeyRound, Download, Users } from "lucide-react"
import { db } from "@/lib/database"
import { UserSettings } from "@/components/settings/user-settings"
import { PinChange } from "@/components/auth/pin-change"
import { UserManagement } from "@/components/settings/user-management"

interface TopHeaderProps {
  onLogout: () => void
}

export function TopHeader({ onLogout }: TopHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [userName, setUserName] = useState<string>("")
  const [showSettings, setShowSettings] = useState(false)
  const [showPinChange, setShowPinChange] = useState(false)
  const [showUserMgmt, setShowUserMgmt] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

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
        const text = await file.text()
        await db.importDatabase(text)
        alert("Données importées avec succès")
        window.location.reload()
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

      <div className="relative">
        <Button variant="ghost" className="relative h-10 w-10 rounded-full" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getUserInitials(userName)}
            </AvatarFallback>
          </Avatar>
        </Button>

        {isMenuOpen && (
          <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-card border border-border z-50">
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
