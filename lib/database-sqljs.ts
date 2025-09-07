"use client"

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

// Database schema types (same as before)
interface User {
  id?: number
  name: string
  pin_hash: string
  created_at?: Date | string
}

interface Project {
  id?: number
  name: string
  description?: string
  icon: string
  color: string
  currency: string
  created_by: number
  created_at?: Date | string
}

interface ProjectUser {
  project_id: number
  user_id: number
  role: string
  added_at?: Date | string
}

interface Category {
  id?: number
  project_id: number
  name: string
  parent_id?: number | null
  level: number
  created_at?: Date | string
}

interface Transaction {
  id?: number
  project_id: number
  user_id: number
  category_id?: number | null
  type: "expense" | "budget"
  amount: number
  title: string
  description?: string
  created_at?: Date | string
}

interface Note {
  id?: number
  transaction_id: number
  content_type: "text" | "image" | "audio"
  content: string
  file_path?: string
  created_at?: Date | string
}

interface Setting {
  key: string
  value: string
  updated_at?: Date | string
}

class SQLiteDatabaseManager {
  private SQL: SqlJsStatic | null = null
  private db: Database | null = null
  private isInitialized = false
  private dbName = 'expenseshare.db'

  constructor() {
    // Initialize in browser only
    if (typeof window !== 'undefined') {
      this.initialize().catch(console.error)
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Initialize SQL.js
      this.SQL = await initSqlJs({
        // Use local WASM files
        locateFile: (file: string) => `/sql-wasm.wasm`
      })

      // Try to load existing database from localStorage
      const existingDb = localStorage.getItem(this.dbName)
      
      if (existingDb) {
        // Load existing database
        const uint8Array = new Uint8Array(JSON.parse(existingDb))
        this.db = new this.SQL.Database(uint8Array)
      } else {
        // Create new database
        this.db = new this.SQL.Database()
        await this.createTables()
      }

      this.isInitialized = true
      console.log("[ExpenseShare] SQLite database initialized successfully")
    } catch (error) {
      console.error("[ExpenseShare] Failed to initialize SQLite database:", error)
      throw error
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized")

    try {
      // Table Users
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          pin_hash TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Table Projects
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT NOT NULL,
          color TEXT NOT NULL,
          currency TEXT DEFAULT 'EUR',
          created_by INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `)

      // Table ProjectUsers
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS project_users (
          project_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          role TEXT NOT NULL,
          added_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (project_id, user_id),
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `)

      // Table Categories
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          parent_id INTEGER,
          level INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (parent_id) REFERENCES categories(id)
        )
      `)

      // Table Transactions
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          category_id INTEGER,
          type TEXT CHECK(type IN ('expense', 'budget')) NOT NULL,
          amount REAL NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (category_id) REFERENCES categories(id)
        )
      `)

