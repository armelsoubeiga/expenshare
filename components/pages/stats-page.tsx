"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, TrendingUp, TrendingDown, DollarSign, FileText, Image, Music, File } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useUserProjects, useProjectStats } from "@/hooks/use-database"
import { formatDate } from "@/lib/utils"
import { CustomPieChart } from "@/components/charts/pie-chart"
import { HierarchicalPieChart } from "@/components/charts/hierarchical-pie-chart"
import { db } from "@/lib/database"

export function StatsPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [userId, setUserId] = useState<number | null>(null)
  const [categoryHierarchy, setCategoryHierarchy] = useState<any[]>([])
  const [preview, setPreview] = useState<{ type: 'image'|'audio'|'text'; content: string; title: string } | null>(null)
  // Devise projet + taux
  const [displayCurrency, setDisplayCurrency] = useState<"EUR"|"CFA"|"USD">("EUR")
  const [eurToCfa, setEurToCfa] = useState<number>(655.957)
  const [eurToUsd, setEurToUsd] = useState<number>(1.0)

  // Get user ID
  useEffect(() => {
    const storedUser = localStorage.getItem("expenshare_user")
    if (storedUser) {
      const userData = JSON.parse(storedUser)
      setUserId(userData.id)
    }
  }, [])

  const { projects, isLoading: projectsLoading } = useUserProjects(userId || 0)
  const { stats, isLoading: statsLoading } = useProjectStats(selectedProjectId ? Number.parseInt(selectedProjectId) : 0)

  // Sélectionner automatiquement le premier projet si aucun n'est sélectionné
  useEffect(() => {
    if (!projectsLoading && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id.toString())
    }
  }, [projectsLoading, projects, selectedProjectId])

  // Load category hierarchy when project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadCategoryHierarchy(Number.parseInt(selectedProjectId))
  loadProjectCurrency(Number.parseInt(selectedProjectId))
    }
  }, [selectedProjectId])

  const loadCategoryHierarchy = async (projectId: number) => {
    try {
      const hierarchy = await db.getProjectCategoryHierarchy(projectId)
      setCategoryHierarchy(hierarchy)
    } catch (error) {
      console.error("Failed to load category hierarchy:", error)
    }
  }

  // Charger devise + taux pour le projet
  const loadProjectCurrency = async (projectId: number) => {
    try {
      const proj = await db.getProjectById(projectId)
      if (proj?.currency) {
        const c = String(proj.currency)
        setDisplayCurrency((c === 'XOF' ? 'CFA' : c) as any)
      }
      const cfa = await db.settings.get(`project:${projectId}:eur_to_cfa`)
      const usd = await db.settings.get(`project:${projectId}:eur_to_usd`)
      if (cfa?.value && !Number.isNaN(Number(cfa.value))) setEurToCfa(Number(cfa.value))
      if (usd?.value && !Number.isNaN(Number(usd.value))) setEurToUsd(Number(usd.value))
    } catch (e) {
      // ignore
    }
  }

  // Ecouter les changements depuis le formulaire de paramètres projet
  useEffect(() => {
    const onProjectCurrencyChanged = (e: Event) => {
      const ev = e as CustomEvent<any>
      if (!ev.detail) return
      if (!selectedProjectId) return
      if (Number(ev.detail.projectId) !== Number(selectedProjectId)) return
      if (ev.detail.currency) {
        const c = String(ev.detail.currency)
        setDisplayCurrency((c === 'XOF' ? 'CFA' : c) as any)
      }
      if (ev.detail.eurToCfa && !Number.isNaN(Number(ev.detail.eurToCfa))) setEurToCfa(Number(ev.detail.eurToCfa))
      if (ev.detail.eurToUsd && !Number.isNaN(Number(ev.detail.eurToUsd))) setEurToUsd(Number(ev.detail.eurToUsd))
    }
    window.addEventListener('expenshare:project-currency-changed', onProjectCurrencyChanged)
    return () => window.removeEventListener('expenshare:project-currency-changed', onProjectCurrencyChanged)
  }, [selectedProjectId])

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
  const formatAmount = (amountEur: number) => {
    const value = convertAmount(amountEur)
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currencyForIntl }).format(value)
  }

  // Convertir hiérarchie pour l'affichage (valeurs converties)
  const mapHierarchyValues = (nodes: any[]): any[] =>
    nodes.map(n => ({
      ...n,
      value: convertAmount(Number(n.value || 0)),
      expenseValue: n.expenseValue !== undefined ? convertAmount(Number(n.expenseValue)) : undefined,
      budgetValue: n.budgetValue !== undefined ? convertAmount(Number(n.budgetValue)) : undefined,
      children: n.children ? mapHierarchyValues(n.children) : undefined,
    }))

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return "text-green-600"
    if (balance < 0) return "text-red-600"
    return "text-gray-600"
  }

  const getTransactionBgColor = (type: string) => {
    return type === "expense" ? "bg-red-50 dark:bg-red-950/20" : "bg-blue-50 dark:bg-blue-950/20"
  }

  const selectedProject = projects.find((p) => p.id.toString() === selectedProjectId)

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
          <h2 className="text-2xl font-bold text-foreground">Statistiques</h2>
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
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Statistiques</h2>
        <p className="text-muted-foreground">Analyses détaillées par projet</p>
      </div>

      {/* Project Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Sélection du Projet</CardTitle>
          <CardDescription>Choisissez un projet pour voir ses statistiques détaillées</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez un projet" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id.toString()}>
                  <div className="flex items-center gap-2">
                    <span>{project.icon}</span>
                    <span>{project.name}</span>
                    <Badge variant="outline" className="ml-2">
                      {project.role}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Project Statistics */}
      {selectedProjectId && (
        <>
          {/* Project Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-red-50 dark:bg-red-950/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Dépenses</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {statsLoading ? "..." : formatAmount(stats.totalExpenses)}
                </div>
                <p className="text-xs text-muted-foreground">{selectedProject?.name}</p>
              </CardContent>
            </Card>

            <Card className="bg-blue-50 dark:bg-blue-950/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Budgets</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {statsLoading ? "..." : formatAmount(stats.totalBudgets)}
                </div>
                <p className="text-xs text-muted-foreground">Fonds disponibles</p>
              </CardContent>
            </Card>

            <Card className={stats.balance >= 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Solde</CardTitle>
                <DollarSign className={`h-4 w-4 ${stats.balance >= 0 ? "text-green-500" : "text-red-500"}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getBalanceColor(stats.balance)}`}>
                  {statsLoading ? "..." : formatAmount(stats.balance)}
                </div>
                <p className="text-xs text-muted-foreground">Budget - Dépenses</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts and Analysis */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
              <TabsTrigger value="categories">Catégories</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
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
                          // Si d.parent existe, on construit le label, sinon on prend d.name
                          if (d.parent) {
                            return { ...d, value: convertAmount(d.value), name: `${d.parent}/${d.name}` }
                          }
                          return { ...d, value: convertAmount(d.value), name: d.name }
                        })}
                        title="Dépenses par Catégorie"
                        size={200}
                        currency={currencyForIntl as any}
                      />
                    </CardContent>
                  </Card>
                )}

                {stats.budgetsByCategory.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Répartition des Budgets</CardTitle>
                      <CardDescription>Budgets par catégorie</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CustomPieChart
                        data={stats.budgetsByCategory.map(d => ({ ...d, value: convertAmount(d.value) }))}
                        title="Budgets par Catégorie"
                        size={200}
                        currency={currencyForIntl as any}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="categories" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Analyse Hiérarchique des Catégories</CardTitle>
                  <CardDescription>Explorez vos dépenses par catégorie avec navigation interactive</CardDescription>
                </CardHeader>
                <CardContent>
                  {categoryHierarchy.length > 0 ? (
                    <HierarchicalPieChart
                      data={mapHierarchyValues(categoryHierarchy)}
                      onCategoryClick={(categoryId) => {
                        console.log("Category clicked:", categoryId)
                      }}
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
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Historique des Transactions</CardTitle>
                  <CardDescription>Toutes les transactions de ce projet</CardDescription>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    </div>
                  ) : stats.transactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Aucune transaction pour ce projet</p>
                      <p className="text-sm">Ajoutez des dépenses ou budgets pour voir l'historique</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Titre</TableHead>
                            <TableHead>Catégorie</TableHead>
                            <TableHead>Sous-catégorie</TableHead>
                            <TableHead>Montant</TableHead>
                            <TableHead>Utilisateur</TableHead>
                            <TableHead>Note</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stats.transactions.map((transaction) => (
                            <TableRow key={transaction.id} className={getTransactionBgColor(transaction.type)}>
                              <TableCell>
                                <Badge variant={transaction.type === "expense" ? "destructive" : "default"}>
                                  {transaction.type === "expense" ? "Dépense" : "Budget"}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">{transaction.title}</TableCell>
                              <TableCell>{transaction.parent_category_name || transaction.category_name || "Sans catégorie"}</TableCell>
                              <TableCell>{transaction.parent_category_name ? transaction.category_name : ""}</TableCell>
                              <TableCell className="font-medium">
                                {formatAmount(Number(transaction.amount))}
                              </TableCell>
                              <TableCell>{transaction.user_name}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {transaction.description && typeof transaction.description === 'string' && !/^data:.+;base64,/.test(transaction.description) && (
                                    <button
                                      className="p-1 hover:bg-muted rounded"
                                      title="Voir la note"
                                      onClick={() => setPreview({ type: 'text', content: String(transaction.description), title: 'Note' })}
                                    >
                                      <FileText className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                  )}
                                  {transaction.has_document && (
                                    <button
                                      className="p-1 hover:bg-muted rounded"
                                      title="Voir le document"
                                      onClick={async () => {
                                        const notes = await db.getNotesByTransaction(transaction.id)
                                        const doc = notes.find((n: any) => n.content_type === 'text' && n.file_path)
                                        if (doc) {
                                          const url = doc.content
                                          if (typeof window !== 'undefined') window.open(url, '_blank')
                                        }
                                      }}
                                    >
                                      <File className="h-4 w-4 text-purple-600" />
                                    </button>
                                  )}
                                  {transaction.has_image && (
                                    <button
                                      className="p-1 hover:bg-muted rounded"
                                      title="Voir l'image"
                                      onClick={async () => {
                                        const notes = await db.getNotesByTransaction(transaction.id)
                                        const img = notes.find((n: any) => n.content_type === 'image')
                                        if (img) setPreview({ type: 'image', content: img.content, title: img.file_path || 'Image' })
                                      }}
                                    >
                                      <Image className="h-4 w-4 text-blue-500" />
                                    </button>
                                  )}
                                  {transaction.has_audio && (
                                    <button
                                      className="p-1 hover:bg-muted rounded"
                                      title="Écouter l'audio"
                                      onClick={async () => {
                                        const notes = await db.getNotesByTransaction(transaction.id)
                                        const audio = notes.find((n: any) => n.content_type === 'audio')
                                        if (audio) setPreview({ type: 'audio', content: audio.content, title: audio.file_path || 'Audio' })
                                      }}
                                    >
                                      <Music className="h-4 w-4 text-green-600" />
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(transaction.created_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Preview Dialog */}
              <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{preview?.title || 'Aperçu'}</DialogTitle>
                  </DialogHeader>
                  {preview?.type === 'text' && (
                    <div className="whitespace-pre-wrap text-sm">{preview.content}</div>
                  )}
                  {preview?.type === 'image' && (
                    <img src={preview.content} alt={preview.title} className="max-w-full rounded border" />
                  )}
                  {preview?.type === 'audio' && (
                    <audio controls src={preview.content} className="w-full" />
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
