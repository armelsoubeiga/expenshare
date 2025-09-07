"use client"

import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'
import { getColorForIndex } from "./utils"

// Base de données SQLite
class SQLiteService {
  private dbInstance: any = null
  private isInitialized: boolean = false

  constructor() {
    // L'initialisation sera effectuée à la demande
  }

  async initialize() {
    if (this.isInitialized) return

    try {
      console.log("[ExpenseShare] Initializing SQLite database...")
      
      // Ouvrir la base de données SQLite
      this.dbInstance = await open({
        filename: path.join(process.cwd(), 'expenshare.db'),
        driver: sqlite3.Database
      })

      // Créer les tables si elles n'existent pas
      await this.createTables()
      
      this.isInitialized = true
      console.log("[ExpenseShare] SQLite database initialized successfully")
    } catch (error) {
      console.error("[ExpenseShare] Failed to initialize SQLite database:", error)
      throw error
    }
  }

  private async createTables() {
    // Table Users
    await this.dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Table Projects
    await this.dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        currency TEXT DEFAULT 'EUR',
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `)

    // Table ProjectUsers
    await this.dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS project_users (
        project_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, user_id),
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `)

    // Table Categories
    await this.dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        parent_id INTEGER,
        level INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (parent_id) REFERENCES categories(id)
      )
    `)

    // Table Transactions
    await this.dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        category_id INTEGER,
        type TEXT CHECK(type IN ('expense', 'budget')) NOT NULL,
        amount REAL NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `)

    // Table Notes
    await this.dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        content_type TEXT CHECK(content_type IN ('text', 'image', 'audio')) NOT NULL,
        content TEXT NOT NULL,
        file_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
      )
    `)

    // Table Settings
    await this.dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  // User operations
  async createUser(name: string, pinHash: string): Promise<number> {
    if (!this.isInitialized) await this.initialize()

    try {
      const result = await this.dbInstance.run(
        `INSERT INTO users (name, pin_hash) VALUES (?, ?)`,
        [name, pinHash]
      )
      return result.lastID
    } catch (error) {
      console.error("[ExpenseShare] Failed to create user:", error)
      throw error
    }
  }

  async getUserByName(name: string) {
    if (!this.isInitialized) await this.initialize()

    try {
      const user = await this.dbInstance.get(
        `SELECT * FROM users WHERE name = ?`,
        [name]
      )
      return user || null
    } catch (error) {
      console.error("[ExpenseShare] Failed to get user:", error)
      return null
    }
  }

  async getAllUsers() {
    if (!this.isInitialized) await this.initialize()

    try {
      const users = await this.dbInstance.all(`SELECT * FROM users`)
      return users
    } catch (error) {
      console.error("[ExpenseShare] Failed to get all users:", error)
      return []
    }
  }

  // Project operations
  async createProject(projectData: {
    name: string, 
    description: string, 
    icon: string, 
    color: string, 
    currency: string,
    created_by: number
  }): Promise<number> {
    if (!this.isInitialized) await this.initialize()

    try {
      const result = await this.dbInstance.run(
        `INSERT INTO projects (name, description, icon, color, currency, created_by) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          projectData.name, 
          projectData.description, 
          projectData.icon, 
          projectData.color, 
          projectData.currency, 
          projectData.created_by
        ]
      )
      return result.lastID
    } catch (error) {
      console.error("[ExpenseShare] Failed to create project:", error)
      throw error
    }
  }

  async addProjectUser(projectId: number, userId: number, role: string): Promise<void> {
    if (!this.isInitialized) await this.initialize()

    try {
      await this.dbInstance.run(
        `INSERT INTO project_users (project_id, user_id, role) VALUES (?, ?, ?)`,
        [projectId, userId, role]
      )
    } catch (error) {
      console.error("[ExpenseShare] Failed to add project user:", error)
      throw error
    }
  }

  async getUserProjects(userId: number) {
    if (!this.isInitialized) await this.initialize()

    try {
      const projects = await this.dbInstance.all(`
        SELECT p.*, pu.role 
        FROM projects p
        JOIN project_users pu ON p.id = pu.project_id
        WHERE pu.user_id = ?
        ORDER BY p.created_at DESC
      `, [userId])
      
      return projects
    } catch (error) {
      console.error("[ExpenseShare] Failed to get user projects:", error)
      return []
    }
  }

  async getProjectById(projectId: number) {
    if (!this.isInitialized) await this.initialize()

    try {
      const project = await this.dbInstance.get(
        `SELECT * FROM projects WHERE id = ?`,
        [projectId]
      )
      return project || null
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
    if (!this.isInitialized) await this.initialize()

    try {
      await this.dbInstance.run(
        `UPDATE projects 
         SET name = ?, description = ?, icon = ?, color = ?, currency = ?
         WHERE id = ?`,
        [
          projectData.name, 
          projectData.description, 
          projectData.icon, 
          projectData.color,
          projectData.currency,
          projectId
        ]
      )
      return true
    } catch (error) {
      console.error("[ExpenseShare] Failed to update project:", error)
      return false
    }
  }

  // Category operations
  async createCategory(projectId: number, name: string, parentId: number | null = null): Promise<number> {
    if (!this.isInitialized) await this.initialize()

    try {
      let level = 1
      if (parentId) {
        const parent = await this.dbInstance.get(
          `SELECT level FROM categories WHERE id = ?`,
          [parentId]
        )
        level = parent ? parent.level + 1 : 1
      }

      const result = await this.dbInstance.run(
        `INSERT INTO categories (project_id, name, parent_id, level) VALUES (?, ?, ?, ?)`,
        [projectId, name, parentId, level]
      )
      return result.lastID
    } catch (error) {
      console.error("[ExpenseShare] Failed to create category:", error)
      throw error
    }
  }

  async getProjectCategories(projectId: number) {
    if (!this.isInitialized) await this.initialize()

    try {
      const categories = await this.dbInstance.all(
        `SELECT * FROM categories WHERE project_id = ? ORDER BY level, name`,
        [projectId]
      )
      return categories
    } catch (error) {
      console.error("[ExpenseShare] Failed to get project categories:", error)
      return []
    }
  }

  // Transaction operations
  async createTransaction(transactionData: {
    project_id: number,
    user_id: number,
    category_id: number | null,
    type: 'expense' | 'budget',
    amount: number,
    title: string,
    description?: string
  }): Promise<number> {
    if (!this.isInitialized) await this.initialize()

    try {
      const result = await this.dbInstance.run(
        `INSERT INTO transactions 
         (project_id, user_id, category_id, type, amount, title, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionData.project_id,
          transactionData.user_id,
          transactionData.category_id,
          transactionData.type,
          transactionData.amount,
          transactionData.title,
          transactionData.description || null
        ]
      )
      return result.lastID
    } catch (error) {
      console.error("[ExpenseShare] Failed to create transaction:", error)
      throw error
    }
  }

  async getRecentTransactions(limit: number = 10) {
    if (!this.isInitialized) await this.initialize()

    try {
      const transactions = await this.dbInstance.all(`
        SELECT t.*, 
               p.name as project_name, p.icon as project_icon, p.color as project_color,
               u.name as user_name,
               c.name as category_name
        FROM transactions t
        JOIN projects p ON t.project_id = p.id
        JOIN users u ON t.user_id = u.id
        LEFT JOIN categories c ON t.category_id = c.id
        ORDER BY t.created_at DESC
        LIMIT ?
      `, [limit])
      
      return transactions
    } catch (error) {
      console.error("[ExpenseShare] Failed to get recent transactions:", error)
      return []
    }
  }

  // Statistics operations
  async getGlobalStats(): Promise<{ totalExpenses: number; totalBudgets: number; balance: number }> {
    if (!this.isInitialized) await this.initialize()

    try {
      const expenseResult = await this.dbInstance.get(
        `SELECT SUM(amount) as total FROM transactions WHERE type = 'expense'`
      )
      const budgetResult = await this.dbInstance.get(
        `SELECT SUM(amount) as total FROM transactions WHERE type = 'budget'`
      )
      
      const totalExpenses = expenseResult.total || 0
      const totalBudgets = budgetResult.total || 0
      const balance = totalBudgets - totalExpenses

      return { totalExpenses, totalBudgets, balance }
    } catch (error) {
      console.error("[ExpenseShare] Failed to get global stats:", error)
      return { totalExpenses: 0, totalBudgets: 0, balance: 0 }
    }
  }
}

// Export a singleton instance
export const db = new SQLiteService()

export type { 
  User, Project, ProjectUser, Category, Transaction, Note, Setting 
} from './types'
