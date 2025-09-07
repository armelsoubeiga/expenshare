"use client"

import type { Database, SqlJsStatic } from 'sql.js'
import { getColorForIndex } from "./utils"

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

class DatabaseManager {
  private SQL: SqlJsStatic | null = null
  private db: Database | null = null
  private isInitialized = false
  private dbName = 'expenseshare.db'
  private initPromise: Promise<void> | null = null

  constructor() {
    // Initialize in browser only
    if (typeof window !== 'undefined') {
      this.initialize().catch(console.error)
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      try {
  console.log("[ExpenseShare] initSqlJs starting…")
      // Initialize SQL.js
  const initSqlJs = (await import('sql.js')).default
  this.SQL = await initSqlJs({
        // Utiliser le fichier WASM depuis /public
        // Important: retourner le nom du fichier demandé
        locateFile: (file: string) => `/${file}`
      })
  console.log("[ExpenseShare] initSqlJs done")

  // Try to load existing database from localStorage (robuste)
      const existingDb = localStorage.getItem(this.dbName)
  console.log("[ExpenseShare] existing DB: ", !!existingDb)
      if (existingDb) {
        try {
          let uint8Array: Uint8Array | null = null
          // 1) JSON array
          try {
            const parsed = JSON.parse(existingDb)
            if (Array.isArray(parsed)) {
              uint8Array = new Uint8Array(parsed as number[])
            }
          } catch {/* ignore */}

          // 2) Base64
          if (!uint8Array && /^[A-Za-z0-9+/=]+$/.test(existingDb)) {
            const binary = atob(existingDb)
            const buf = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
            uint8Array = buf
          }

          if (uint8Array) {
            this.db = new this.SQL.Database(uint8Array)
          } else {
            console.warn("[ExpenseShare] Corrupt DB data in localStorage, recreating…")
            localStorage.removeItem(this.dbName)
            this.db = new this.SQL.Database()
            await this.createTables()
          }
        } catch (e) {
          console.warn("[ExpenseShare] Failed to load stored DB, creating a new one:", e)
          localStorage.removeItem(this.dbName)
          this.db = new this.SQL.Database()
      await this.createTables()
        }
      } else {
        // Create new database
        this.db = new this.SQL.Database()
        await this.createTables()
      }

    // Ensure there is a default admin user (name: admin, PIN: 1234)
    await this.ensureAdminUser()

      this.isInitialized = true
      console.log("[ExpenseShare] SQLite database initialized successfully")
    } catch (error) {
      console.error("[ExpenseShare] Failed to initialize SQLite database:", error)
      throw error
    } finally {
      // Laisser initPromise à null quand terminé (succès ou échec)
      this.initPromise = null
    }
    })()

    return this.initPromise
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
      
