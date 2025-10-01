"use client"

import { useState, useEffect, useCallback } from "react"
import type { SupabaseDatabaseInstance } from "@/lib/database-supabase"
import type { CurrencyCode, ProjectWithId, Transaction } from "@/lib/types"
// L'import dynamique ci-dessous garantit que nous récupérons bien l'instance
// (export nommé ou par défaut) sans souci d'ordre de chargement.

type UseDatabaseResult = {
  db: SupabaseDatabaseInstance | null
  isReady: boolean
  isLoading: boolean
  error: string | null
}

export function useDatabase(): UseDatabaseResult {
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dbRef, setDbRef] = useState<SupabaseDatabaseInstance | null>(null)

  const initializeDb = useCallback(async () => {
    try {
      const mod: typeof import("@/lib/database") = await import("@/lib/database")
      const instance = mod.db ?? null

      if (!instance) {
        throw new Error("Database instance is not available")
      }

      await instance.initialize()
      setDbRef(instance)
      setIsReady(true)
    } catch (err: unknown) {
      console.error("[v0] Database initialization failed:", err)
      setError(err instanceof Error ? err.message : "Database initialization failed")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void initializeDb()
  }, [initializeDb])

  return {
    db: isReady ? dbRef : null,
    isReady,
    isLoading,
    error,
  }
}

export function useGlobalStats(displayCurrency?: CurrencyCode) {
  const [stats, setStats] = useState({
    totalExpenses: 0,
    totalBudgets: 0,
    balance: 0,
    transactionCount: 0,
    lastTransactionDate: null as string | null,
    projectCount: 0,
    expensesByMonth: [] as { month: string; amount: number }[],
    budgetsByMonth: [] as { month: string; amount: number }[]
  })
  const [isLoading, setIsLoading] = useState(true)
  const { isReady, db } = useDatabase()
  const loadStats = useCallback(async () => {
    if (!isReady || !db) {
      return
    }

    setIsLoading(true)
    try {
      const globalStats = await db.getGlobalStats()

      if (displayCurrency) {
        const totals = displayCurrency === 'CFA'
          ? { exp: globalStats.totalExpenses_cfa ?? 0, bud: globalStats.totalBudgets_cfa ?? 0 }
          : displayCurrency === 'USD'
          ? { exp: globalStats.totalExpenses_usd ?? 0, bud: globalStats.totalBudgets_usd ?? 0 }
          : { exp: globalStats.totalExpenses_eur ?? globalStats.totalExpenses ?? 0, bud: globalStats.totalBudgets_eur ?? globalStats.totalBudgets ?? 0 }

        setStats({
          ...globalStats,
          totalExpenses: totals.exp,
          totalBudgets: totals.bud,
          balance: totals.bud - totals.exp,
        })
      } else {
        setStats(globalStats)
      }
    } catch (error) {
      console.error("Failed to load global stats:", error)
    } finally {
      setIsLoading(false)
    }
  }, [db, displayCurrency, isReady])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  return { stats, isLoading, refetch: loadStats }
}

export function useRecentTransactions(limit = 10) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { isReady, db } = useDatabase()
  const loadTransactions = useCallback(async () => {
    if (!isReady || !db) {
      return
    }

    setIsLoading(true)
    try {
      const recentTransactions = await db.getRecentTransactions(limit)
      setTransactions(recentTransactions)
    } catch (error) {
      console.error("[useRecentTransactions] Failed to load recent transactions:", error)
    } finally {
      setIsLoading(false)
    }
  }, [db, isReady, limit])

  useEffect(() => {
    void loadTransactions()
  }, [loadTransactions])

  return { transactions, isLoading, refetch: loadTransactions }
}

type UseUserProjectsResult = {
  projects: ProjectWithId[]
  isLoading: boolean
  refetch: () => Promise<void>
}

