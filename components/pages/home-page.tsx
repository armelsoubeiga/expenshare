"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, DollarSign, Folder, Clock, Eye, EyeOff, RefreshCw, Plus, Settings } from "lucide-react"
import type { CurrencyCode, Transaction } from "@/lib/types"
import { normalizeCurrencyCode, formatDateRelative } from "@/lib/utils"
import { db } from "@/lib/database"
import { useGlobalStats, useRecentTransactions } from "@/hooks/use-database"
import { CustomPieChart } from "@/components/charts/pie-chart"
import { TransactionTable } from "@/components/ui/transaction-table"
import { useNavigation } from "@/lib/navigation-context"


const CURRENCIES: CurrencyCode[] = ["EUR", "CFA", "USD"]

export function HomePage() {
  const { navigate } = useNavigation()
  const [showDetails, setShowDetails] = useState(true)
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("EUR")

  const { stats, isLoading: statsLoading, refetch: refetchStats } = useGlobalStats(displayCurrency)
  const { transactions, isLoading: txLoading, refetch: refetchTx } = useRecentTransactions(10)

  const persistCurrency = async (c: CurrencyCode) => {
    try {
      const stored = localStorage.getItem("expenshare_user")
      if (!stored) return
      const user = JSON.parse(stored)
      await db.settings.put({ key: `user:${user.id}:currency`, value: c })
    } catch {}
  }

  useEffect(() => {
    const loadCurrency = async () => {
      try {
        const stored = localStorage.getItem("expenshare_user")
        if (!stored) return
        const user = JSON.parse(stored)
        const cur = await db.settings.get(`user:${user.id}:currency`)
        const n = normalizeCurrencyCode(cur?.value)
        if (n) setDisplayCurrency(n)
        refetchStats()
      } catch {}
    }
    loadCurrency()

    const onCurrencyChanged = (e: Event) => {
      const ev = e as CustomEvent<{ currency?: string }>
      if (ev.detail?.currency) { const n = normalizeCurrencyCode(ev.detail.currency); if (n) setDisplayCurrency(n) }
      refetchStats()
    }
    const onUpdated = () => { refetchStats(); refetchTx() }

    window.addEventListener('expenshare:currency-changed', onCurrencyChanged)
    window.addEventListener('expenshare:project-updated', onUpdated)
    return () => {
      window.removeEventListener('expenshare:currency-changed', onCurrencyChanged)
      window.removeEventListener('expenshare:project-updated', onUpdated)
    }
  }, [refetchStats, refetchTx])

  const fmtCurrency = (amount: number, currency: string) => {
    const isWhole = Number.isInteger(Math.round(amount * 100) / 100) || currency === 'XOF'
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: currency === 'XOF' ? 0 : 2,
    }).format(amount)
  }

  const fmt = (amount: number) => {
    const currency = displayCurrency === "CFA" ? "XOF" : displayCurrency
    return fmtCurrency(amount, currency)
  }

  const fmtTx = (tx: Transaction) => {
    const currency = displayCurrency === "CFA" ? "XOF" : displayCurrency
    let value: number
    if (displayCurrency === 'CFA') value = Number(tx.amount_cfa ?? tx.amount_eur ?? tx.amount ?? 0)
    else if (displayCurrency === 'USD') value = Number(tx.amount_usd ?? tx.amount_eur ?? tx.amount ?? 0)
    else value = Number(tx.amount_eur ?? tx.amount ?? 0)
    return fmtCurrency(value, currency)
  }

  const balanceColor = (v: number) => v > 0 ? "text-green-600" : v < 0 ? "text-red-600" : "text-gray-600"

  const isValidTx = (t: Transaction): t is Transaction =>
    t?.id != null && Number.isFinite(Number(t.amount ?? t.amount_eur ?? 0)) && Number(t.amount ?? t.amount_eur ?? 0) > 0

  const validTx = transactions.filter(isValidTx)

  const globalChartData = []
  if (stats.totalExpenses > 0) globalChartData.push({ name: "Dépenses", value: stats.totalExpenses, color: "#ef4444" })
  if (stats.totalBudgets > 0) globalChartData.push({ name: "Budgets", value: stats.totalBudgets, color: "#3b82f6" })

  return (
    <div className="p-4 space-y-6 max-w-screen-2xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Tableau de bord</h2>
          <p className="text-sm text-muted-foreground">Vue d'ensemble de vos projets et activités</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            {CURRENCIES.map(c => (
              <button
                key={c}
                onClick={() => { setDisplayCurrency(c); void persistCurrency(c) }}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-all border ${
                  displayCurrency === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40 bg-card'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {/* Message si les taux ne sont pas configurés */}
          {displayCurrency !== 'EUR' && !statsLoading && (
            (displayCurrency === 'CFA' && !stats.eurToCfa) ||
            (displayCurrency === 'USD' && !stats.eurToUsd)
          ) && (
            <button
              onClick={() => navigate({ type: 'settings' })}
              className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
            >
              <Settings className="h-3 w-3" />
              Taux non configuré → Paramètres
            </button>
          )}
        </div>
      </div>

      {/* Indicateurs globaux */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="py-4 gap-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-4">
            <CardTitle className="text-sm font-medium">Total Dépenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent className="px-4">
            <div className="text-2xl font-bold text-red-600">
              {statsLoading ? <span className="h-7 w-32 bg-muted animate-pulse rounded block" /> : fmt(stats.totalExpenses)}
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
            <CardFooter className="pt-0 pb-1 px-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Dernière : {formatDateRelative(stats.lastTransactionDate)}</span>
              </div>
            </CardFooter>
          )}
        </Card>

        <Card className="py-4 gap-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-4">
            <CardTitle className="text-sm font-medium">Total Budgets</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="px-4">
            <div className="text-2xl font-bold text-blue-600">
              {statsLoading ? <span className="h-7 w-32 bg-muted animate-pulse rounded block" /> : fmt(stats.totalBudgets)}
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
            <CardFooter className="pt-0 pb-1 px-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Folder className="h-3 w-3" />
                <span>Moyenne / projet : {fmt(stats.totalBudgets / stats.projectCount)}</span>
              </div>
            </CardFooter>
          )}
        </Card>

        <Card className="py-4 gap-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-4">
            <CardTitle className="text-sm font-medium">Solde Global</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent className="px-4">
            <div className={`text-2xl font-bold ${balanceColor(stats.balance)}`}>
              {statsLoading ? <span className="h-7 w-32 bg-muted animate-pulse rounded block" /> : fmt(stats.balance)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Budget − Dépenses</div>
          </CardContent>
          {!statsLoading && (
            <CardFooter className="pt-0 pb-1 px-4">
              <div className="flex items-center gap-1 text-xs">
                <span className={balanceColor(stats.balance)}>
                  {stats.balance >= 0 ? "Excédent" : "Déficit"} :
                </span>
                <span className="text-muted-foreground">
                  {stats.totalBudgets > 0
                    ? `${Math.abs(Math.round((stats.balance / stats.totalBudgets) * 100))}% du budget`
                    : "N/A"}
                </span>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>

      {/* Charts + indicateurs visuels */}
      {!statsLoading && (stats.totalExpenses > 0 || stats.totalBudgets > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Répartition Globale</CardTitle>
              <CardDescription>Vue d'ensemble des dépenses et budgets</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomPieChart data={globalChartData} title="Dépenses vs Budgets" size={180} currency={displayCurrency === 'CFA' ? 'XOF' : displayCurrency} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Indicateurs Visuels</CardTitle>
                <CardDescription>Représentation graphique des totaux</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowDetails(!showDetails)} className="h-8 gap-1">
                {showDetails ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showDetails ? "Moins" : "Plus"}
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
                          {Math.round((stats.totalExpenses / Math.max(1, stats.totalExpenses + stats.totalBudgets)) * 100)}% du total
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-red-600">{fmt(stats.totalExpenses)}</span>
                  </div>
                  <div className="w-full bg-red-100 dark:bg-red-950/20 rounded-full h-2.5">
                    <div className="bg-red-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, (stats.totalExpenses / Math.max(stats.totalBudgets, stats.totalExpenses)) * 100)}%` }} />
                  </div>
                  {showDetails && stats.transactionCount > 0 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-muted-foreground">Moyenne / transaction</span>
                      <span className="text-xs font-medium">{fmt(stats.totalExpenses / Math.max(1, stats.transactionCount))}</span>
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
                          {Math.round((stats.totalBudgets / Math.max(1, stats.totalExpenses + stats.totalBudgets)) * 100)}% du total
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-blue-600">{fmt(stats.totalBudgets)}</span>
                  </div>
                  <div className="w-full bg-blue-100 dark:bg-blue-950/20 rounded-full h-2.5">
                    <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, (stats.totalBudgets / Math.max(stats.totalBudgets, stats.totalExpenses)) * 100)}%` }} />
                  </div>
                  {showDetails && stats.projectCount > 0 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-muted-foreground">Moyenne / projet</span>
                      <span className="text-xs font-medium">{fmt(stats.totalBudgets / Math.max(1, stats.projectCount))}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 border-t">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Solde</span>
                    {showDetails && stats.totalBudgets > 0 && (
                      <Badge variant={stats.balance >= 0 ? "default" : "destructive"} className="text-xs">
                        {stats.balance >= 0 ? "Excédent" : "Déficit"}
                      </Badge>
                    )}
                  </div>
                  <span className={`text-sm font-bold ${balanceColor(stats.balance)}`}>{fmt(stats.balance)}</span>
                </div>
                {showDetails && (
                  <div className="mt-2 p-2 bg-muted/50 rounded-md text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Taux d'utilisation :</span>
                      <span className="font-medium">{stats.totalBudgets > 0 ? `${Math.min(100, Math.round((stats.totalExpenses / stats.totalBudgets) * 100))}%` : "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Marge restante :</span>
                      <span className={`font-medium ${balanceColor(stats.balance)}`}>{fmt(stats.balance)}</span>
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Dernières saisies</CardTitle>
              <CardDescription>Activité récente sur tous vos projets</CardDescription>
            </div>
            <button
              onClick={() => { refetchStats(); refetchTx() }}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              title="Rafraîchir"
            >
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              <p className="mt-2 text-sm text-muted-foreground">Chargement…</p>
            </div>
          ) : (
            <TransactionTable
              transactions={validTx}
              formatAmount={fmtTx}
              showProject={true}
              emptyMessage="Aucune saisie pour le moment. Commencez par créer un projet et ajouter des dépenses."
            />
          )}
        </CardContent>
        {validTx.length > 0 && (
          <CardFooter className="py-2 border-t">
            <p className="text-xs text-muted-foreground">Affichage des {validTx.length} dernières transactions</p>
          </CardFooter>
        )}
      </Card>

      {/* FAB saisie rapide */}
      <button
        onClick={() => navigate({ type: 'new-transaction' })}
        className="fixed bottom-[76px] right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
        title="Saisir une dépense"
        aria-label="Saisir une dépense"
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </div>
  )
}
