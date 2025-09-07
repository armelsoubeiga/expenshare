"use client"

import { getColorForIndex } from "./utils"
import type { User, Project, Category } from "./types"

// Helpers
async function http<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const data = await res.json(); msg = data.error || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

class WhereBuilder<T> {
  private url: string
  private field?: string
  private filterObj?: Record<string, any>
  constructor(url: string) { this.url = url }
  where(fieldOrObj: string | Record<string, any>) {
    if (typeof fieldOrObj === 'string') this.field = fieldOrObj
    else this.filterObj = fieldOrObj
    return this
  }
  equals(value: any) {
    const u = new URL(this.url, window.location.origin)
    if (this.field === 'project_id') u.searchParams.set('projectId', String(value))
    if (this.field === 'user_id') u.searchParams.set('userId', String(value))
  if (this.field === 'created_by') u.searchParams.set('createdBy', String(value))
    // Special-case id on projects
    const deleteFn = async () => {
      if (this.url.startsWith('/api/projects') && this.field === 'id') {
        await fetch(`${this.url.replace(/\/$/, '')}/${value}`, { method: 'DELETE' })
      } else {
        await fetch(u.toString(), { method: 'DELETE' })
      }
    }
    return {
      toArray: async () => http<T[]>(u.toString()),
      delete: deleteFn,
      sortBy: async (_: string) => http<T[]>(u.toString()),
    }
  }
  async delete() {
    // Support where({ project_id, user_id }) delete for project_users
    if (!this.filterObj) throw new Error('delete() with object filter requires where({...})')
    const u = new URL(this.url, window.location.origin)
    if (this.filterObj.project_id != null) u.searchParams.set('projectId', String(this.filterObj.project_id))
    if (this.filterObj.user_id != null) u.searchParams.set('userId', String(this.filterObj.user_id))
    await fetch(u.toString(), { method: 'DELETE' })
  }
}

class TableLike<T extends object> {
  private base: string
  constructor(base: string) { this.base = base }
  async toArray(): Promise<T[]> { return http<T[]>(this.base) }
  async add(obj: any): Promise<number> {
    const created = await http<any>(this.base, { method: 'POST', body: JSON.stringify(obj) })
    return created.id ?? created.lastInsertRowid ?? 0
  }
  async get(id: number): Promise<T | undefined> { return http<T | null>(`${this.base.replace(/\/$/, '')}/${id}`).then(x=>x||undefined) }
  where(field: string) { return new WhereBuilder<T>(this.base).where(field) }
  async update(id: number, data: any): Promise<void> { await fetch(`${this.base.replace(/\/$/, '')}/${id}`, { method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }) }
}

class DatabaseManager {
  private _initialized = false

  users = new TableLike<User>('/api/users')
  projects = new TableLike<Project>('/api/projects')
  project_users = new TableLike<any>('/api/project-users')
  categories = new TableLike<any>('/api/categories')
  transactions = new TableLike<any>('/api/transactions')
  notes = new TableLike<any>('/api/notes')
  settings = new TableLike<any>('/api/settings')

  async initialize(): Promise<void> {
    if (this._initialized) return
    // Ping API/DB
    await http('/api/ping')
    this._initialized = true
  }
  get isReady() { return this._initialized }

  async getProjectById(projectId: number): Promise<Project | null> {
    await this.ensure()
    return http<Project | null>(`/api/projects/${projectId}`)
  }

  private async ensure() { if (!this._initialized) await this.initialize() }

  async createUser(name: string, pinHash: string): Promise<number> {
    await this.ensure()
    const created = await http<any>('/api/users', { method: 'POST', body: JSON.stringify({ name, pin_hash: pinHash }) })
    return created.id
  }
  async getUserByName(name: string): Promise<User | null> {
    await this.ensure()
    return http<User | null>('/api/users/by-name', { method: 'POST', body: JSON.stringify({ name }) })
  }

  async createProject(name: string, description: string, icon: string, color: string, currency: string, userId: number): Promise<number> {
    await this.ensure()
    const exists = await this.checkProjectNameExists(name, userId)
    if (exists) throw new Error('Un projet avec ce nom existe déjà. Veuillez choisir un autre nom.')
    const created = await http<any>('/api/projects', { method: 'POST', body: JSON.stringify({ name, description, icon, color, currency, created_by: userId }) })
    return created.id
  }

  async checkProjectNameExists(name: string, userId: number): Promise<boolean> {
    await this.ensure()
    const list = await http<Project[]>(`/api/projects?userId=${userId}`)
    const normalized = name.trim().toLowerCase()
    return list.some(p => p.name.trim().toLowerCase() === normalized)
  }

  async getUserProjects(userId: number): Promise<any[]> {
    await this.ensure()
    return http<any[]>(`/api/projects?userId=${userId}`)
  }

  async updateProject(projectId: number, projectData: { name: string, description: string, icon: string, color: string, currency: string }): Promise<boolean> {
    await this.ensure()
    await http(`/api/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(projectData) })
    return true
  }

  async createTransaction(input: { project_id: number, user_id: number, category_id: number | null, type: 'expense'|'budget', amount: number, title: string, description?: string }): Promise<number> {
    await this.ensure()
    const created = await http<any>('/api/transactions', { method: 'POST', body: JSON.stringify(input) })
    return created.id
  }

  async getRecentTransactions(limit = 10): Promise<any[]> {
    await this.ensure()
    const rows = await http<any[]>(`/api/transactions?limit=${limit}`)
    // Keep shape close to Dexie-enriched version
    return rows
  }

  async getProjectTransactions(projectId: number): Promise<any[]> {
    await this.ensure()
    return http<any[]>(`/api/transactions?projectId=${projectId}`)
  }

  async getGlobalStats(): Promise<{ totalExpenses: number; totalBudgets: number; balance: number; transactionCount: number; lastTransactionDate: string | null; projectCount: number; expensesByMonth: { month: string; amount: number }[]; budgetsByMonth: { month: string; amount: number }[]; }> {
    await this.ensure()
    return http<any>('/api/stats')
  }

  async createCategory(projectId: number, name: string, parentId?: number): Promise<number> {
    await this.ensure()
    const created = await http<any>('/api/categories', { method: 'POST', body: JSON.stringify({ project_id: projectId, name, parent_id: parentId ?? null }) })
    return created.id
  }
  async getProjectCategories(projectId: number): Promise<Category[]> {
    await this.ensure()
    return http<Category[]>(`/api/categories?projectId=${projectId}`)
  }
  async getProjectCategoryHierarchy(projectId: number): Promise<any[]> {
    await this.ensure()
    return http<any[]>(`/api/categories/hierarchy?projectId=${projectId}`)
  }

  async resetDatabase(): Promise<void> {
    // Not supported with SQLite via client; could be added with admin API
    throw new Error('resetDatabase non supporté avec SQLite')
  }
  async exportDatabase(): Promise<string> {
    throw new Error('exportDatabase non supporté avec SQLite')
  }
  async importDatabase(_base64Data: string): Promise<void> {
    throw new Error('importDatabase non supporté avec SQLite')
  }
}

export const db = new DatabaseManager()

if (typeof window !== 'undefined') {
  db.initialize().catch(console.error)
}