      // Also save as downloadable file
      this.saveToFile()
    } catch (error) {
      console.error("[ExpenseShare] Failed to save database:", error)
    }
  }

  private saveToFile(): void {
    if (!this.db) return
    
    try {
      const data = this.db.export()
      // Create blob URL for the file
      const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      
      // Store URL for later download if needed
      localStorage.setItem('expenseshare-db-url', url)
    } catch (error) {
      console.error("[ExpenseShare] Failed to create file:", error)
    }
  }

  private async ensureAdminUser(): Promise<void> {
    if (!this.db) return
    try {
      // Check if admin exists
      let adminId: number | null = null
      const checkStmt = this.db.prepare("SELECT id FROM users WHERE LOWER(name) = LOWER('admin')")
      if (checkStmt.step()) {
        const row = checkStmt.getAsObject() as any
        adminId = Number(row.id)
      }

      if (!adminId) {
        // Create admin with PIN 1234 and hashing scheme btoa(pin + 'salt_' + name)
        const pinHash = btoa("1234" + "salt_" + "admin")
        const insertStmt = this.db.prepare("INSERT INTO users (name, pin_hash, created_at) VALUES (?, ?, ?)")
        insertStmt.run(["admin", pinHash, new Date().toISOString()])
        const res = this.db.exec("SELECT last_insert_rowid()")[0]
        adminId = res.values[0][0] as number
        this.saveDatabase()
      }

      // Persist admin id in settings for quick lookup
      if (adminId) {
        const getSet = this.db.prepare("SELECT key FROM settings WHERE key = ?")
        getSet.bind(["admin_user_id"]) 
        const exists = getSet.step()
        const upsert = this.db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)")
        upsert.run(["admin_user_id", String(adminId), new Date().toISOString()])
        this.saveDatabase()
      }
    } catch (e) {
      console.warn("[ExpenseShare] ensureAdminUser failed:", e)
    }
  }

  get isReady(): boolean {
    return this.isInitialized && this.db !== null
  }

  // Compatibility getters for existing code
  get users() {
    if (!this.isInitialized || !this.db) {
      throw new Error("Database not initialized")
    }
    return {
      // Retourne tous les utilisateurs
      toArray: async (): Promise<User[]> => {
        if (!this.db) return []
        const stmt = this.db.prepare("SELECT * FROM users ORDER BY created_at DESC")
        const users: User[] = []
        while (stmt.step()) users.push(stmt.getAsObject() as unknown as User)
        return users
      },
      add: async (data: Omit<User, 'id'>) => this.createUser(data.name, data.pin_hash),
      get: async (id: number) => this.getUserById(id),
      where: (field: string) => ({
        equals: (value: any) => ({
          first: async () => field === 'name' ? this.getUserByName(value) : null
        })
      })
    }
  }

  get projects() {
    if (!this.isInitialized || !this.db) {
      throw new Error("Database not initialized")
    }
    return {
      add: async (data: Omit<Project, 'id'>) => this.createProject(data.name, data.description || '', data.icon, data.color, data.currency, data.created_by),
      get: async (id: number) => this.getProjectById(id),
      // Compat Dexie: where(...).equals(...).toArray()
      where: (field: string) => ({
        equals: (value: any) => ({
          toArray: async (): Promise<Project[]> => {
            if (!this.db) return []
            if (field === 'created_by') {
              const stmt = this.db.prepare("SELECT * FROM projects WHERE created_by = ? ORDER BY created_at DESC")
              stmt.bind([value])
              const projects: Project[] = []
              while (stmt.step()) projects.push(stmt.getAsObject() as unknown as Project)
              return projects
            }
            if (field === 'id') {
              const stmt = this.db.prepare("SELECT * FROM projects WHERE id = ?")
              stmt.bind([value])
              const out: Project[] = []
              while (stmt.step()) out.push(stmt.getAsObject() as unknown as Project)
              return out
            }
            return []
          },
          delete: async (): Promise<number> => {
            if (!this.db) return 0
            if (field === 'id') {
              const stmt = this.db.prepare("DELETE FROM projects WHERE id = ?")
              stmt.run([value])
              this.saveDatabase()
              return 1
            }
            return 0
          }
        })
      })
    }
  }

  get project_users() {
    if (!this.isInitialized || !this.db) {
      throw new Error("Database not initialized")
    }
    return {
      add: async (data: ProjectUser) => this.addUserToProject(data.project_id, data.user_id, data.role),
      where: (field: string) => ({
        equals: (value: any) => ({
          toArray: async () => {
            if (!this.db) return []
            if (field === 'user_id') return this.getUserProjectAssociations(value)
            if (field === 'project_id') {
              const stmt = this.db.prepare("SELECT * FROM project_users WHERE project_id = ?")
              stmt.bind([value])
              const rows: ProjectUser[] = []
              while (stmt.step()) rows.push(stmt.getAsObject() as unknown as ProjectUser)
              return rows
            }
            return []
          },
          delete: async (): Promise<number> => {
            if (!this.db) return 0
            if (field === 'project_id') {
              const stmt = this.db.prepare("DELETE FROM project_users WHERE project_id = ?")
              stmt.run([value])
              this.saveDatabase()
              return 1
            }
            return 0
          }
        })
      })
    }
  }

  get categories() {
    if (!this.isInitialized || !this.db) {
      throw new Error("Database not initialized")
    }
    return {
      add: async (data: Omit<Category, 'id'>) => this.createCategory(data.project_id, data.name, data.parent_id || undefined),
      get: async (id: number) => this.getCategoryById(id),
      where: (field: string) => ({
        equals: (value: any) => ({
          sortBy: async (sortField: string) => field === 'project_id' ? this.getProjectCategories(value) : [],
          toArray: async () => field === 'project_id' ? this.getProjectCategories(value) : [],
          delete: async (): Promise<number> => {
            if (!this.db) return 0
            if (field === 'project_id') {
              const stmt = this.db.prepare("DELETE FROM categories WHERE project_id = ?")
              stmt.run([value])
              this.saveDatabase()
              return 1
            }
            return 0
          }
        })
      })
    }
  }

  get transactions() {
    if (!this.isInitialized || !this.db) {
      throw new Error("Database not initialized")
    }
    return {
      add: async (data: Omit<Transaction, 'id'>) => this.createTransaction(data.project_id, data.user_id, data.category_id || null, data.type, data.amount, data.title, data.description),
      orderBy: (field: string) => ({
        reverse: () => ({
          toArray: async () => this.getAllTransactions()
        })
      }),
      where: (field: string) => ({
        equals: (value: any) => ({
          reverse: () => ({
            sortBy: async (sortField: string) => field === 'project_id' ? this.getProjectTransactions(value) : []
          }),
          toArray: async () => field === 'project_id' ? this.getProjectTransactions(value) : [],
          delete: async (): Promise<number> => {
            if (!this.db) return 0
            if (field === 'project_id') {
              const stmt = this.db.prepare("DELETE FROM transactions WHERE project_id = ?")
              stmt.run([value])
              this.saveDatabase()
              return 1
            }
            return 0
          }
        })
      }),
      toArray: async () => this.getAllTransactions()
    }
  }

  get notes() {
    if (!this.isInitialized || !this.db) {
      throw new Error("Database not initialized")
    }
    return {
      add: async (data: Omit<Note, 'id'>) => this.createNote(data.transaction_id, data.content_type, data.content, data.file_path),
    }
  }

  get settings() {
    if (!this.isInitialized || !this.db) {
      throw new Error("Database not initialized")
    }
    return {
      put: async (data: Setting) => this.setSetting(data.key, data.value),
      get: async (key: string) => this.getSetting(key),
    }
  }

  async getAdminUserId(): Promise<number | null> {
    if (!this.db) return null
    try {
      // Prefer settings key
      const stmt = this.db.prepare("SELECT value FROM settings WHERE key = 'admin_user_id'")
      if (stmt.step()) {
        const v = stmt.getAsObject() as any
        const id = Number(v.value)
        if (!Number.isNaN(id)) return id
      }
      // Fallback by name
      const byName = this.db.prepare("SELECT id FROM users WHERE LOWER(name) = LOWER('admin')")
      if (byName.step()) {
        const row = byName.getAsObject() as any
        return Number(row.id)
      }
      return null
    } catch (e) {
      console.error("[ExpenseShare] getAdminUserId failed:", e)
      return null
    }
  }

  // Helper methods for compatibility
  private async getUserById(id: number): Promise<User | null> {
    if (!this.db) return null
    
    try {
      const stmt = this.db.prepare("SELECT * FROM users WHERE id = ?")
      stmt.bind([id])
      
      if (stmt.step()) {
        return stmt.getAsObject() as unknown as User
      }
      return null
    } catch (error) {
      console.error("[ExpenseShare] Failed to get user by id:", error)
      return null
    }
  }

  private async addUserToProject(projectId: number, userId: number, role: string): Promise<number> {
    if (!this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare("INSERT INTO project_users (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)")
      stmt.run([projectId, userId, role, new Date().toISOString()])
      
      this.saveDatabase()
      return 1 // Return success
    } catch (error) {
      console.error("[ExpenseShare] Failed to add user to project:", error)
      throw error
    }
  }

  private async getUserProjectAssociations(userId: number): Promise<ProjectUser[]> {
    if (!this.db) return []

    try {
      const stmt = this.db.prepare("SELECT * FROM project_users WHERE user_id = ?")
      stmt.bind([userId])
      
      const associations = []
      while (stmt.step()) {
        associations.push(stmt.getAsObject() as unknown as ProjectUser)
      }
      
      return associations
    } catch (error) {
      console.error("[ExpenseShare] Failed to get user project associations:", error)
      return []
    }
  }

  private async getCategoryById(id: number): Promise<Category | null> {
    if (!this.db) return null
    
    try {
      const stmt = this.db.prepare("SELECT * FROM categories WHERE id = ?")
      stmt.bind([id])
      
      if (stmt.step()) {
        return stmt.getAsObject() as unknown as Category
      }
      return null
    } catch (error) {
      console.error("[ExpenseShare] Failed to get category by id:", error)
      return null
    }
  }

  private async getAllTransactions(): Promise<Transaction[]> {
    if (!this.db) return []

    try {
      const stmt = this.db.prepare("SELECT * FROM transactions ORDER BY created_at DESC")
      
      const transactions = []
      while (stmt.step()) {
        transactions.push(stmt.getAsObject() as unknown as Transaction)
      }
      
      return transactions
    } catch (error) {
      console.error("[ExpenseShare] Failed to get all transactions:", error)
      return []
    }
  }

  private async createNote(transactionId: number, contentType: "text" | "image" | "audio", content: string, filePath?: string): Promise<number> {
    if (!this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare("INSERT INTO notes (transaction_id, content_type, content, file_path, created_at) VALUES (?, ?, ?, ?, ?)")
      stmt.run([transactionId, contentType, content, filePath || null, new Date().toISOString()])
      
      const result = this.db.exec("SELECT last_insert_rowid()")[0]
      const noteId = result.values[0][0] as number
      
      this.saveDatabase()
      return noteId
    } catch (error) {
      console.error("[ExpenseShare] Failed to create note:", error)
      throw error
    }
  }

  async getNotesByTransaction(transactionId: number): Promise<Array<{ id?: number; transaction_id: number; content_type: "text"|"image"|"audio"; content: string; file_path?: string; created_at?: string }>> {
    if (!this.db) return []
    try {
      const stmt = this.db.prepare("SELECT * FROM notes WHERE transaction_id = ? ORDER BY created_at DESC, id DESC")
      stmt.bind([transactionId])
      const notes = []
      while (stmt.step()) notes.push(stmt.getAsObject() as any)
      return notes
    } catch (error) {
      console.error("[ExpenseShare] Failed to get notes by transaction:", error)
      return []
    }
  }

  private async setSetting(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)")
      stmt.run([key, value, new Date().toISOString()])
      
      this.saveDatabase()
    } catch (error) {
      console.error("[ExpenseShare] Failed to set setting:", error)
      throw error
    }
  }

  private async getSetting(key: string): Promise<Setting | null> {
    if (!this.db) return null
    
    try {
      const stmt = this.db.prepare("SELECT * FROM settings WHERE key = ?")
      stmt.bind([key])
      
      if (stmt.step()) {
        return stmt.getAsObject() as unknown as Setting
      }
      return null
    } catch (error) {
      console.error("[ExpenseShare] Failed to get setting:", error)
      return null
    }
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
        return row as unknown as User
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

  // User deletion with reassignment to admin
  async deleteUser(userId: number, options?: { reassignToUserId?: number }): Promise<void> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")
    try {
      const targetId = Number(userId)
      // Resolve admin id
      let adminId = options?.reassignToUserId ?? (await this.getAdminUserId())
      if (!adminId) throw new Error("Admin introuvable pour la réassignation")
      if (adminId === targetId) throw new Error("Impossible de supprimer l'utilisateur admin")

      // Reassign projects ownership
      {
        const upd = this.db.prepare("UPDATE projects SET created_by = ? WHERE created_by = ?")
        upd.run([adminId, targetId])
      }
      // Reassign transactions author
      {
        const upd = this.db.prepare("UPDATE transactions SET user_id = ? WHERE user_id = ?")
        upd.run([adminId, targetId])
      }
      // Remove from project_users
      {
        const del = this.db.prepare("DELETE FROM project_users WHERE user_id = ?")
        del.run([targetId])
      }
      // Finally delete the user
      {
        const del = this.db.prepare("DELETE FROM users WHERE id = ?")
        del.run([targetId])
      }
      this.saveDatabase()
    } catch (error) {
      console.error("[ExpenseShare] Failed to delete user:", error)
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
        return stmt.getAsObject() as unknown as Project
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
  // Surcharge: accepte soit un objet, soit des paramètres positionnels
  async createTransaction(
    input: {
      project_id: number,
      user_id: number,
      category_id: number | null,
      type: "expense" | "budget",
      amount: number,
      title: string,
      description?: string,
    }
  ): Promise<number>
  async createTransaction(
    projectId: number,
    userId: number,
    categoryId: number | null,
    type: "expense" | "budget",
    amount: number,
    title: string,
    description?: string,
  ): Promise<number>
  async createTransaction(
    a: any,
    b?: any,
    c?: any,
    d?: any,
    e?: any,
    f?: any,
    g?: any,
  ): Promise<number> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      // Normaliser les paramètres (objet ou positionnels)
      let projectId: number
      let userId: number
      let categoryId: number | null
      let type: "expense" | "budget"
      let amount: number
      let title: string
      let description: string | null

      if (typeof a === 'object' && a !== null) {
        projectId = Number(a.project_id)
        userId = Number(a.user_id)
        categoryId = a.category_id === null || a.category_id === undefined ? null : Number(a.category_id)
        type = a.type
        amount = Number(a.amount)
        title = String(a.title ?? '')
        description = a.description ? String(a.description) : null
      } else {
        projectId = Number(a)
        userId = Number(b)
        categoryId = c === null || c === undefined ? null : Number(c)
        type = d
        amount = Number(e)
        title = String(f ?? '')
        description = g ? String(g) : null
      }

      const stmt = this.db.prepare("INSERT INTO transactions (project_id, user_id, category_id, type, amount, title, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      stmt.run([projectId, userId, categoryId, type, amount, title, description, new Date().toISOString()])
      
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
        SELECT 
          t.*,
          p.name AS project_name, p.icon AS project_icon, p.color AS project_color,
          u.name AS user_name,
          c.name AS category_name,
          pc.name AS parent_category_name,
          MAX(CASE WHEN n.content_type = 'text' THEN 1 ELSE 0 END) AS has_text,
          MAX(CASE WHEN n.content_type = 'text' AND IFNULL(n.file_path,'') <> '' THEN 1 ELSE 0 END) AS has_document,
          MAX(CASE WHEN n.content_type = 'image' THEN 1 ELSE 0 END) AS has_image,
          MAX(CASE WHEN n.content_type = 'audio' THEN 1 ELSE 0 END) AS has_audio
        FROM transactions t
        JOIN projects p ON t.project_id = p.id
        JOIN users u ON t.user_id = u.id
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        LEFT JOIN notes n ON n.transaction_id = t.id
        GROUP BY t.id
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
          has_notes: !!row.description || (row.has_text === 1),
          has_document: row.has_document === 1,
          has_image: row.has_image === 1,
          has_audio: row.has_audio === 1
        })
      }
      
      return transactions
    } catch (error) {
      console.error("[ExpenseShare] Failed to get recent transactions:", error)
      return []
    }
  }

  async getRecentTransactionsByProject(projectId: number, limit = 10): Promise<any[]> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare(`
        SELECT 
          t.*,
          p.name AS project_name, p.icon AS project_icon, p.color AS project_color,
          u.name AS user_name,
          c.name AS category_name,
          pc.name AS parent_category_name,
          MAX(CASE WHEN n.content_type = 'text' THEN 1 ELSE 0 END) AS has_text,
          MAX(CASE WHEN n.content_type = 'text' AND IFNULL(n.file_path,'') <> '' THEN 1 ELSE 0 END) AS has_document,
          MAX(CASE WHEN n.content_type = 'image' THEN 1 ELSE 0 END) AS has_image,
          MAX(CASE WHEN n.content_type = 'audio' THEN 1 ELSE 0 END) AS has_audio
        FROM transactions t
        JOIN projects p ON t.project_id = p.id
        JOIN users u ON t.user_id = u.id
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        LEFT JOIN notes n ON n.transaction_id = t.id
        WHERE t.project_id = ?
        GROUP BY t.id
        ORDER BY t.created_at DESC
        LIMIT ?
      `)
      stmt.bind([projectId, limit])
      const transactions: any[] = []
      while (stmt.step()) {
        const row = stmt.getAsObject()
        const categoryHierarchy = []
        if (row.parent_category_name) categoryHierarchy.push(row.parent_category_name)
        if (row.category_name) categoryHierarchy.push(row.category_name)
        transactions.push({
          ...row,
          category_hierarchy: categoryHierarchy,
          has_notes: !!row.description || (row.has_text === 1),
          has_document: row.has_document === 1,
          has_image: row.has_image === 1,
          has_audio: row.has_audio === 1
        })
      }
      return transactions
    } catch (error) {
      console.error("[ExpenseShare] Failed to get recent project transactions:", error)
      return []
    }
  }

  async getProjectTransactions(projectId: number): Promise<any[]> {
    if (!this.isInitialized || !this.db) throw new Error("Database not initialized")

    try {
      const stmt = this.db.prepare(`
        SELECT 
          t.*, 
          u.name AS user_name,
          c.name AS category_name,
          pc.name AS parent_category_name,
          MAX(CASE WHEN n.content_type = 'text' THEN 1 ELSE 0 END) AS has_text,
          MAX(CASE WHEN n.content_type = 'text' AND IFNULL(n.file_path,'') <> '' THEN 1 ELSE 0 END) AS has_document,
          MAX(CASE WHEN n.content_type = 'image' THEN 1 ELSE 0 END) AS has_image,
          MAX(CASE WHEN n.content_type = 'audio' THEN 1 ELSE 0 END) AS has_audio
        FROM transactions t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        LEFT JOIN notes n ON n.transaction_id = t.id
        WHERE t.project_id = ?
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `)
      stmt.bind([projectId])
      
      const transactions: any[] = []
      while (stmt.step()) {
        const row = stmt.getAsObject()
        transactions.push({
          ...row,
          has_notes: !!row.description || (row.has_text === 1),
          has_document: row.has_document === 1,
          has_image: row.has_image === 1,
          has_audio: row.has_audio === 1,
        })
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
      const lastTransactionDate = transactions.length > 0 ? String(transactions[0].created_at) : null

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
        categories.push(stmt.getAsObject() as unknown as Category)
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
      const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' })
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

  // Export/Import text (compat API utilisée par l'entête)
  async exportDatabase(): Promise<string> {
    if (!this.db) throw new Error("Database not initialized")
    const data = this.db.export()
    // Encodage base64 pour stockage texte
    const binary = String.fromCharCode(...data)
    return btoa(binary)
  }

  async importDatabase(text: string): Promise<void> {
    const binary = atob(text)
    const uint8 = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) uint8[i] = binary.charCodeAt(i)
    if (!this.SQL) {
      // S'assurer que SQL est prêt si import avant init
      const initSqlJs = (await import('sql.js')).default
      this.SQL = await initSqlJs({ locateFile: (file: string) => `/${file}` })
    }
    this.db = new this.SQL!.Database(uint8)
    this.saveDatabase()
  }
}

// Singleton instance
export const db = new DatabaseManager()

// Export par défaut pour compatibilité d'import
export default db

// Initialize database on module load
if (typeof window !== "undefined") {
  db.initialize().catch(console.error)
}
