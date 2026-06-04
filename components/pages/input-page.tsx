"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FolderPlus, Plus, Settings, Pencil, X, ChevronRight, TrendingDown, TrendingUp, Tag, Edit2 } from "lucide-react"
import { useUserProjects, useDatabase } from "@/hooks/use-database"
import { SUPPORTED_CURRENCIES, type Category, type CurrencyCode, type Transaction } from "@/lib/types"
import type { AppPage } from "@/lib/navigation-context"

type LoadedTransaction = Transaction & { id: number }
type LoadedCategory = Category & { id: number }

const isLoadedTransaction = (value: unknown): value is LoadedTransaction => {
  if (typeof value !== "object" || value === null) return false
  const r = value as Record<string, unknown>
  return typeof r.id === "number" && (r.type === "expense" || r.type === "budget") && typeof r.amount === "number"
}

const isLoadedCategory = (value: unknown): value is LoadedCategory => {
  if (typeof value !== "object" || value === null) return false
  const r = value as Record<string, unknown>
  return typeof r.id === "number" && typeof r.name === "string"
}

const isCurrencyCode = (v: string): v is CurrencyCode => (SUPPORTED_CURRENCIES as readonly string[]).includes(v)

const normalizeDisplayCurrency = (currency?: string | null): CurrencyCode => {
  if (!currency) return "EUR"
  const upper = currency.toUpperCase()
  if (upper === "XOF") return "CFA"
  return isCurrencyCode(upper) ? upper : "EUR"
}

const EDIT_PAGE_SIZE = 8

