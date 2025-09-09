"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, FolderPlus, Settings, Pencil, X } from "lucide-react"
import { ProjectForm } from "@/components/forms/project-form"
import { TransactionForm } from "@/components/forms/transaction-form"
import { CategoryForm } from "@/components/forms/category-form"
import { ProjectSettingsForm } from "@/components/forms/project-settings-form"
import { useUserProjects, useDatabase } from "@/hooks/use-database"

export function InputPage() {
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [selectedProjectForCategories, setSelectedProjectForCategories] = useState<number | null>(null)
  const [selectedProjectForSettings, setSelectedProjectForSettings] = useState<number | null>(null)
  const { db, isReady } = useDatabase()
  // États pour l’éditeur des transactions (devise projet)
  const [editDisplayCurrency, setEditDisplayCurrency] = useState<"EUR"|"CFA"|"USD">("EUR")
  const [editEurToCfa, setEditEurToCfa] = useState<number>(655.957)
  const [editEurToUsd, setEditEurToUsd] = useState<number>(1.0)
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null)
  const [editPage, setEditPage] = useState(1)
  const [editPageSize] = useState(5)
  const [editTotal, setEditTotal] = useState(0)
  const [editTransactions, setEditTransactions] = useState<any[]>([])
  const [isLoadingEdits, setIsLoadingEdits] = useState(false)
  const [userId, setUserId] = useState<number | null>(null)

  useEffect(() => {
    const storedUser = localStorage.getItem("expenshare_user")
    if (storedUser) {
      const userData = JSON.parse(storedUser)
      setUserId(userData.id)
    }
    
    // Écouter les mises à jour de projets
    const onProjectUpdated = () => {
      refetch()
    }
    window.addEventListener('expenshare:project-updated', onProjectUpdated)
    
    return () => {
      window.removeEventListener('expenshare:project-updated', onProjectUpdated)
    }
  }, [])

  const { projects, isLoading, refetch } = useUserProjects(userId || 0)

  const handleProjectSuccess = () => {
    refetch()
  }

  const handleTransactionSuccess = () => {
    // Refresh data if needed
  }

  const handleCategorySuccess = () => {
    // Géré par handleProjectSettingsSuccess
    refetch()
  }

  const handleProjectSettingsSuccess = () => {
    refetch()
  }

  const openEditTransactions = async (projectId: number) => {
    setEditingProjectId(projectId)
    setEditPage(1)
  await loadEditCurrency(projectId)
    await loadEditPage(projectId, 1)
  }

  const loadEditPage = async (projectId: number, page: number) => {
    if (!db) return
    setIsLoadingEdits(true)
    try {
      const all = await db.getProjectTransactions(projectId)
      const onlyMine = (all || []).filter((t: any) => String(t.user_id) === String(userId))
      setEditTotal(onlyMine.length)
      const start = (page - 1) * editPageSize
      const end = start + editPageSize
      setEditTransactions(onlyMine.slice(start, end))
    } catch (e) {
      // ignore
    } finally {
      setIsLoadingEdits(false)
    }
  }

  const deleteLine = async (txId: number) => {
    if (!db || !editingProjectId) return
    const ok = await db.deleteTransaction(txId)
    if (ok) {
      await loadEditPage(editingProjectId, editPage)
      // rafraîchir la liste des projets/statistiques si nécessaire
      try {
        window.dispatchEvent(new CustomEvent('expenshare:project-updated'))
      } catch {}
    }
  }

  // Charger devise et taux du projet pour l’éditeur
  const loadEditCurrency = async (projectId: number) => {
    try {
      if (!db) return
      const proj = await db.getProjectById(projectId)
      if (proj?.currency) {
        const c = String(proj.currency)
        setEditDisplayCurrency((c === 'XOF' ? 'CFA' : c) as any)
      } else {
        setEditDisplayCurrency('EUR')
      }
      const cfa = await db.settings.get(`project:${projectId}:eur_to_cfa`)
      const usd = await db.settings.get(`project:${projectId}:eur_to_usd`)
      if (cfa?.value && !Number.isNaN(Number(cfa.value))) setEditEurToCfa(Number(cfa.value))
      if (usd?.value && !Number.isNaN(Number(usd.value))) setEditEurToUsd(Number(usd.value))
    } catch {
      // silencieux
    }
  }

  const convertEditAmount = (amountEur: number) => {
    switch (editDisplayCurrency) {
      case 'CFA':
        return amountEur * editEurToCfa
      case 'USD':
        return amountEur * editEurToUsd
      default:
        return amountEur
    }
  }
  const formatEditAmount = (amountEur: number) => {
    const currency = editDisplayCurrency === 'CFA' ? 'XOF' : editDisplayCurrency
    const value = convertEditAmount(amountEur)
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(value)
  }

  const openCategoryForm = (projectId: number) => {
    // Ouvrir directement les paramètres du projet avec l'onglet catégories activé
    setSelectedProjectForCategories(projectId)
    setSelectedProjectForSettings(projectId)
    setShowProjectSettings(true)
  }
  
  const openProjectSettings = (projectId: number) => {
    setSelectedProjectForSettings(projectId)
    setShowProjectSettings(true)
  }

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Saisie</h2>
        <p className="text-muted-foreground">Ajoutez des dépenses, budgets et projets</p>
      </div>

      <div className="grid gap-4">
        {/* Nouveau Projet */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5" />
              Nouveau Projet
            </CardTitle>
            <CardDescription>Créez un nouveau projet pour organiser vos dépenses</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => setShowProjectForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un projet
            </Button>
          </CardContent>
        </Card>

        {/* Saisie de dépenses/budgets */}
        <Card className={projects.length === 0 ? "opacity-50" : ""}>
          <CardHeader>
            <CardTitle>Saisie de dépenses/budgets</CardTitle>
            <CardDescription>Ajoutez des transactions à vos projets existants</CardDescription>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Créez d'abord un projet pour pouvoir saisir des dépenses
              </p>
            ) : (
              <Button className="w-full" onClick={() => setShowTransactionForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle transaction
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Gestion des projets existants */}
        {projects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Gestion des Projets
              </CardTitle>
              <CardDescription>Configurez vos projets existants et leurs catégories</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {projects.map((project) => (
                    <div key={project.id} className="border rounded-lg overflow-hidden hover:bg-accent/50 transition-colors h-full flex flex-col">
                      <div 
                        className="p-4 flex items-center gap-3 cursor-pointer flex-grow" 
                        onClick={() => setShowTransactionForm(true)}
                      >
                        <div className="flex-shrink-0 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-2xl">{project.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">{project.name}</h4>
                          {project.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
                          )}
                          <Badge variant="outline" className="mt-1">
                            {project.role}
                          </Badge>
                        </div>
                      </div>
                      <div className="p-3 pt-0">
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" size="sm" onClick={() => openProjectSettings(project.id)} className="w-full">
                            <Settings className="h-4 w-4 mr-1" />
                            Paramètres
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => openEditTransactions(project.id)} className="w-full">
                            <Pencil className="h-4 w-4 mr-1" />
                            Modifier
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Forms */}
      <ProjectForm
        isOpen={showProjectForm}
        onClose={() => setShowProjectForm(false)}
        onSuccess={handleProjectSuccess}
      />

      <TransactionForm
        isOpen={showTransactionForm}
        onClose={() => setShowTransactionForm(false)}
        onSuccess={handleTransactionSuccess}
      />

      {/* Nous n'avons plus besoin de ce composant séparé pour les catégories car nous utilisons l'onglet catégories des paramètres */}

      {selectedProjectForSettings && (
        <ProjectSettingsForm 
          isOpen={showProjectSettings}
          onClose={() => {
            setShowProjectSettings(false)
            setSelectedProjectForSettings(null)
          }}
          onSuccess={handleProjectSettingsSuccess}
          projectId={selectedProjectForSettings}
          activeTab={selectedProjectForCategories ? "categories" : "general"}
        />
      )}

      {/* Panneau de modification des transactions */}
      {editingProjectId && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center justify-center">
          <div className="bg-background w-full sm:max-w-2xl sm:rounded-lg shadow-lg p-4 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Mes transactions — Projet #{editingProjectId}</h3>
              <Button variant="ghost" size="sm" onClick={() => setEditingProjectId(null)}>
                Fermer
              </Button>
            </div>
            {isLoadingEdits ? (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {editTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune transaction</p>
                ) : (
                  <ul className="divide-y">
                    {editTransactions.map((t) => (
            <li key={t.id} className="py-2 flex items-center gap-3">
                        <div className={`px-2 py-0.5 rounded text-xs ${t.type === 'expense' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{t.type}</div>
                        <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {t.parent_category_name && t.category_name
                  ? `${t.parent_category_name}/${t.category_name}`
                  : (t.category_name || t.title || '(sans titre)')}
                {` — ${formatEditAmount(Number(t.amount))}`}
              </div>
                          {t.description && <div className="text-xs text-muted-foreground truncate">{t.description}</div>}
                        </div>
                        <button aria-label="Supprimer" className="text-muted-foreground hover:text-destructive" onClick={() => deleteLine(t.id)}>
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Pagination */}
                {editTotal > editPageSize && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">Page {editPage} / {Math.max(1, Math.ceil(editTotal / editPageSize))}</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={editPage <= 1} onClick={() => { const p = editPage - 1; setEditPage(p); loadEditPage(editingProjectId!, p); }}>Précédent</Button>
                      <Button variant="outline" size="sm" disabled={editPage >= Math.ceil(editTotal / editPageSize)} onClick={() => { const p = editPage + 1; setEditPage(p); loadEditPage(editingProjectId!, p); }}>Suivant</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
