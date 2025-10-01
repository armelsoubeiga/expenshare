"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, FolderPlus, Settings, Pencil, X } from "lucide-react"
import { ProjectForm } from "@/components/forms/project-form"
import { TransactionForm } from "@/components/forms/transaction-form"
import { ProjectSettingsForm } from "@/components/forms/project-settings-form"
import { useUserProjects, useDatabase } from "@/hooks/use-database"
import { SUPPORTED_CURRENCIES, type Category, type CurrencyCode, type Transaction } from "@/lib/types"

type LoadedTransaction = Transaction & { id: number }
type LoadedCategory = Category & { id: number }

const isLoadedTransaction = (value: unknown): value is LoadedTransaction => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  const type = record.type
  const amount = record.amount
  return (
    typeof record.id === "number" &&
    (type === "expense" || type === "budget") &&
    typeof amount === "number"
  )
}

const isLoadedCategory = (value: unknown): value is LoadedCategory => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.id === "number" && typeof record.name === "string"
}

const isCurrencyCode = (value: string): value is CurrencyCode =>
  (SUPPORTED_CURRENCIES as readonly string[]).includes(value)

const normalizeDisplayCurrency = (currency?: string | null): CurrencyCode => {
  if (!currency) {
    return "EUR"
  }
  const upper = currency.toUpperCase()
  if (upper === "XOF") {
    return "CFA"
  }
  return isCurrencyCode(upper) ? upper : "EUR"
}

const EDIT_PAGE_SIZE = 5