      // Table Notes
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id INTEGER NOT NULL,
          content_type TEXT CHECK(content_type IN ('text', 'image', 'audio')) NOT NULL,
          content TEXT NOT NULL,
          file_path TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        )
      `)

      // Table Settings
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Save database to localStorage
      this.saveDatabase()
    } catch (error) {
      console.error("[ExpenseShare] Failed to create tables:", error)
      throw error
    }
  }

  private saveDatabase(): void {
    if (!this.db) return
    
    try {
      const data = this.db.export()
      localStorage.setItem(this.dbName, JSON.stringify(Array.from(data)))
    } catch (error) {
      console.error("[ExpenseShare] Failed to save database:", error)
    }
  }

  get isReady(): boolean {
    return this.isInitialized && this.db !== null
  }

  // User operations
  async createUser(name: string, pinHash: string): Promise<number> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare("INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?)")
      stmt.run([name, pinHash, new Date().toISOString()])
      const result = this.db.exec("SELECT last_insert_rowid()")[0]
      const userId = result.values[0][0] as number
      
      this.saveDatabase()
      return userId
    } catch (error) {
      console.error("[ExpenseShare] Failed to create user:", error)
      throw error
    }
  }

  async getUserByName(name: string): Promise<User | null> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare("SELECT * FROM users WHERE name = ?")
      stmt.bind([name])
      
      if (stmt.step()) {
        const row = stmt.getAsObject()
        return row as User
      }
      return null
    } catch (error) {
      console.error("[ExpenseShare] Failed to get user by name:", error)
      return null
    }
  }

  // Project operations
  async createProject(name: string, description: string, icon: string, color: string, currency: string, userId: number): Promise<number> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      // Check if project name already exists for this user
      const exists = await this.checkProjectNameExists(name, userId)
      if (exists) {
        throw new Error("Un projet avec ce nom existe déjà")
      }

      const projectStmt = this.db.prepare("INSERT INTO projects (name, description, icon, color, currency, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      projectStmt.run([name, description, icon, color, currency, userId, new Date().toISOString()])
      
      const result = this.db.exec("SELECT last_insert_rowid()")[0]
      const projectId = result.values[0][0] as number

      // Add user to project
      const userStmt = this.db.prepare("INSERT INTO project_users (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)")
      userStmt.run([projectId, userId, "owner", new Date().toISOString()])

      this.saveDatabase()
      return projectId
    } catch (error) {
      console.error("[ExpenseShare] Failed to create project:", error)
      throw error
    }
  }

  async checkProjectNameExists(name: string, userId: number): Promise<boolean> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM projects p
        JOIN project_users pu ON p.id = pu.project_id
        WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(?)) AND pu.user_id = ?
      `)
      stmt.bind([name, userId])
      
      if (stmt.step()) {
        const row = stmt.getAsObject()
        return (row.count as number) > 0
      }
      return false
    } catch (error) {
      console.error("[ExpenseShare] Failed to check project name:", error)
      return false
    }
  }

  async getUserProjects(userId: number): Promise<any[]> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare(`
        SELECT p.*, pu.role 
        FROM projects p
        JOIN project_users pu ON p.id = pu.project_id
        WHERE pu.user_id = ?
        ORDER BY p.created_at DESC
      `)
      stmt.bind([userId])
      
      const projects = []
      while (stmt.step()) {
        projects.push(stmt.getAsObject())
      }
      
      return projects
    } catch (error) {
      console.error("[ExpenseShare] Failed to get user projects:", error)
      return []
    }
  }

  async getProjectById(projectId: number): Promise<Project | null> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare("SELECT * FROM projects WHERE id = ?")
      stmt.bind([projectId])
      
      if (stmt.step()) {
        return stmt.getAsObject() as Project
      }
      return null
    } catch (error) {
      console.error("[ExpenseShare] Failed to get project:", error)
      return null
    }
  }

  async updateProject(projectId: number, projectData: {
    name: string, 
    description: string, 
    icon: string, 
    color: string, 
    currency: string
  }): Promise<boolean> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare("UPDATE projects SET name = ?, description = ?, icon = ?, color = ?, currency = ? WHERE id = ?")
      stmt.run([projectData.name, projectData.description, projectData.icon, projectData.color, projectData.currency, projectId])
      
      this.saveDatabase()
      return true
    } catch (error) {
      console.error("[ExpenseShare] Failed to update project:", error)
      return false
    }
  }

  // Transaction operations
  async createTransaction(
    projectId: number,
    userId: number,
    categoryId: number | null,
    type: "expense" | "budget",
    amount: number,
    title: string,
    description?: string,
  ): Promise<number> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare("INSERT INTO transactions (project_id, user_id, category_id, type, amount, title, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      stmt.run([projectId, userId, categoryId, type, amount, title, description || null, new Date().toISOString()])
      
      const result = this.db.exec("SELECT last_insert_rowid()")[0]
      const transactionId = result.values[0][0] as number
      
      this.saveDatabase()
      return transactionId
    } catch (error) {
      console.error("[ExpenseShare] Failed to create transaction:", error)
      throw error
    }
  }

  async getRecentTransactions(limit = 10): Promise<any[]> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare(`
        SELECT t.*, 
               p.name as project_name, p.icon as project_icon, p.color as project_color,
               u.name as user_name,
               c.name as category_name,
               pc.name as parent_category_name
        FROM transactions t
        JOIN projects p ON t.project_id = p.id
        JOIN users u ON t.user_id = u.id
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        ORDER BY t.created_at DESC
        LIMIT ?
      `)
      stmt.bind([limit])
      
      const transactions = []
      while (stmt.step()) {
        const row = stmt.getAsObject()
        
        // Build category hierarchy
        const categoryHierarchy = []
        if (row.parent_category_name) {
          categoryHierarchy.push(row.parent_category_name)
        }
        if (row.category_name) {
          categoryHierarchy.push(row.category_name)
        }
        
        transactions.push({
          ...row,
          category_hierarchy: categoryHierarchy,
          has_notes: !!row.description,
          has_media: false
        })
      }
      
      return transactions
    } catch (error) {
      console.error("[ExpenseShare] Failed to get recent transactions:", error)
      return []
    }
  }

  async getProjectTransactions(projectId: number): Promise<any[]> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare(`
        SELECT t.*, 
               u.name as user_name,
               c.name as category_name
        FROM transactions t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.project_id = ?
        ORDER BY t.created_at DESC
      `)
      stmt.bind([projectId])
      
      const transactions = []
      while (stmt.step()) {
        transactions.push(stmt.getAsObject())
      }
      
      return transactions
    } catch (error) {
      console.error("[ExpenseShare] Failed to get project transactions:", error)
      return []
    }
  }

  // Statistics operations
  async getGlobalStats(): Promise<{
    totalExpenses: number;
    totalBudgets: number;
    balance: number;
    transactionCount: number;
    lastTransactionDate: string | null;
    projectCount: number;
    expensesByMonth: { month: string; amount: number }[];
    budgetsByMonth: { month: string; amount: number }[];
  }> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      // Get all transactions
      const transactionStmt = this.db.prepare("SELECT * FROM transactions ORDER BY created_at DESC")
      const transactions = []
      while (transactionStmt.step()) {
        transactions.push(transactionStmt.getAsObject())
      }

      // Calculate totals
      let totalExpenses = 0
      let totalBudgets = 0
      let transactionCount = transactions.length
      
      const expensesByMonth: { [key: string]: number } = {}
      const budgetsByMonth: { [key: string]: number } = {}
      
      const now = new Date()
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(now.getMonth() - 5)
      
      // Initialize last 6 months
      for (let i = 0; i < 6; i++) {
        const d = new Date()
        d.setMonth(now.getMonth() - i)
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        expensesByMonth[monthKey] = 0
        budgetsByMonth[monthKey] = 0
      }

      transactions.forEach((t: any) => {
        const amount = Number(t.amount)
        const createdAt = new Date(t.created_at)
        const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`

        if (t.type === 'expense') {
          totalExpenses += amount
          if (expensesByMonth.hasOwnProperty(monthKey)) {
            expensesByMonth[monthKey] += amount
          }
        } else if (t.type === 'budget') {
          totalBudgets += amount
          if (budgetsByMonth.hasOwnProperty(monthKey)) {
            budgetsByMonth[monthKey] += amount
          }
        }
      })

      // Get project count
      const projectStmt = this.db.prepare("SELECT COUNT(*) as count FROM projects")
      projectStmt.step()
      const projectCount = (projectStmt.getAsObject().count as number) || 0

      // Last transaction date
      const lastTransactionDate = transactions.length > 0 ? transactions[0].created_at : null

      const balance = totalBudgets - totalExpenses

      // Convert to arrays
      const expensesByMonthArray = Object.entries(expensesByMonth).map(([month, amount]) => ({
        month,
        amount
      })).sort((a, b) => a.month.localeCompare(b.month))
      
      const budgetsByMonthArray = Object.entries(budgetsByMonth).map(([month, amount]) => ({
        month,
        amount
      })).sort((a, b) => a.month.localeCompare(b.month))

      return {
        totalExpenses,
        totalBudgets,
        balance,
        transactionCount,
        lastTransactionDate,
        projectCount,
        expensesByMonth: expensesByMonthArray,
        budgetsByMonth: budgetsByMonthArray,
      }
    } catch (error) {
      console.error("[ExpenseShare] Failed to get global stats:", error)
      return {
        totalExpenses: 0,
        totalBudgets: 0,
        balance: 0,
        transactionCount: 0,
        lastTransactionDate: null,
        projectCount: 0,
        expensesByMonth: [],
        budgetsByMonth: [],
      }
    }
  }

  // Category operations
  async createCategory(projectId: number, name: string, parentId?: number): Promise<number> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      let level = 1
      if (parentId) {
        const parentStmt = this.db.prepare("SELECT level FROM categories WHERE id = ?")
        parentStmt.bind([parentId])
        if (parentStmt.step()) {
          const parent = parentStmt.getAsObject()
          level = (parent.level as number) + 1
        }
      }

      const stmt = this.db.prepare("INSERT INTO categories (project_id, name, parent_id, level, created_at) VALUES (?, ?, ?, ?, ?)")
      stmt.run([projectId, name, parentId || null, level, new Date().toISOString()])
      
      const result = this.db.exec("SELECT last_insert_rowid()")[0]
      const categoryId = result.values[0][0] as number
      
      this.saveDatabase()
      return categoryId
    } catch (error) {
      console.error("[ExpenseShare] Failed to create category:", error)
      throw error
    }
  }

  async getProjectCategories(projectId: number): Promise<Category[]> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare("SELECT * FROM categories WHERE project_id = ? ORDER BY level, name")
      stmt.bind([projectId])
      
      const categories = []
      while (stmt.step()) {
        categories.push(stmt.getAsObject() as Category)
      }
      
      return categories
    } catch (error) {
      console.error("[ExpenseShare] Failed to get project categories:", error)
      return []
    }
  }

  async getProjectCategoryHierarchy(projectId: number): Promise<any[]> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const categories = await this.getProjectCategories(projectId)
      
      // Get transactions for this project
      const transactionStmt = this.db.prepare("SELECT * FROM transactions WHERE project_id = ?")
      transactionStmt.bind([projectId])
      
      const transactions = []
      while (transactionStmt.step()) {
        transactions.push(transactionStmt.getAsObject())
      }

      // Calculate totals by category
      const totals = new Map()
      transactions.forEach((t: any) => {
        if (t.category_id) {
          const key = `${t.category_id}_${t.type}`
          totals.set(key, (totals.get(key) || 0) + Number(t.amount))
        }
      })

      // Helper function to get color for index
      const getColorForIndex = (index: number) => {
        const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"]
        return colors[index % colors.length]
      }

      // Build hierarchy
      const buildHierarchy = (parentId: number | null = null, level = 1): any[] => {
        return categories
          .filter((cat) => cat.parent_id === parentId)
          .map((category, index) => {
            const expenseTotal = totals.get(`${category.id}_expense`) || 0
            const budgetTotal = totals.get(`${category.id}_budget`) || 0

            const children = buildHierarchy(category.id!, level + 1)

            // Add children totals to parent
            const childrenExpenseTotal = children.reduce((sum, child) => sum + (child.expenseValue || 0), 0)
            const childrenBudgetTotal = children.reduce((sum, child) => sum + (child.budgetValue || 0), 0)

            const totalExpenseValue = expenseTotal + childrenExpenseTotal
            const totalBudgetValue = budgetTotal + childrenBudgetTotal

            return {
              id: category.id!.toString(),
              name: category.name,
              value: totalExpenseValue,
              expenseValue: totalExpenseValue,
              budgetValue: totalBudgetValue,
              color: getColorForIndex(index + level * 3),
              level,
              parentId: parentId?.toString(),
              children: children.length > 0 ? children : undefined,
            }
          })
          .filter((item) => item.value > 0)
      }

      return buildHierarchy()
    } catch (error) {
      console.error("[ExpenseShare] Failed to get category hierarchy:", error)
      return []
    }
  }

  // Utility methods
  async resetDatabase(): Promise<void> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      // Drop all tables
      this.db.exec(`
        DROP TABLE IF EXISTS notes;
        DROP TABLE IF EXISTS transactions;
        DROP TABLE IF EXISTS categories;
        DROP TABLE IF EXISTS project_users;
        DROP TABLE IF EXISTS projects;
        DROP TABLE IF EXISTS users;
        DROP TABLE IF EXISTS settings;
      `)

      // Recreate tables
      await this.createTables()
      
      console.log("[ExpenseShare] Database reset successfully")
    } catch (error) {
      console.error("[ExpenseShare] Failed to reset database:", error)
      throw error
    }
  }

  // Download database file
  downloadDatabase(): void {
    if (!this.db) return
    
    try {
      const data = this.db.export()
      const blob = new Blob([data], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'expenseshare.db'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("[ExpenseShare] Failed to download database:", error)
    }
  }

  // Upload database file
  async uploadDatabase(file: File): Promise<void> {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      if (this.SQL) {
        this.db = new this.SQL.Database(uint8Array)
        this.saveDatabase()
        console.log("[ExpenseShare] Database uploaded successfully")
      }
    } catch (error) {
      console.error("[ExpenseShare] Failed to upload database:", error)
      throw error
    }
  }
}

// Singleton instance
export const db = new SQLiteDatabaseManager()
