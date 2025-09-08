"use client"

import { useState, useEffect } from "react"
// L'import dynamique ci-dessous garantit que nous récupérons bien l'instance
// (export nommé ou par défaut) sans souci d'ordre de chargement.

export function useDatabase() {
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dbRef, setDbRef] = useState<any>(null)

  useEffect(() => {
    const initializeDb = async () => {
      try {
        const mod: any = await import("@/lib/database")
        const instance = mod?.db ?? mod?.default
        if (!instance) {
          throw new Error("Database instance is not available")
        }
        await instance.initialize()
        setDbRef(instance)
        setIsReady(true)
      } catch (err) {
  console.error("[v0] Database initialization failed:", err)
        setError(err instanceof Error ? err.message : "Database initialization failed")
      } finally {
        setIsLoading(false)
      }
    }

    initializeDb()
  }, [])

  return {
  db: isReady ? dbRef : null,
    isReady,
    isLoading,
    error,
  }
}

export function useGlobalStats() {
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

  const loadStats = async () => {
    if (!isReady || !db) return
    
    setIsLoading(true)
    try {
      const globalStats = await db.getGlobalStats()
      setStats(globalStats)
    } catch (error) {
      console.error("Failed to load global stats:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [isReady, db])

  return { stats, isLoading, refetch: loadStats }
}

export function useRecentTransactions(limit = 10) {
  const [transactions, setTransactions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { isReady, db } = useDatabase()

  const loadTransactions = async () => {
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
  }

  useEffect(() => {
    loadTransactions()
  }, [isReady, db, limit])

  return { transactions, isLoading, refetch: loadTransactions }
}

export function useUserProjects(userId: number) {
  const [projects, setProjects] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { isReady, db } = useDatabase()

  // Déclare la fonction de chargement en dehors du useEffect pour pouvoir l'utiliser dans refetch
  const loadProjects = async () => {
    if (!isReady || !db || !userId) return
    setIsLoading(true)
    try {
      const userProjects = await db.getUserProjects(userId)
      setProjects(userProjects)
    } catch (error) {
      console.error("Failed to load user projects:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [isReady, db, userId])

  return { projects, isLoading, refetch: loadProjects }
}

export function useProjectStats(projectId: number) {
  const [stats, setStats] = useState({
  totalExpenses: 0,
  totalBudgets: 0,
  balance: 0,
  expensesByCategory: [] as { name: string; value: number; color: string }[],
  budgetsByCategory: [] as { name: string; value: number; color: string }[],
  transactions: [] as any[],
  })
  const [isLoading, setIsLoading] = useState(true)
  const { isReady, db } = useDatabase()

  useEffect(() => {
    if (!isReady || !projectId) return

    const loadProjectStats = async () => {
      try {
  if (!db) return
  // Get project transactions
  const transactions = await db.getProjectTransactions(projectId)

        // Calculate totals
  const expenses = transactions.filter((t: any) => t.type === "expense")
  const budgets = transactions.filter((t: any) => t.type === "budget")

  const totalExpenses = expenses.reduce((sum: number, t: any) => sum + Number(t.amount), 0)
  const totalBudgets = budgets.reduce((sum: number, t: any) => sum + Number(t.amount), 0)
        const balance = totalBudgets - totalExpenses

        // Group by categories
        const expensesByCategory = groupTransactionsByCategory(expenses)
        const budgetsByCategory = groupTransactionsByCategory(budgets)

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
  }, [isReady, db, projectId])

  return { stats, isLoading, refetch: () => setIsLoading(true) }
}

function groupTransactionsByCategory(transactions: any[]) {
  const categoryMap = new Map()

  transactions.forEach((transaction) => {
    // Si parent_category_name existe, on construit le label Catégorie/Sous-catégorie
    let label = ""
    if (transaction.parent_category_name) {
      label = `${transaction.parent_category_name}/${transaction.category_name}`
    } else {
      label = transaction.category_name || "Sans catégorie"
    }
    const amount = Number(transaction.amount)

    if (categoryMap.has(label)) {
      categoryMap.set(label, categoryMap.get(label) + amount)
    } else {
      categoryMap.set(label, amount)
    }
  })

  return Array.from(categoryMap.entries()).map(([name, value], index) => ({
    name,
    value,
    color: getColorForIndex(index),
  }))
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
