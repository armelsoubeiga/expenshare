"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { BarChart3, TrendingUp, TrendingDown, DollarSign, ArrowRight, Link2, Filter, X, ChevronDown } from "lucide-react"
import { useUserProjects, useProjectStats } from "@/hooks/use-database"
import { normalizeCurrencyCode } from "@/lib/utils"
import { CustomPieChart } from "@/components/charts/pie-chart"
import { HierarchicalPieChart } from "@/components/charts/hierarchical-pie-chart"
import { db } from "@/lib/database"
import type { CurrencyCode } from "@/lib/types"
import { useNavigation } from "@/lib/navigation-context"
import { TransactionTable } from "@/components/ui/transaction-table"

export function StatsPage() {
  const { navigate } = useNavigation()
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [userId, setUserId] = useState<string | number | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const stored = localStorage.getItem("expenshare_user")
      if (!stored) return null
      const data = JSON.parse(stored) as { id?: string | number }
      return data.id ?? null
    } catch { return null }
  })
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    try {
      const stored = localStorage.getItem("expenshare_user")
      if (!stored) return ""
      const data = JSON.parse(stored) as { id?: string | number }
      return data.id != null ? String(data.id) : ""
    } catch { return "" }
  })
  const [ownedProjectIds, setOwnedProjectIds] = useState<Set<number>>(new Set())
  const [categoryHierarchy, setCategoryHierarchy] = useState<any[]>([])
  // Devise projet + taux
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("EUR")
  const [eurToCfa, setEurToCfa] = useState<number>(655.957)
  const [eurToUsd, setEurToUsd] = useState<number>(1.0)
  // Transferts de budget
  const [transfers, setTransfers] = useState<{ outgoing: any[]; incoming: any[] }>({ outgoing: [], incoming: [] })
  // Filtres transactions
  const [showFilters, setShowFilters] = useState(false)
  const [filterDate, setFilterDate] = useState<'all' | 'today' | 'week' | 'month'>('all')
  const [filterUserId, setFilterUserId] = useState<string>('all')
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'budget'>('all')
  const [activeStatsTab, setActiveStatsTab] = useState<'overview' | 'categories' | 'transactions'>('overview')

  // Charger les projets dont l'utilisateur est propriétaire
  useEffect(() => {
    if (!userId) return
    ;(async () => {
      try {
        const projs = await (db as any).getUserProjects(userId)
        const owned = new Set<number>()
        for (const p of (projs as any[])) {
          if (String(p.created_by) === String(userId) && p.id != null) owned.add(Number(p.id))
        }
        setOwnedProjectIds(owned)
      } catch {}
    })()
  }, [userId])

  const { projects, isLoading: projectsLoading } = useUserProjects(userId)
  const { stats, isLoading: statsLoading } = useProjectStats(selectedProjectId ? Number.parseInt(selectedProjectId) : 0, displayCurrency === 'CFA' ? 'CFA' : displayCurrency)

  // Sélectionner automatiquement le premier projet si aucun n'est sélectionné
  useEffect(() => {
    if (!projectsLoading && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id.toString())
    }
  }, [projectsLoading, projects, selectedProjectId])

  // Réinitialiser les filtres liés à l'utilisateur quand le projet change
  useEffect(() => {
    setFilterUserId('all')
  }, [selectedProjectId])
  const loadCategoryHierarchy = useCallback(
    async (projectId: number) => {
      try {
        const cur: CurrencyCode = displayCurrency === 'CFA' ? 'CFA' : displayCurrency
        const hierarchy = await db.getProjectCategoryHierarchy(projectId, cur)
        setCategoryHierarchy(hierarchy)
      } catch (error) {
        console.error("Failed to load category hierarchy:", error)
      }
    },
    [displayCurrency],
  )

  // Charger devise + taux pour le projet
  const loadProjectCurrency = useCallback(async (projectId: number) => {
    try {
      const proj = await db.getProjectById(projectId)
      if (proj?.currency) {
        const normalizedCurrency = normalizeCurrencyCode(proj.currency)
        if (normalizedCurrency) {
          setDisplayCurrency(normalizedCurrency)
        }
      }
      const cfa = await db.settings.get(`project:${projectId}:eur_to_cfa`)
      const usd = await db.settings.get(`project:${projectId}:eur_to_usd`)
      if (cfa?.value && !Number.isNaN(Number(cfa.value))) setEurToCfa(Number(cfa.value))
      if (usd?.value && !Number.isNaN(Number(usd.value))) setEurToUsd(Number(usd.value))
    } catch (error) {
      console.error("Failed to load project currency:", error)
    }
  }, [])

  // Charger les transferts quand le projet change
  useEffect(() => {
    if (!selectedProjectId) { setTransfers({ outgoing: [], incoming: [] }); return }
    const loadTransfers = async () => {
      try {
        const t = await (db as any).getProjectBudgetTransfers(Number(selectedProjectId))
        setTransfers(t || { outgoing: [], incoming: [] })
      } catch { setTransfers({ outgoing: [], incoming: [] }) }
    }
    void loadTransfers()
    const onUpdated = () => void loadTransfers()
    window.addEventListener('expenshare:project-updated', onUpdated)
    return () => window.removeEventListener('expenshare:project-updated', onUpdated)
  }, [selectedProjectId])

  // Load category hierarchy when project changes
  useEffect(() => {
    if (selectedProjectId) {
      const projectNumericId = Number.parseInt(selectedProjectId)
      void loadCategoryHierarchy(projectNumericId)
      void loadProjectCurrency(projectNumericId)
    }
  }, [loadCategoryHierarchy, loadProjectCurrency, selectedProjectId])

  // Ecouter les changements depuis le formulaire de paramètres projet
  useEffect(() => {
    const onProjectCurrencyChanged = (e: Event) => {
      const ev = e as CustomEvent<any>
      if (!ev.detail) return
      if (!selectedProjectId) return
      if (Number(ev.detail.projectId) !== Number(selectedProjectId)) return
      if (ev.detail.currency) {
        const normalizedCurrency = normalizeCurrencyCode(ev.detail.currency)
        if (normalizedCurrency) {
          setDisplayCurrency(normalizedCurrency)
        }
      }
      if (ev.detail.eurToCfa && !Number.isNaN(Number(ev.detail.eurToCfa))) setEurToCfa(Number(ev.detail.eurToCfa))
      if (ev.detail.eurToUsd && !Number.isNaN(Number(ev.detail.eurToUsd))) setEurToUsd(Number(ev.detail.eurToUsd))
    }
    window.addEventListener('expenshare:project-currency-changed', onProjectCurrencyChanged)
    return () => window.removeEventListener('expenshare:project-currency-changed', onProjectCurrencyChanged)
  }, [selectedProjectId])

  // Recharger la hiérarchie quand la devise change
  useEffect(() => {
    if (selectedProjectId) {
      void loadCategoryHierarchy(Number.parseInt(selectedProjectId))
    }
  }, [displayCurrency, loadCategoryHierarchy, selectedProjectId])

  const convertAmount = (amountEur: number) => {
    switch (displayCurrency) {
      case "CFA":
        return amountEur * eurToCfa
      case "USD":
        return amountEur * eurToUsd
      default:
        return amountEur
    }
  }

  const currencyForIntl = displayCurrency === "CFA" ? "XOF" : displayCurrency
  const formatAmount = (amount: number) => {
    const isWhole = Number.isInteger(Math.round(amount * 100) / 100) || currencyForIntl === 'XOF'
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currencyForIntl,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: currencyForIntl === 'XOF' ? 0 : 2,
    }).format(amount)
  }

  // Affichage ligne par ligne: utiliser la colonne native si disponible
  const formatTransactionAmount = (tx: any) => {
    let value: number | null = null
    if (displayCurrency === 'CFA' && tx.amount_cfa != null) value = Number(tx.amount_cfa)
    else if (displayCurrency === 'USD' && tx.amount_usd != null) value = Number(tx.amount_usd)
    else if (displayCurrency === 'EUR' && tx.amount_eur != null) value = Number(tx.amount_eur)
    if (value == null) value = convertAmount(Number(tx.amount_eur ?? tx.amount ?? 0))
    return formatAmount(value)
  }

  // La hiérarchie est déjà en devise cible
  const mapHierarchyValues = (nodes: any[]): any[] => nodes

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return "text-green-600"
    if (balance < 0) return "text-red-600"
    return "text-gray-600"
  }

  const selectedProject = projects.find((p) => p.id.toString() === selectedProjectId)

  // Utilisateurs distincts présents dans les transactions du projet (pour filtre)
  const txUsers = useMemo(() => {
    if (!stats?.transactions) return [] as { id: string; name: string }[]
    const map = new Map<string, string>()
    for (const tx of stats.transactions) {
      if (tx.user_id != null && tx.user_name) map.set(String(tx.user_id), String(tx.user_name))
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [stats?.transactions])

  // Transactions filtrées
  const filteredTransactions = useMemo(() => {
    let txs = stats?.transactions ?? []

    if (filterDate !== 'all') {
      const now = new Date()
      let cutoff: Date
      if (filterDate === 'today') {
        cutoff = new Date(now); cutoff.setHours(0, 0, 0, 0)
      } else if (filterDate === 'week') {
        cutoff = new Date(now); cutoff.setHours(0, 0, 0, 0)
        const day = cutoff.getDay()
        cutoff.setDate(cutoff.getDate() - (day === 0 ? 6 : day - 1))
      } else {
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1)
      }
      txs = txs.filter(tx => tx.created_at && new Date(tx.created_at) >= cutoff)
    }

    if (filterUserId !== 'all') txs = txs.filter(tx => String(tx.user_id) === filterUserId)
    if (filterType !== 'all') txs = txs.filter(tx => tx.type === filterType)

    return txs
  }, [stats?.transactions, filterDate, filterUserId, filterType])

  const activeFiltersCount = (filterDate !== 'all' ? 1 : 0) + (filterUserId !== 'all' ? 1 : 0) + (filterType !== 'all' ? 1 : 0)

  // Données 'Répartition des Budgets' basées sur les transactions de type budget, étiquetées par titre
  const budgetsPieData = useMemo(() => {
    if (!stats || !stats.transactions) return [] as { name: string; value: number; color: string }[]

    const getAmt = (t: any) => {
      if (displayCurrency === 'CFA') return Number(t.amount_cfa ?? 0)
      if (displayCurrency === 'USD') return Number(t.amount_usd ?? 0)
      return Number(t.amount_eur ?? t.amount ?? 0)
    }

    const map = new Map<string, number>()
    for (const t of stats.transactions) {
      if (t.type !== 'budget') continue
      const key = (typeof t.title === 'string' && t.title.trim().length > 0) ? t.title.trim() : 'Sans titre'
      const val = getAmt(t)
      map.set(key, (map.get(key) ?? 0) + val)
    }

    const colors = [
      "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899",
      "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#f43f5e", "#06b6d4",
    ]

    // Ordonner par montant décroissant pour une lecture plus claire
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1])
    return entries.map(([name, value], idx) => ({ name, value, color: colors[idx % colors.length] }))
  }, [stats, displayCurrency])

  // Transferts : totaux et liste combinée triée par date
  const { totalIn, totalOut, effectiveBudget, effectiveExpenses, effectiveBalance } = useMemo(() => {
    const getAmt = (t: any) => {
      if (displayCurrency === 'CFA') return Number(t.amount_cfa ?? 0)
      if (displayCurrency === 'USD') return Number(t.amount_usd ?? 0)
      return Number(t.amount_eur ?? 0)
    }
    const tin = transfers.incoming.reduce((s, t) => s + getAmt(t), 0)
    const tout = transfers.outgoing.reduce((s, t) => s + getAmt(t), 0)
    const effBudget = stats.totalBudgets + tin
    const effExpenses = stats.totalExpenses + tout
    return { totalIn: tin, totalOut: tout, effectiveBudget: effBudget, effectiveExpenses: effExpenses, effectiveBalance: effBudget - effExpenses }
  }, [transfers, displayCurrency, stats.totalBudgets, stats.totalExpenses])

  const allTransfers = useMemo(() => {
    const incoming = transfers.incoming.map(t => ({ ...t, isIncoming: true as const }))
    const outgoing = transfers.outgoing.map(t => ({ ...t, isIncoming: false as const }))
    return [...incoming, ...outgoing].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [transfers])

  const TRANSFER_PREVIEW = 4

  if (projectsLoading) {
    return (
      <div className="p-4 space-y-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="p-4 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Projets</h2>
          <p className="text-muted-foreground">Analyses détaillées par projet</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <CardTitle>Aucun projet disponible</CardTitle>
            <CardDescription>Créez votre premier projet pour voir les statistiques</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-4 space-y-4 md:space-y-6">
      {/* Header + sélecteur projet */}
      <div className="space-y-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground">Projets</h2>
          <p className="text-sm text-muted-foreground hidden sm:block">Analyses détaillées par projet</p>
        </div>
        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger className="w-full h-11 text-sm font-medium rounded-xl border-2 px-4">
            <SelectValue placeholder="Sélectionnez un projet" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id.toString()}>
                <div className="flex items-center gap-2">
                  <span>{project.icon}</span>
                  <span className="truncate">{project.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Project Statistics */}
      {selectedProjectId && (
        <>
          {/* Project Indicators — scroll horizontal sur mobile */}
          <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:gap-4 -mx-3 px-3 md:mx-0 md:px-0">
            <Card className="bg-red-50 dark:bg-red-950/20 flex-shrink-0 w-48 md:w-auto py-3 gap-2">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-2 md:p-3">
                <CardTitle className="text-xs md:text-sm font-medium">Dépenses</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-500 flex-shrink-0" />
              </CardHeader>
              <CardContent className="p-2 md:p-3 pt-0">
                <div className="text-lg md:text-2xl font-bold text-red-600 leading-tight">
                  {statsLoading ? "..." : formatAmount(effectiveExpenses)}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{selectedProject?.name}</p>
              </CardContent>
            </Card>

            <Card className="bg-blue-50 dark:bg-blue-950/20 flex-shrink-0 w-48 md:w-auto py-3 gap-2">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-2 md:p-3">
                <CardTitle className="text-xs md:text-sm font-medium">Budgets</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-500 flex-shrink-0" />
              </CardHeader>
              <CardContent className="p-2 md:p-3 pt-0">
                <div className="text-lg md:text-2xl font-bold text-blue-600 leading-tight">
                  {statsLoading ? "..." : formatAmount(effectiveBudget)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Fonds disponibles</p>
              </CardContent>
            </Card>

            <Card className={`flex-shrink-0 w-48 md:w-auto py-3 gap-2 ${effectiveBalance >= 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-2 md:p-3">
                <CardTitle className="text-xs md:text-sm font-medium">Solde</CardTitle>
                <DollarSign className={`h-4 w-4 flex-shrink-0 ${effectiveBalance >= 0 ? "text-green-500" : "text-red-500"}`} />
              </CardHeader>
              <CardContent className="p-2 md:p-3 pt-0">
                <div className={`text-lg md:text-2xl font-bold leading-tight ${getBalanceColor(effectiveBalance)}`}>
                  {statsLoading ? "..." : formatAmount(effectiveBalance)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Budget − Dépenses</p>
              </CardContent>
            </Card>
          </div>

          {/* Section Transferts de budget inter-projets */}
          <Card className={`border-2 border-dashed ${allTransfers.length > 0 ? 'border-primary/40' : 'border-border'}`}>
            <CardHeader className="pb-2 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Partage de budget</CardTitle>
                </div>
                <button
                  onClick={() => navigate({ type: 'project-transfers', projectId: Number(selectedProjectId) })}
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                >
                  Gérer
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              {allTransfers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">Aucun transfert enregistré.</p>
              ) : (
                <>
                  <div className="divide-y divide-border">
                    {allTransfers.slice(0, TRANSFER_PREVIEW).map(item => {
                      const amt = displayCurrency === 'CFA' ? Number(item.amount_cfa ?? 0)
                        : displayCurrency === 'USD' ? Number(item.amount_usd ?? 0)
                        : Number(item.amount_eur ?? 0)
                      const projectLabel = item.isIncoming
                        ? (item.source_name || `Projet ${item.source_project_id}`)
                        : (item.target_name || `Projet ${item.target_project_id}`)
                      const dateStr = item.created_at
                        ? new Date(item.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
                        : ''
                      return (
                        <div key={`${item.id}-${item.isIncoming ? 'in' : 'out'}`} className="flex items-center gap-2 py-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.isIncoming ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className={`text-xs font-semibold flex-shrink-0 w-12 ${item.isIncoming ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {item.isIncoming ? 'Reçu' : 'Envoyé'}
                          </span>
                          <span className="text-xs text-muted-foreground flex-1 truncate">{projectLabel}</span>
                          <span className={`text-xs font-bold flex-shrink-0 ${item.isIncoming ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {item.isIncoming ? '+' : '−'}{formatAmount(amt)}
                          </span>
                          <span className="text-xs text-muted-foreground flex-shrink-0 w-14 text-right">{dateStr}</span>
                        </div>
                      )
                    })}
                  </div>
                  {allTransfers.length > TRANSFER_PREVIEW && (
                    <button
                      onClick={() => navigate({ type: 'project-transfers', projectId: Number(selectedProjectId) })}
                      className="w-full mt-1 flex items-center justify-center gap-1 py-1.5 text-xs text-primary hover:underline"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      {allTransfers.length - TRANSFER_PREVIEW} autre{allTransfers.length - TRANSFER_PREVIEW > 1 ? 's' : ''} transfert{allTransfers.length - TRANSFER_PREVIEW > 1 ? 's' : ''}
                    </button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Charts and Analysis — onglets underline */}
          <div className="space-y-4">
            <div className="border-b border-border">
              <div className="flex">
                {([
                  { id: "overview",     label: "Vue d'ensemble" },
                  { id: "categories",   label: "Catégories" },
                  { id: "transactions", label: "Transactions" },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveStatsTab(tab.id)}
                    className={`px-4 sm:px-6 py-3 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                      activeStatsTab === tab.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Vue d'ensemble ── */}
            {activeStatsTab === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {stats.expensesByCategory.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Répartition des Dépenses</CardTitle>
                      <CardDescription>Dépenses par catégorie</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CustomPieChart
                        data={stats.expensesByCategory.map(d => {
                          const parent = (d as any).parent as string | undefined
                          return { ...d, name: parent ? `${parent}/${d.name}` : d.name }
                        })}
                        title="Dépenses par Catégorie"
                        size={200}
                        currency={currencyForIntl as any}
                      />
                    </CardContent>
                  </Card>
                )}
                {budgetsPieData.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Répartition des Budgets</CardTitle>
                      <CardDescription>Budgets par titre</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CustomPieChart
                        data={budgetsPieData}
                        title="Budgets par Titre"
                        size={200}
                        currency={currencyForIntl as any}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── Catégories ── */}
            {activeStatsTab === "categories" && (
              <Card>
                <CardHeader>
                  <CardTitle>Analyse Hiérarchique des Catégories</CardTitle>
                  <CardDescription>Explorez vos dépenses par catégorie avec navigation interactive</CardDescription>
                </CardHeader>
                <CardContent>
                  {categoryHierarchy.length > 0 ? (
                    <HierarchicalPieChart
                      data={mapHierarchyValues(categoryHierarchy)}
                      onCategoryClick={(categoryId) => { console.log("Category clicked:", categoryId) }}
                      currency={currencyForIntl as any}
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Aucune donnée de catégorie disponible</p>
                      <p className="text-sm">Ajoutez des catégories et des transactions pour voir l'analyse</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Transactions ── */}
            {activeStatsTab === "transactions" && <div className="space-y-4">
              <Card>
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between pb-3">
                    <div>
                      <CardTitle>Historique des Transactions</CardTitle>
                      {activeFiltersCount > 0 && !showFilters && (
                        <p className="text-xs text-primary mt-0.5">{filteredTransactions.length} / {stats.transactions.length} transactions</p>
                      )}
                      {activeFiltersCount === 0 && (
                        <CardDescription>Toutes les transactions de ce projet</CardDescription>
                      )}
                    </div>
                    {/* Bouton entonnoir */}
                    <div className="relative">
                      <button
                        onClick={() => setShowFilters(v => !v)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                          showFilters ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                        title={showFilters ? 'Masquer les filtres' : 'Filtrer'}
                      >
                        <Filter className="h-4 w-4" />
                        <span className="hidden sm:inline">Filtrer</span>
                        {activeFiltersCount > 0 && !showFilters && (
                          <span className="w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                            {activeFiltersCount}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Panneau filtres (masqué par défaut) */}
                  {showFilters && (
                    <div className="border-t border-border pt-3 pb-3 space-y-3">

                      {/* Filtre date */}
                      <div className="flex items-start sm:items-center gap-2">
                        <span className="text-xs text-muted-foreground w-20 flex-shrink-0 pt-1.5 sm:pt-0">Période</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {(['all', 'today', 'week', 'month'] as const).map(d => (
                            <button
                              key={d}
                              onClick={() => setFilterDate(d)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                filterDate === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {d === 'all' ? 'Tout' : d === 'today' ? "Aujourd'hui" : d === 'week' ? 'Cette semaine' : 'Ce mois'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Filtre utilisateur (seulement si plusieurs users) */}
                      {txUsers.length > 1 && (
                        <div className="flex items-start sm:items-center gap-2">
                          <span className="text-xs text-muted-foreground w-20 flex-shrink-0 pt-1.5 sm:pt-0">Utilisateur</span>
                          <div className="flex gap-1.5 flex-wrap">
                            <button
                              onClick={() => setFilterUserId('all')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterUserId === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                            >
                              Tous
                            </button>
                            {txUsers.map(u => (
                              <button
                                key={u.id}
                                onClick={() => setFilterUserId(u.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterUserId === u.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                              >
                                {u.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Filtre type */}
                      <div className="flex items-start sm:items-center gap-2">
                        <span className="text-xs text-muted-foreground w-20 flex-shrink-0 pt-1.5 sm:pt-0">Type</span>
                        <div className="flex gap-1.5">
                          {(['all', 'expense', 'budget'] as const).map(t => (
                            <button
                              key={t}
                              onClick={() => setFilterType(t)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                filterType === t
                                  ? t === 'expense' ? 'bg-red-500 text-white'
                                  : t === 'budget' ? 'bg-blue-500 text-white'
                                  : 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {t === 'all' ? 'Tout' : t === 'expense' ? 'Dépense' : 'Budget'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Résultat + réinitialisation */}
                      <div className="flex items-center justify-between pt-1">
                        <p className="text-xs text-muted-foreground">
                          {filteredTransactions.length} résultat{filteredTransactions.length > 1 ? 's' : ''} sur {stats.transactions.length}
                        </p>
                        {activeFiltersCount > 0 && (
                          <button
                            onClick={() => { setFilterDate('all'); setFilterUserId('all'); setFilterType('all') }}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-3 w-3" />
                            Réinitialiser
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </CardHeader>

                <CardContent>
                  {statsLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    </div>
                  ) : (
                    <TransactionTable
                      transactions={filteredTransactions}
                      formatAmount={formatTransactionAmount}
                      showProject={false}
                      emptyMessage={activeFiltersCount > 0 ? "Aucune transaction ne correspond aux filtres." : "Aucune transaction pour ce projet. Ajoutez des dépenses ou budgets."}
                      currentUserId={currentUserId}
                      ownedProjectIds={ownedProjectIds}
                      onEdit={tx => tx.id && navigate({ type: 'edit-transaction', transactionId: tx.id })}
                      onDelete={async tx => {
                        if (!tx.id) return
                        try { await (db as any).deleteTransaction(tx.id) } catch {}
                      }}
                    />
                  )}
                </CardContent>
              </Card>

            </div>}

          </div>
        </>
      )}
    </div>
  )
}