export function InputPage({ navigate }: { navigate?: (page: AppPage) => void }) {
  const { db } = useDatabase()

  const [editDisplayCurrency, setEditDisplayCurrency] = useState<CurrencyCode>("EUR")
  const [editEurToCfa, setEditEurToCfa] = useState(655.957)
  const [editEurToUsd, setEditEurToUsd] = useState(1.0)
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null)
  const [editPage, setEditPage] = useState(1)
  const [editTotal, setEditTotal] = useState(0)
  const [editTransactions, setEditTransactions] = useState<LoadedTransaction[]>([])
  const [isLoadingEdits, setIsLoadingEdits] = useState(false)
  const [userId, setUserId] = useState<string | number | null>(null)
  const [editTab, setEditTab] = useState<'transactions' | 'categories'>('transactions')
  const [editCategories, setEditCategories] = useState<LoadedCategory[]>([])
  const [editingProjectName, setEditingProjectName] = useState("")

  const { projects, isLoading, refetch } = useUserProjects(userId)

  useEffect(() => {
    const storedUser = localStorage.getItem("expenshare_user")
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser) as { id?: string | number }
        if (parsed?.id != null) setUserId(parsed.id)
      } catch {}
    }
    const onUpdated = () => void refetch()
    window.addEventListener('expenshare:project-updated', onUpdated)
    return () => window.removeEventListener('expenshare:project-updated', onUpdated)
  }, [refetch])

  const loadEditPage = async (projectId: number, page: number) => {
    if (!db) return
    setIsLoadingEdits(true)
    try {
      const result = await db.getProjectTransactions(projectId)
      const all = Array.isArray(result) ? result.filter(isLoadedTransaction) : []
      const scoped = userId ? all.filter(t => String(t.user_id) === String(userId)) : []
      setEditTotal(scoped.length)
      const start = (page - 1) * EDIT_PAGE_SIZE
      setEditTransactions(scoped.slice(start, start + EDIT_PAGE_SIZE))
    } catch {}
    finally { setIsLoadingEdits(false) }
  }

  const loadEditCurrency = async (projectId: number) => {
    if (!db) return
    try {
      const proj = await db.getProjectById(projectId)
      setEditDisplayCurrency(normalizeDisplayCurrency(proj?.currency))
      const cfa = await db.settings.get(`project:${projectId}:eur_to_cfa`)
      const usd = await db.settings.get(`project:${projectId}:eur_to_usd`)
      if (cfa?.value && !isNaN(Number(cfa.value))) setEditEurToCfa(Number(cfa.value))
      if (usd?.value && !isNaN(Number(usd.value))) setEditEurToUsd(Number(usd.value))
    } catch {}
  }

  const loadEditCategories = async (projectId: number) => {
    if (!db) return
    try {
      const cats = await db.getProjectCategories(projectId)
      setEditCategories(Array.isArray(cats) ? cats.filter(isLoadedCategory) : [])
    } catch {}
  }

  const openEditTransactions = async (projectId: number) => {
    const project = projects.find(p => p.id === projectId)
    setEditingProjectId(projectId)
    setEditingProjectName(project?.name ?? `Projet #${projectId}`)
    setEditPage(1)
    setEditTab('transactions')
    await loadEditCurrency(projectId)
    await loadEditPage(projectId, 1)
    await loadEditCategories(projectId)
  }

  const deleteLine = async (txId: number) => {
    if (!db || !editingProjectId) return
    await db.deleteTransaction(txId)
    await loadEditPage(editingProjectId, editPage)
    window.dispatchEvent(new CustomEvent('expenshare:project-updated'))
  }

  const editLine = (txId: number) => {
    setEditingProjectId(null)
    navigate?.({ type: 'edit-transaction', transactionId: txId })
  }

  const deleteCategory = async (catId: number) => {
    if (!db || !editingProjectId) return
    if (await db.deleteCategory(catId, editingProjectId)) {
      await loadEditCategories(editingProjectId)
      window.dispatchEvent(new CustomEvent('expenshare:project-updated'))
    }
  }

  const formatEditAmount = (amountEur: number) => {
    const currency = editDisplayCurrency === 'CFA' ? 'XOF' : editDisplayCurrency
    const value = editDisplayCurrency === 'CFA' ? amountEur * editEurToCfa
      : editDisplayCurrency === 'USD' ? amountEur * editEurToUsd
      : amountEur
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  }

  const openAddTransaction = (projectId?: number) => {
    navigate?.({ type: 'new-transaction', projectId })
  }

  const openNewProject = () => {
    navigate?.({ type: 'new-project' })
  }

  const totalPages = Math.max(1, Math.ceil(editTotal / EDIT_PAGE_SIZE))

  return (
    <div className="pb-6">
      {/* Actions rapides */}
      <div className="px-4 pt-5 pb-4">
        <h2 className="text-xl font-bold mb-4">Ajouter</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => openAddTransaction()}
            className="flex items-center gap-3 p-4 bg-primary text-primary-foreground rounded-2xl shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
          >
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm">Dépense</p>
              <p className="text-xs text-primary-foreground/70">Saisir une dépense</p>
            </div>
          </button>

          <button
            onClick={openNewProject}
            className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl shadow-sm hover:bg-muted active:scale-95 transition-all"
          >
            <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center flex-shrink-0">
              <FolderPlus className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm">Projet</p>
              <p className="text-xs text-muted-foreground">Nouveau projet</p>
            </div>
          </button>
        </div>
      </div>

      {/* Liste des projets */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Mes projets</h3>
          {projects.length > 0 && (
            <Badge variant="secondary" className="text-xs">{projects.length}</Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-20 bg-card border border-border rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-3">
              <FolderPlus className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium">Aucun projet</p>
            <p className="text-xs text-muted-foreground mt-1">Créez votre premier projet pour commencer</p>
            <Button size="sm" className="mt-3" onClick={openNewProject}>
              <Plus className="h-4 w-4 mr-1.5" />
              Créer un projet
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-card border border-border rounded-2xl overflow-hidden"
              >
                {/* En-tête projet */}
                <button
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 active:bg-muted/50 transition-colors text-left"
                  onClick={() => openAddTransaction(project.id)}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                    style={{ backgroundColor: `${project.color}20` }}
                  >
                    {project.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{project.name}</p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                        {project.role === 'owner' ? 'Proprio' : project.role}
                      </Badge>
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{project.description}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>

                {/* Actions */}
                <div className="flex border-t border-border divide-x divide-border">
                  <button
                    onClick={() => navigate?.({ type: 'project-settings', projectId: project.id })}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Paramètres
                  </button>
                  <button
                    onClick={() => openEditTransactions(project.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Modifier
                  </button>
                  <button
                    onClick={() => openAddTransaction(project.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs text-primary hover:bg-primary/5 transition-colors font-medium"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Saisir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel d'édition (bottom sheet) */}
      {editingProjectId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={(e) => e.target === e.currentTarget && setEditingProjectId(null)}>
          <div className="bg-background w-full rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
              <div>
                <h3 className="font-semibold">{editingProjectName}</h3>
                <p className="text-xs text-muted-foreground">Mes {editTotal} transaction{editTotal > 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={() => setEditingProjectId(null)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-5 gap-2 py-3 border-b border-border flex-shrink-0">
              {(['transactions', 'categories'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setEditTab(tab)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    editTab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab === 'transactions' ? 'Transactions' : 'Catégories'}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {isLoadingEdits ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : editTab === 'transactions' ? (
                <>
                  {editTransactions.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">Aucune transaction</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {editTransactions.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            t.type === 'expense' ? 'bg-red-100 dark:bg-red-950/30' : 'bg-blue-100 dark:bg-blue-950/30'
                          }`}>
                            {t.type === 'expense'
                              ? <TrendingDown className="h-4 w-4 text-red-500" />
                              : <TrendingUp className="h-4 w-4 text-blue-500" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {t.parent_category_name && t.category_name
                                ? `${t.parent_category_name}/${t.category_name}`
                                : (t.category_name || t.title || '—')}
                            </p>
                            <p className={`text-sm font-semibold ${t.type === 'expense' ? 'text-red-500' : 'text-blue-500'}`}>
                              {formatEditAmount(Number(t.amount))}
                            </p>
                          </div>
                          <button
                            onClick={() => editLine(t.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title="Modifier"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteLine(t.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-500 transition-colors"
                            title="Supprimer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">Page {editPage}/{totalPages}</span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={editPage <= 1}
                          onClick={() => { const p = editPage - 1; setEditPage(p); loadEditPage(editingProjectId!, p) }}>
                          Précédent
                        </Button>
                        <Button variant="outline" size="sm" disabled={editPage >= totalPages}
                          onClick={() => { const p = editPage + 1; setEditPage(p); loadEditPage(editingProjectId!, p) }}>
                          Suivant
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {editCategories.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">Aucune catégorie</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {(() => {
                        const parents = new Set(editCategories.map(c => c.parent_id).filter(Boolean))
                        return editCategories.filter(c => !parents.has(c.id)).map((c) => {
                          const parentName = c.parent_id ? editCategories.find(x => x.id === c.parent_id)?.name : null
                          return (
                            <div key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                <Tag className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {parentName ? `${parentName} / ${c.name}` : c.name}
                                </p>
                                <p className="text-xs text-muted-foreground">Niveau {c.level}</p>
                              </div>
                              <button
                                onClick={() => deleteCategory(c.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-500 transition-colors"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
