"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, DollarSign, FileText, Calendar, Folder, Clock, ArrowRight, Eye, EyeOff, Image, Music, File } from "lucide-react"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { db } from "@/lib/database"
import { useGlobalStats, useRecentTransactions } from "@/hooks/use-database"
import { formatCurrency, formatDate, formatDateRelative } from "@/lib/utils"
import { CustomPieChart } from "@/components/charts/pie-chart"
import { Button } from "@/components/ui/button"
// useState déjà importé en haut du fichier via "use client" (React hooks)

export function HomePage() {
  const { stats, isLoading: statsLoading, refetch: refetchStats } = useGlobalStats()
  const { transactions, isLoading: transactionsLoading, refetch: refetchTransactions } = useRecentTransactions(10)
  const [showDetails, setShowDetails] = useState(true)
  const [preview, setPreview] = useState<{ type: 'image'|'audio'|'text'; content: string; title: string } | null>(null)
  const [displayCurrency, setDisplayCurrency] = useState<"EUR"|"CFA"|"USD">("EUR")
  const [eurToCfa, setEurToCfa] = useState<number>(655.957)
  const [eurToUsd, setEurToUsd] = useState<number>(1.0)

  useEffect(() => {
    // Charger paramètres devise utilisateur
    const loadCurrency = async () => {
      try {
        const storedUser = localStorage.getItem("expenshare_user")
        if (!storedUser) return
        const user = JSON.parse(storedUser)
        // accès direct au module db pour lire settings
        const settingCurrency = await db.settings.get(`user:${user.id}:currency`)
        const settingCfa = await db.settings.get(`user:${user.id}:eur_to_cfa`)
        const settingUsd = await db.settings.get(`user:${user.id}:eur_to_usd`)
        if (settingCurrency?.value) setDisplayCurrency(settingCurrency.value as any)
        if (settingCfa?.value && !Number.isNaN(Number(settingCfa.value))) setEurToCfa(Number(settingCfa.value))
        if (settingUsd?.value && !Number.isNaN(Number(settingUsd.value))) setEurToUsd(Number(settingUsd.value))
      } catch {}
    }
    loadCurrency()

    const onCurrencyChanged = (e: Event) => {
      const ev = e as CustomEvent<any>
      if (ev.detail) {
        if (ev.detail.currency) setDisplayCurrency(ev.detail.currency)
        if (ev.detail.eurToCfa && !Number.isNaN(Number(ev.detail.eurToCfa))) setEurToCfa(Number(ev.detail.eurToCfa))
        if (ev.detail.eurToUsd && !Number.isNaN(Number(ev.detail.eurToUsd))) setEurToUsd(Number(ev.detail.eurToUsd))
      } else {
        // Replis: relire depuis DB
        loadCurrency()
      }
    }
    window.addEventListener('expenshare:currency-changed', onCurrencyChanged)
    
    // Écouter les mises à jour de projets pour recharger les données
    const onProjectUpdated = () => {
      refetchStats()
      refetchTransactions()
    }
    window.addEventListener('expenshare:project-updated', onProjectUpdated)
    
    return () => {
      window.removeEventListener('expenshare:currency-changed', onCurrencyChanged)
      window.removeEventListener('expenshare:project-updated', onProjectUpdated)
    }
  }, [])

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

  const formatAmount = (amountEur: number) => {
    const value = convertAmount(amountEur)
    const currency = displayCurrency === "CFA" ? "XOF" : displayCurrency
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(value)
  }

  const formatAmountByProject = (amountEur: number, projectCurrency: string) => {
    // Si pas de devise de projet spécifiée, utiliser la devise utilisateur globale
    if (!projectCurrency || projectCurrency === "EUR") {
      return formatAmount(amountEur)
    }
    
    // Utiliser la devise du projet
    const currency = projectCurrency === "XOF" ? "XOF" : projectCurrency
    let value = amountEur
    
    // Convertir selon la devise du projet
    if (projectCurrency === "XOF") {
      value = amountEur * eurToCfa
    } else if (projectCurrency === "USD") {
      value = amountEur * eurToUsd
    }
    
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(value)
  }

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return "text-green-600"
    if (balance < 0) return "text-red-600"
    return "text-gray-600"
  }

  const getTransactionBgColor = (type: string) => {
    return type === "expense" ? "bg-red-50 dark:bg-red-950/20" : "bg-blue-50 dark:bg-blue-950/20"
  }
  
  // Fonction pour vérifier si une transaction a toutes les propriétés nécessaires
  const isValidTransaction = (transaction: any): boolean => {
    return (
      transaction &&
      transaction.id !== undefined &&
      transaction.amount !== undefined &&
      transaction.amount !== null &&
      Number(transaction.amount) > 0
    )
  }

  const expenseChartData =
    stats.totalExpenses > 0 ? [{ name: "Dépenses", value: stats.totalExpenses, color: "#ef4444" }] : []

  const budgetChartData =
    stats.totalBudgets > 0 ? [{ name: "Budgets", value: stats.totalBudgets, color: "#3b82f6" }] : []

  const globalChartData = []
  if (stats.totalExpenses > 0) {
    globalChartData.push({ name: "Dépenses", value: stats.totalExpenses, color: "#ef4444" })
  }
  if (stats.totalBudgets > 0) {
    globalChartData.push({ name: "Budgets", value: stats.totalBudgets, color: "#3b82f6" })
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Tableau de bord</h2>
          <p className="text-muted-foreground">Vue d'ensemble de vos projets et activités</p>
        </div>
      </div>

      {/* Indicateurs globaux */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Dépenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {statsLoading ? "..." : formatAmount(stats.totalExpenses)}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <span>Tous projets confondus</span>
              {!statsLoading && stats.transactionCount > 0 && (
                <Badge variant="outline" className="ml-1 text-xs">
                  {stats.transactionCount} transaction{stats.transactionCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </CardContent>
          {!statsLoading && stats.lastTransactionDate && (
            <CardFooter className="pt-0 pb-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Dernière transaction: {formatDateRelative(stats.lastTransactionDate)}</span>
              </div>
            </CardFooter>
          )}
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Budgets</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {statsLoading ? "..." : formatAmount(stats.totalBudgets)}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <span>Fonds disponibles</span>
              {!statsLoading && stats.projectCount > 0 && (
                <Badge variant="outline" className="ml-1 text-xs">
                  {stats.projectCount} projet{stats.projectCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </CardContent>
          {!statsLoading && stats.projectCount > 0 && (
            <CardFooter className="pt-0 pb-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Folder className="h-3 w-3" />
                <span>Moyenne par projet: {formatAmount(stats.totalBudgets / stats.projectCount)}</span>
              </div>
            </CardFooter>
          )}
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solde Global</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getBalanceColor(stats.balance)}`}>
              {statsLoading ? "..." : formatAmount(stats.balance)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Budget - Dépenses
            </div>
          </CardContent>
          {!statsLoading && (
            <CardFooter className="pt-0 pb-2">
              <div className="flex items-center gap-1 text-xs">
                <span className={getBalanceColor(stats.balance)}>
                  {stats.balance >= 0 ? "Excédent" : "Déficit"}:
                </span>
                <span className="text-muted-foreground">
                  {Math.abs(stats.totalBudgets) > 0
                    ? `${Math.abs(Math.round((stats.balance / stats.totalBudgets) * 100))}% du budget`
                    : "N/A"}
                </span>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>

      {!statsLoading && (stats.totalExpenses > 0 || stats.totalBudgets > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Répartition Globale</CardTitle>
                <CardDescription>Vue d'ensemble des dépenses et budgets</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <CustomPieChart data={globalChartData.map(d => ({...d, value: convertAmount(d.value)}))} title="Dépenses vs Budgets" size={180} currency={displayCurrency === 'CFA' ? 'XOF' : displayCurrency} />
            </CardContent>
          </Card>

          {/* Indicateurs Visuels dans la 2e colonne */}
          <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Indicateurs Visuels</CardTitle>
              <CardDescription>Représentation graphique des totaux</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="h-8 gap-1"
            >
              {showDetails ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showDetails ? "Moins de détails" : "Plus de détails"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.totalExpenses > 0 && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Dépenses</span>
                    {showDetails && (
                      <Badge variant="outline" className="text-xs">
                        {Math.round((stats.totalExpenses / (stats.totalExpenses + stats.totalBudgets)) * 100)}% du total
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-red-600">{formatAmount(stats.totalExpenses)}</span>
                </div>
                <div className="w-full bg-red-100 rounded-full h-2.5">
                  <div
                    className="bg-red-500 h-2.5 rounded-full"
                    style={{
                      width: `${Math.min(100, (stats.totalExpenses / Math.max(stats.totalBudgets, stats.totalExpenses)) * 100)}%`,
                    }}
                  ></div>
                </div>
                {showDetails && stats.transactionCount > 0 && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-muted-foreground">Moyenne par transaction</span>
                    <span className="text-xs font-medium">{formatAmount(stats.totalExpenses / stats.transactionCount)}</span>
                  </div>
                )}
              </div>
            )}

            {stats.totalBudgets > 0 && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Budgets</span>
                    {showDetails && (
                      <Badge variant="outline" className="text-xs">
                        {Math.round((stats.totalBudgets / (stats.totalExpenses + stats.totalBudgets)) * 100)}% du total
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-blue-600">{formatAmount(stats.totalBudgets)}</span>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-2.5">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full"
                    style={{
                      width: `${Math.min(100, (stats.totalBudgets / Math.max(stats.totalBudgets, stats.totalExpenses)) * 100)}%`,
                    }}
                  ></div>
                </div>
                {showDetails && stats.projectCount > 0 && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-muted-foreground">Moyenne par projet</span>
                    <span className="text-xs font-medium">{formatCurrency(stats.totalBudgets / stats.projectCount)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 border-t">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Solde</span>
                  {showDetails && stats.totalBudgets > 0 && (
                    <Badge 
                      variant={stats.balance >= 0 ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {stats.balance >= 0 ? "Excédent" : "Déficit"}
                    </Badge>
                  )}
                </div>
                <span className={`text-sm font-bold ${getBalanceColor(stats.balance)}`}>
                  {formatCurrency(stats.balance)}
                </span>
              </div>
              
              {showDetails && (
                <div className="mt-2 p-2 bg-muted/50 rounded-md">
                  <div className="text-xs">
                    <div className="flex justify-between mb-1">
                      <span>Taux d'utilisation du budget:</span>
                      <span className="font-medium">
                        {stats.totalBudgets > 0 
                          ? `${Math.min(100, Math.round((stats.totalExpenses / stats.totalBudgets) * 100))}%` 
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Marge restante:</span>
                      <span className={`font-medium ${getBalanceColor(stats.balance)}`}>
                        {formatCurrency(stats.balance)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Dernières saisies */}
      <Card>
                  <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Dernières saisies</CardTitle>
                <CardDescription>Activité récente sur tous vos projets</CardDescription>
              </div>
              {/* Boutons supprimés selon la demande */}
            </div>
          </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-sm text-muted-foreground">Chargement des transactions...</p>
            </div>
          ) : transactions.filter(isValidTransaction).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Aucune saisie pour le moment</p>
              <p className="text-sm">Commencez par créer un projet et ajouter des dépenses</p>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline">
                  Créer une saisie
                </Button>
              </div>
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
                    <TableHead>Projet</TableHead>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions
                    .filter(isValidTransaction)
                    .map((transaction) => (
                    <TableRow key={transaction.id} className={getTransactionBgColor(transaction.type)}>
                      <TableCell>
                        <Badge variant={transaction.type === "expense" ? "destructive" : "default"}>
                          {transaction.type === "expense" ? "Dépense" : "Budget"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {transaction.title || "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {transaction.parent_category_name || transaction.category_name || "-"}
                      </TableCell>
                      <TableCell>
                        {transaction.parent_category_name ? transaction.category_name : ""}
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className={transaction.type === "expense" ? "text-red-600" : "text-blue-600"}>
                          {formatAmountByProject(Number(transaction.amount), transaction.project_currency)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg leading-none">{transaction.project_icon || "📁"}</span>
                          <span>{transaction.project_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{transaction.user_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {/* Icône texte si description présente (texte pur uniquement) */}
                          {transaction.description && typeof transaction.description === 'string' && !/^data:.+;base64,/.test(transaction.description) && (
                            <button
                              className="p-1 hover:bg-muted rounded"
                              title="Voir la note"
                              onClick={() => setPreview({ type: 'text', content: String(transaction.description), title: 'Note' })}
                            >
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            </button>
                          )}
                          {/* Icônes issues de la table notes (document/image/audio) */}
                          {transaction.has_document && (
                            <button
                              className="p-1 hover:bg-muted rounded"
                              title="Voir le document"
                              onClick={async () => {
                                const notes = await db.getNotesByTransaction(transaction.id)
                                const doc = notes.find((n: any) => n.content_type === 'text' && n.file_path)
                                if (doc) {
                                  // Ouvrir la data URL (pdf/doc) dans un nouvel onglet si possible
                                  const url = doc.content
                                  if (typeof window !== 'undefined') {
                                    window.open(url, '_blank')
                                  }
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
                      <TableCell>
                        {transaction.created_at ? new Date(transaction.created_at).toLocaleString('fr-FR') : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {transactions.length > 0 && (
          <CardFooter className="flex justify-between items-center py-2 border-t">
            <p className="text-xs text-muted-foreground">
              Affichage des {transactions.length} dernières transactions
            </p>
          </CardFooter>
        )}
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
    </div>
  )
}