export function InputPage() {
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [selectedProjectForSettings, setSelectedProjectForSettings] = useState<number | null>(null)
  const { db } = useDatabase()
  // États pour l’éditeur des transactions (devise projet)
  const [editDisplayCurrency, setEditDisplayCurrency] = useState<CurrencyCode>("EUR")
  const [editEurToCfa, setEditEurToCfa] = useState<number>(655.957)
  const [editEurToUsd, setEditEurToUsd] = useState<number>(1.0)
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null)
  const [editPage, setEditPage] = useState(1)
  const [editTotal, setEditTotal] = useState(0)
  const [editTransactions, setEditTransactions] = useState<LoadedTransaction[]>([])
  const [isLoadingEdits, setIsLoadingEdits] = useState(false)
  const [userId, setUserId] = useState<string | number | null>(null)
  const [editTab, setEditTab] = useState<'transactions' | 'categories'>('transactions')
  const [editCategories, setEditCategories] = useState<LoadedCategory[]>([])
  const [editingProjectName, setEditingProjectName] = useState<string>("")

  const { projects, isLoading, refetch } = useUserProjects(userId)

  useEffect(() => {
    const storedUser = localStorage.getItem("expenshare_user")
    if (storedUser) {
      try {
        const parsed: unknown = JSON.parse(storedUser)
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          (typeof (parsed as { id?: unknown }).id === "string" || typeof (parsed as { id?: unknown }).id === "number")
        ) {
          setUserId((parsed as { id: string | number }).id)
        }
      } catch (error) {
        console.error("[InputPage] Failed to parse stored user:", error)
      }
    }

    // Écouter les mises à jour de projets
    const onProjectUpdated = () => {
      void refetch()
    }
    window.addEventListener('expenshare:project-updated', onProjectUpdated)

    return () => {
      window.removeEventListener('expenshare:project-updated', onProjectUpdated)
    }
  }, [refetch])

  const handleProjectSuccess = () => {
    refetch()
  }

  const handleTransactionSuccess = () => {
    // Refresh data if needed
  }

  const handleProjectSettingsSuccess = () => {
    refetch()
  }

  const openEditTransactions = async (projectId: number) => {
    setEditingProjectId(projectId)
    // Déterminer le nom du projet pour un titre plus parlant
    const project = projects.find((candidate) => candidate.id === projectId)
    setEditingProjectName(project?.name ?? `Projet #${projectId}`)
    setEditPage(1)
    setEditTab('transactions')
    await loadEditCurrency(projectId)
    await loadEditPage(projectId, 1)
    await loadEditCategories(projectId)
  }

  const loadEditPage = async (projectId: number, page: number) => {
    if (!db) return
    setIsLoadingEdits(true)
    try {
      const result = await db.getProjectTransactions(projectId)
      const allTransactions = Array.isArray(result) ? result.filter(isLoadedTransaction) : []
      const normalizedUserId = userId == null ? null : String(userId)
      const scopedTransactions = normalizedUserId
        ? allTransactions.filter((transaction) => String(transaction.user_id) === normalizedUserId)
        : []
      setEditTotal(scopedTransactions.length)
      const start = (page - 1) * EDIT_PAGE_SIZE
      const end = start + EDIT_PAGE_SIZE
      setEditTransactions(scopedTransactions.slice(start, end))
    } catch (error) {
      console.error("[InputPage] Failed to load project transactions:", error)
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

  const loadEditCategories = async (projectId: number) => {
    if (!db) return
    try {
      const cats = await db.getProjectCategories(projectId)
      const loaded = Array.isArray(cats) ? cats.filter(isLoadedCategory) : []
      setEditCategories(loaded)
    } catch (error) {
      console.error("[InputPage] Failed to load project categories:", error)
    }
  }

  const deleteCategory = async (catId: number) => {
    if (!db || !editingProjectId) return
    const ok = await db.deleteCategory(catId, editingProjectId)
    if (ok) {
      await loadEditCategories(editingProjectId)
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
      setEditDisplayCurrency(normalizeDisplayCurrency(proj?.currency))
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
                Créez d&apos;abord un projet pour pouvoir saisir des dépenses
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
          activeTab="general"
        />
      )}

      {/* Panneau de modification des transactions */}
      {editingProjectId && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center justify-center">
          <div className="bg-background w-full sm:max-w-2xl sm:rounded-lg shadow-lg p-4 max-h-[80vh] overflow-auto">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold">Modifier — {editingProjectName}</h3>
                <div className="mt-2 w-full">
                  <div className="grid w-full grid-cols-2 rounded-md border border-border overflow-hidden">
                    <button
                      className={`px-3 py-2 text-sm text-center transition-colors ${editTab === 'transactions' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-accent'}`}
                      onClick={() => setEditTab('transactions')}
                    >Transactions</button>
                    <button
                      className={`px-3 py-2 text-sm text-center transition-colors ${editTab === 'categories' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-accent'}`}
                      onClick={() => setEditTab('categories')}
                    >Catégories</button>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditingProjectId(null)} aria-label="Fermer">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {isLoadingEdits ? (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {editTab === 'transactions' ? (
                  <>
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
                    {editTotal > EDIT_PAGE_SIZE && (
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-xs text-muted-foreground">Page {editPage} / {Math.max(1, Math.ceil(editTotal / EDIT_PAGE_SIZE))}</span>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" disabled={editPage <= 1} onClick={() => { const p = editPage - 1; setEditPage(p); loadEditPage(editingProjectId!, p); }}>Précédent</Button>
                          <Button variant="outline" size="sm" disabled={editPage >= Math.ceil(editTotal / EDIT_PAGE_SIZE)} onClick={() => { const p = editPage + 1; setEditPage(p); loadEditPage(editingProjectId!, p); }}>Suivant</Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {editCategories.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune catégorie</p>
                    ) : (
                      <ul className="divide-y">
                        {(() => {
                          // Construire l'ensemble des parents pour déduire les feuilles
                          const parents = new Set<number>()
                          for (const cat of editCategories) {
                            if (cat.parent_id != null) parents.add(Number(cat.parent_id))
                          }
                          const leaves = editCategories.filter(cat => !parents.has(Number(cat.id)))
                          return leaves.map((c) => (
                            <li key={c.id} className="py-2 flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {c.parent_id ? `${(editCategories.find((x) => x.id === c.parent_id)?.name) || 'Parent'}/${c.name}` : c.name}
                                </div>
                              </div>
                              <button aria-label="Supprimer" className="text-muted-foreground hover:text-destructive" onClick={() => deleteCategory(c.id)}>
                                <X className="h-4 w-4" />
                              </button>
                            </li>
                          ))
                        })()}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