export function useUserProjects(userId: string | number | null | undefined): UseUserProjectsResult {
  const [projects, setProjects] = useState<ProjectWithId[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { isReady, db } = useDatabase()

  const normalizedUserId = typeof userId === "string" || typeof userId === "number" ? userId : null

  const loadProjects = useCallback(async () => {
    if (!isReady || !db || normalizedUserId == null) {
      setProjects([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      const userProjects = await db.getUserProjects(normalizedUserId)
      const normalizedProjects = (userProjects ?? []).filter((project): project is ProjectWithId =>
        project?.id != null,
      )
      setProjects(normalizedProjects)
    } catch (error) {
      console.error("Failed to load user projects:", error)
    } finally {
      setIsLoading(false)
    }
  }, [db, isReady, normalizedUserId])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  return { projects, isLoading, refetch: loadProjects }
}

export function useProjectStats(projectId: number, currency?: CurrencyCode) {
  const [stats, setStats] = useState({
    totalExpenses: 0,
    totalBudgets: 0,
    balance: 0,
    expensesByCategory: [] as { name: string; value: number; color: string }[],
    budgetsByCategory: [] as { name: string; value: number; color: string }[],
    transactions: [] as Transaction[],
  })
  const [isLoading, setIsLoading] = useState(true)
  const { isReady, db } = useDatabase()
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!isReady || !projectId) return

    const loadProjectStats = async () => {
      try {
        if (!db) return

        const result = await db.getProjectTransactions(projectId)
        const transactions = Array.isArray(result) ? result.filter(isTransactionRecord) : []

        const expenses = transactions.filter((transaction) => transaction.type === "expense")
        const budgets = transactions.filter((transaction) => transaction.type === "budget")

        const getAmountForCurrency = (transaction: Transaction) => {
          if (currency === "CFA") return Number(transaction.amount_cfa ?? 0)
          if (currency === "USD") return Number(transaction.amount_usd ?? 0)
          return Number(transaction.amount_eur ?? transaction.amount ?? 0)
        }

        const totalExpenses = expenses.reduce((sum, transaction) => sum + getAmountForCurrency(transaction), 0)
        const totalBudgets = budgets.reduce((sum, transaction) => sum + getAmountForCurrency(transaction), 0)
        const balance = totalBudgets - totalExpenses

        const expensesByCategory = groupTransactionsByCategory(expenses, currency)
        const budgetsByCategory = groupTransactionsByCategory(budgets, currency)

        setStats({
          totalExpenses,
          totalBudgets,
          balance,
          expensesByCategory,
          budgetsByCategory,
          transactions,
        })
      } catch (error) {
        console.error("Failed to load project stats:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadProjectStats()
  }, [currency, db, isReady, projectId, reloadTick])

  // Rafraîchir sur événement global (ex: suppression transaction)
  useEffect(() => {
    const onUpdated = () => setReloadTick((x) => x + 1)
    window.addEventListener('expenshare:project-updated', onUpdated)
    return () => window.removeEventListener('expenshare:project-updated', onUpdated)
  }, [])

  const refetch = useCallback(() => {
    setReloadTick((value) => value + 1)
  }, [])

  return { stats, isLoading, refetch }
}

function groupTransactionsByCategory(transactions: Transaction[], currency?: CurrencyCode) {
  const categoryTotals = new Map<string, number>()

  transactions.forEach((transaction) => {
    // Si parent_category_name existe, on construit le label Catégorie/Sous-catégorie
    const label = transaction.parent_category_name
      ? `${transaction.parent_category_name}/${transaction.category_name}`
      : transaction.category_name ?? "Sans catégorie"

    let amount = 0
    if (currency === "CFA") amount = Number(transaction.amount_cfa ?? 0)
    else if (currency === "USD") amount = Number(transaction.amount_usd ?? 0)
    else amount = Number(transaction.amount_eur ?? transaction.amount ?? 0)

    categoryTotals.set(label, (categoryTotals.get(label) ?? 0) + amount)
  })

  return Array.from(categoryTotals.entries()).map(([name, value], index) => ({
    name,
    value,
    color: getColorForIndex(index),
  }))
}

const isTransactionRecord = (value: unknown): value is Transaction => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  const type = record.type
  const amount = record.amount
  return (type === "expense" || type === "budget") && typeof amount === "number"
}

function getColorForIndex(index: number): string {
  const colors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
    "#84cc16",
    "#f43f5e",
    "#06b6d4",
  ]
  return colors[index % colors.length]
}
