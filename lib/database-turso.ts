"use client"

import { createClient } from '@libsql/client/web'
import type { User, Project, ProjectUser, Category, Transaction, Note, Setting } from './types'

const turso = createClient({
  url: process.env.NEXT_PUBLIC_TURSO_DATABASE_URL!,
  authToken: process.env.NEXT_PUBLIC_TURSO_AUTH_TOKEN!,
})

// Convertit une Row libsql en objet plain
function rowToObj(row: any, columns: string[]): Record<string, any> {
  const obj: Record<string, any> = {}
  columns.forEach((col, i) => { obj[col] = row[i] })
  return obj
}

function rowsToObjs(result: any): Record<string, any>[] {
  return result.rows.map((row: any) => rowToObj(row, result.columns))
}

class TursoDatabase {
  private isInitialized = false

  get isReady() {
    return this.isInitialized
  }

  private getCurrentUserId(): string | null {
    try {
      const stored =
        (typeof window !== 'undefined' &&
          (localStorage.getItem('expenshare_current_user') ||
            localStorage.getItem('expenshare_user'))) ||
        null
      if (!stored) return null
      const obj = JSON.parse(stored)
      return obj?.id ? String(obj.id) : null
    } catch {
      return null
    }
  }

  private async getAuthorizedProjectIds(userId: string): Promise<number[]> {
    try {
      const [created, memberships] = await Promise.all([
        turso.execute({ sql: 'SELECT id FROM projects WHERE created_by = ?', args: [userId] }),
        turso.execute({ sql: 'SELECT project_id FROM project_users WHERE user_id = ?', args: [userId] }),
      ])
      const ids = new Set<number>()
      rowsToObjs(created).forEach((r) => ids.add(Number(r.id)))
      rowsToObjs(memberships).forEach((r) => ids.add(Number(r.project_id)))
      return Array.from(ids)
    } catch {
      return []
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    try {
      await turso.batch([
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          pin_hash TEXT NOT NULL,
          is_admin INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT DEFAULT '📁',
          color TEXT DEFAULT '#3b82f6',
          currency TEXT DEFAULT 'EUR',
          created_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS project_users (
          project_id INTEGER,
          user_id TEXT,
          role TEXT DEFAULT 'viewer',
          added_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (project_id, user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER,
          name TEXT NOT NULL,
          parent_id INTEGER,
          level INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER,
          user_id TEXT,
          category_id INTEGER,
          type TEXT NOT NULL,
          amount REAL DEFAULT 0,
          amount_eur REAL DEFAULT 0,
          amount_cfa REAL DEFAULT 0,
          amount_usd REAL DEFAULT 0,
          title TEXT NOT NULL,
          description TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id INTEGER,
          content_type TEXT,
          content TEXT,
          file_path TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS project_budget_transfers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_project_id INTEGER NOT NULL,
          target_project_id INTEGER NOT NULL,
          amount_eur REAL DEFAULT 0,
          amount_cfa REAL DEFAULT 0,
          amount_usd REAL DEFAULT 0,
          note TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
      ], 'write')

      this.isInitialized = true
      console.log('[ExpenseShare] Turso connected')
      await this.ensureAdminUser()
    } catch (error: any) {
      console.error('[ExpenseShare] Failed to initialize Turso:', error)
      throw new Error(error?.message || 'Impossible de se connecter à Turso')
    }
  }

  private async ensureAdminUser(): Promise<void> {
    try {
      const result = await turso.execute({ sql: "SELECT id FROM users WHERE name = 'admin' LIMIT 1", args: [] })
      if (result.rows.length === 0) {
        const pinHash = btoa('1234' + 'salt_' + 'admin')
        const id = crypto.randomUUID()
        await turso.execute({
          sql: 'INSERT INTO users (id, name, pin_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)',
          args: [id, 'admin', pinHash, new Date().toISOString()],
        })
        console.log('[ExpenseShare] Admin user created')
      }
    } catch (e) {
      console.error('[ExpenseShare] ensureAdminUser failed:', e)
    }
  }

  // ─── USERS ───────────────────────────────────────────────────────────────

  users = {
    getByName: async (name: string): Promise<User | null> => {
      try {
        const r = await turso.execute({ sql: 'SELECT * FROM users WHERE name = ? LIMIT 1', args: [name] })
        if (!r.rows.length) return null
        const obj = rowToObj(r.rows[0], r.columns)
        return { ...obj, is_admin: !!obj.is_admin } as unknown as User
      } catch (e) {
        console.error('[ExpenseShare] users.getByName failed:', e)
        return null
      }
    },

    toArray: async (): Promise<User[]> => {
      try {
        const r = await turso.execute({ sql: 'SELECT * FROM users ORDER BY created_at DESC', args: [] })
        return rowsToObjs(r).map((u) => ({ ...u, is_admin: !!u.is_admin })) as unknown as User[]
      } catch (e) {
        console.error('[ExpenseShare] users.toArray failed:', e)
        return []
      }
    },

    add: async (data: Omit<User, 'id'>): Promise<string> => {
      try {
        const id = crypto.randomUUID()
        await turso.execute({
          sql: 'INSERT INTO users (id, name, pin_hash, is_admin, created_at) VALUES (?, ?, ?, 0, ?)',
          args: [id, data.name, data.pin_hash, new Date().toISOString()],
        })
        return id
      } catch (e: any) {
        console.error('[ExpenseShare] users.add failed:', e)
        throw e
      }
    },

    get: async (id: string | number): Promise<User | null> => {
      try {
        const r = await turso.execute({ sql: 'SELECT * FROM users WHERE id = ? LIMIT 1', args: [String(id)] })
        if (!r.rows.length) return null
        const obj = rowToObj(r.rows[0], r.columns)
        return { ...obj, is_admin: !!obj.is_admin } as unknown as User
      } catch (e) {
        console.error('[ExpenseShare] users.get failed:', e)
        return null
      }
    },

    updatePinHash: async (id: string | number, pinHash: string): Promise<boolean> => {
      try {
        await turso.execute({ sql: 'UPDATE users SET pin_hash = ? WHERE id = ?', args: [pinHash, String(id)] })
        return true
      } catch (e) {
        console.error('[ExpenseShare] users.updatePinHash failed:', e)
        throw e
      }
    },
  }

  async deleteUser(userId: string): Promise<boolean> {
    try {
      await turso.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] })
      return true
    } catch (e) {
      console.error('[ExpenseShare] deleteUser failed:', e)
      return false
    }
  }

  async getAdminUserId(): Promise<string | null> {
    try {
      const r = await turso.execute({ sql: 'SELECT id FROM users WHERE is_admin = 1 LIMIT 1', args: [] })
      if (!r.rows.length) return null
      return String(rowToObj(r.rows[0], r.columns).id)
    } catch {
      return null
    }
  }

  // ─── PROJECTS ─────────────────────────────────────────────────────────────

  async createProject(name: string, description: string, icon: string, color: string, currency: string, created_by: string | number): Promise<number> {
    const uid = String(created_by)
    const now = new Date().toISOString()
    const r = await turso.execute({
      sql: 'INSERT INTO projects (name, description, icon, color, currency, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      args: [name, description, icon, color, currency, uid, now],
    })
    const id = Number(rowToObj(r.rows[0], r.columns).id)
    await turso.execute({
      sql: 'INSERT INTO project_users (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)',
      args: [id, uid, 'owner', now],
    })
    return id
  }

  async getUserProjects(userId: string | number) {
    try {
      const uid = String(userId)
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.length) return []

      const placeholders = authorized.map(() => '?').join(',')
      const r = await turso.execute({
        sql: `SELECT * FROM projects WHERE id IN (${placeholders})`,
        args: authorized,
      })
      const projects = rowsToObjs(r)

      const rels = await turso.execute({ sql: 'SELECT project_id, role FROM project_users WHERE user_id = ?', args: [uid] })
      const relMap = new Map(rowsToObjs(rels).map((x) => [Number(x.project_id), x.role]))

      return projects.map((p) => ({
        ...p,
        role: String(p.created_by) === uid ? 'owner' : (relMap.get(Number(p.id)) || 'viewer'),
      }))
    } catch (e) {
      console.error('[ExpenseShare] getUserProjects failed:', e)
      return []
    }
  }

  async getProjectById(projectId: number): Promise<Project | null> {
    try {
      const uid = this.getCurrentUserId()
      if (!uid) return null
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.includes(Number(projectId))) return null
      const r = await turso.execute({ sql: 'SELECT * FROM projects WHERE id = ? LIMIT 1', args: [projectId] })
      if (!r.rows.length) return null
      return rowToObj(r.rows[0], r.columns) as unknown as Project
    } catch (e) {
      console.error('[ExpenseShare] getProjectById failed:', e)
      return null
    }
  }

  async updateProject(projectId: number, values: { name: string; description: string; icon: string; color: string; currency: string }): Promise<Project | null> {
    try {
      await turso.execute({
        sql: 'UPDATE projects SET name = ?, description = ?, icon = ?, color = ?, currency = ? WHERE id = ?',
        args: [values.name, values.description, values.icon, values.color, values.currency, projectId],
      })
      return this.getProjectById(projectId)
    } catch (e) {
      console.error('[ExpenseShare] updateProject failed:', e)
      return null
    }
  }

  projects = {
    add: async (data: Project) => {
      try {
        const now = new Date().toISOString()
        const r = await turso.execute({
          sql: 'INSERT INTO projects (name, description, icon, color, currency, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
          args: [data.name, data.description ?? '', data.icon, data.color, data.currency, String(data.created_by), now],
        })
        return Number(rowToObj(r.rows[0], r.columns).id)
      } catch (e: any) {
        console.error('[ExpenseShare] projects.add failed:', e)
        throw e
      }
    },

    toArray: async (): Promise<Project[]> => {
      try {
        const uid = this.getCurrentUserId()
        if (!uid) return []
        const isAdminResult = await turso.execute({ sql: 'SELECT id FROM users WHERE id = ? AND is_admin = 1 LIMIT 1', args: [uid] })
        if (isAdminResult.rows.length > 0) {
          const r = await turso.execute({ sql: 'SELECT * FROM projects', args: [] })
          return rowsToObjs(r) as unknown as Project[]
        }
        const authorized = await this.getAuthorizedProjectIds(uid)
        if (!authorized.length) return []
        const ph = authorized.map(() => '?').join(',')
        const r = await turso.execute({ sql: `SELECT * FROM projects WHERE id IN (${ph})`, args: authorized })
        return rowsToObjs(r) as unknown as Project[]
      } catch (e) {
        console.error('[ExpenseShare] projects.toArray failed:', e)
        return []
      }
    },

    where: (field: string) => ({
      equals: (value: any) => ({
        toArray: async (): Promise<Project[]> => {
          try {
            if (field === 'id') {
              const r = await turso.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [Number(value)] })
              return rowsToObjs(r) as unknown as Project[]
            }
            if (field === 'created_by') {
              const r = await turso.execute({ sql: 'SELECT * FROM projects WHERE created_by = ?', args: [String(value)] })
              return rowsToObjs(r) as unknown as Project[]
            }
            return []
          } catch (e) {
            console.error('[ExpenseShare] projects.where failed:', e)
            return []
          }
        },
        delete: async (): Promise<number> => {
          try {
            if (field === 'id') {
              const uid = this.getCurrentUserId()
              if (!uid) throw new Error('Non authentifié')
              const proj = await turso.execute({ sql: 'SELECT created_by FROM projects WHERE id = ? LIMIT 1', args: [Number(value)] })
              if (!proj.rows.length) return 0
              const owner = String(rowToObj(proj.rows[0], proj.columns).created_by)
              const isAdmin = await turso.execute({ sql: 'SELECT id FROM users WHERE id = ? AND is_admin = 1 LIMIT 1', args: [uid] })
              if (isAdmin.rows.length === 0 && owner !== uid) throw new Error('Seul le propriétaire peut supprimer ce projet.')
              await turso.execute({ sql: 'DELETE FROM projects WHERE id = ?', args: [Number(value)] })
              return 1
            }
            return 0
          } catch (e: any) {
            console.error('[ExpenseShare] projects.where.delete failed:', e)
            throw e
          }
        },
      }),
    }),
  }

  // ─── PROJECT_USERS ────────────────────────────────────────────────────────

  project_users = {
    add: async (data: ProjectUser): Promise<number> => {
      try {
        const uid = this.getCurrentUserId()
        if (!uid) throw new Error('Non authentifié')
        const now = new Date().toISOString()
        await turso.execute({
          sql: 'INSERT OR REPLACE INTO project_users (project_id, user_id, role, added_at) VALUES (?, ?, ?, ?)',
          args: [Number(data.project_id), String(data.user_id), data.role, data.added_at ? String(data.added_at) : now],
        })
        return 1
      } catch (e: any) {
        console.error('[ExpenseShare] project_users.add failed:', e)
        throw e
      }
    },

    remove: async (project_id: number, user_id: string | number): Promise<number> => {
      try {
        const proj = await turso.execute({ sql: 'SELECT created_by FROM projects WHERE id = ? LIMIT 1', args: [project_id] })
        if (proj.rows.length && String(rowToObj(proj.rows[0], proj.columns).created_by) === String(user_id)) {
          throw new Error('Impossible de retirer le propriétaire du projet.')
        }
        await turso.execute({
          sql: 'DELETE FROM project_users WHERE project_id = ? AND user_id = ?',
          args: [project_id, String(user_id)],
        })
        return 1
      } catch (e: any) {
        console.error('[ExpenseShare] project_users.remove failed:', e)
        throw e
      }
    },

    where: (field: string) => ({
      equals: (value: any) => ({
        toArray: async (): Promise<ProjectUser[]> => {
          try {
            if (field === 'user_id') {
              const r = await turso.execute({ sql: 'SELECT * FROM project_users WHERE user_id = ?', args: [String(value)] })
              return rowsToObjs(r) as unknown as ProjectUser[]
            }
            if (field === 'project_id') {
              const r = await turso.execute({ sql: 'SELECT * FROM project_users WHERE project_id = ?', args: [Number(value)] })
              return rowsToObjs(r) as unknown as ProjectUser[]
            }
            return []
          } catch (e) {
            console.error('[ExpenseShare] project_users.where failed:', e)
            return []
          }
        },
        delete: async (): Promise<number> => {
          try {
            if (field === 'project_id') {
              await turso.execute({ sql: 'DELETE FROM project_users WHERE project_id = ?', args: [Number(value)] })
              return 1
            }
            return 0
          } catch (e: any) {
            console.error('[ExpenseShare] project_users.where.delete failed:', e)
            throw e
          }
        },
      }),
    }),
  }

  // ─── CATEGORIES ───────────────────────────────────────────────────────────

  async createCategory(projectId: number, name: string, parentId?: number): Promise<number> {
    try {
      let level = 1
      let parent_id: number | null = null
      if (parentId && Number(parentId) > 0) {
        parent_id = Number(parentId)
        const pr = await turso.execute({ sql: 'SELECT level, project_id FROM categories WHERE id = ? LIMIT 1', args: [parent_id] })
        if (!pr.rows.length) throw new Error('Catégorie parente introuvable')
        const parent = rowToObj(pr.rows[0], pr.columns)
        if (Number(parent.project_id) !== Number(projectId)) throw new Error('Parent hors projet')
        level = (Number(parent.level) || 1) + 1
        if (level > 3) throw new Error('Maximum 3 niveaux de catégories autorisés')
      }
      const r = await turso.execute({
        sql: 'INSERT INTO categories (project_id, name, parent_id, level, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
        args: [Number(projectId), name, parent_id, level, new Date().toISOString()],
      })
      return Number(rowToObj(r.rows[0], r.columns).id)
    } catch (e: any) {
      console.error('[ExpenseShare] createCategory failed:', e)
      throw new Error(e?.message || 'Impossible de créer la catégorie')
    }
  }

  async getProjectCategories(projectId: number): Promise<Category[]> {
    try {
      const uid = this.getCurrentUserId()
      if (!uid) return []
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.includes(Number(projectId))) return []
      const r = await turso.execute({ sql: 'SELECT * FROM categories WHERE project_id = ?', args: [projectId] })
      return rowsToObjs(r) as unknown as Category[]
    } catch (e) {
      console.error('[ExpenseShare] getProjectCategories failed:', e)
      return []
    }
  }

  async deleteCategory(categoryId: number, projectId: number): Promise<boolean> {
    try {
      const uid = this.getCurrentUserId()
      if (!uid) return false
      const proj = await turso.execute({ sql: 'SELECT created_by FROM projects WHERE id = ? LIMIT 1', args: [projectId] })
      if (!proj.rows.length) return false
      if (String(rowToObj(proj.rows[0], proj.columns).created_by) !== uid) return false
      await turso.execute({ sql: 'DELETE FROM categories WHERE id = ? AND project_id = ?', args: [categoryId, projectId] })
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('expenshare:project-updated'))
      return true
    } catch (e) {
      console.error('[ExpenseShare] deleteCategory failed:', e)
      return false
    }
  }

  async getProjectCategoryHierarchy(projectId: number, currency: 'EUR' | 'CFA' | 'USD' = 'EUR'): Promise<any[]> {
    try {
      const uid = this.getCurrentUserId()
      if (!uid) return []
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.includes(Number(projectId))) return []

      const [catsResult, txResult] = await Promise.all([
        turso.execute({ sql: 'SELECT * FROM categories WHERE project_id = ? ORDER BY level ASC, name ASC', args: [projectId] }),
        turso.execute({ sql: 'SELECT * FROM transactions WHERE project_id = ?', args: [projectId] }),
      ])

      const cats = rowsToObjs(catsResult) as unknown as Category[]
      const transactions = rowsToObjs(txResult)

      const totals = new Map<string, number>()
      transactions.forEach((t) => {
        if (t.category_id) {
          const key = `${t.category_id}_${t.type}`
          let amt = 0
          if (currency === 'CFA') amt = Number(t.amount_cfa ?? 0)
          else if (currency === 'USD') amt = Number(t.amount_usd ?? 0)
          else amt = Number(t.amount_eur ?? t.amount ?? 0)
          totals.set(key, (totals.get(key) || 0) + amt)
        }
      })

      const colors = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F','#60A5FA','#34D399','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316']
      const getColor = (i: number) => colors[i % colors.length]

      const build = (parentId: number | null = null, level = 1): any[] =>
        cats
          .filter((c) => (c.parent_id ?? null) === parentId)
          .map((c, idx) => {
            const expense = totals.get(`${c.id}_expense`) || 0
            const budget = totals.get(`${c.id}_budget`) || 0
            const children = build(c.id!, level + 1)
            const childrenExpense = children.reduce((s, ch) => s + (ch.expenseValue || 0), 0)
            const childrenBudget = children.reduce((s, ch) => s + (ch.budgetValue || 0), 0)
            const totalExpense = expense + childrenExpense
            const totalBudget = budget + childrenBudget
            return {
              id: String(c.id!),
              name: c.name,
              value: totalExpense,
              expenseValue: totalExpense,
              budgetValue: totalBudget,
              color: getColor(idx + level * 3),
              level,
              parentId: parentId !== null ? String(parentId) : undefined,
              children: children.length > 0 ? children : undefined,
            }
          })
          .filter((node) => Number(node.value || 0) > 0)

      return build(null, 1)
    } catch (e) {
      console.error('[ExpenseShare] getProjectCategoryHierarchy failed:', e)
      return []
    }
  }

  categories = {
    add: async (data: Category): Promise<number> => {
      try {
        const r = await turso.execute({
          sql: 'INSERT INTO categories (project_id, name, parent_id, level, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
          args: [Number(data.project_id), data.name, data.parent_id ? Number(data.parent_id) : null, data.level, new Date().toISOString()],
        })
        return Number(rowToObj(r.rows[0], r.columns).id)
      } catch (e: any) {
        console.error('[ExpenseShare] categories.add failed:', e)
        throw e
      }
    },

    where: (field: string) => ({
      equals: (value: any) => ({
        toArray: async (): Promise<Category[]> => {
          try {
            if (field === 'project_id') {
              const r = await turso.execute({ sql: 'SELECT * FROM categories WHERE project_id = ? ORDER BY level ASC, name ASC', args: [Number(value)] })
              return rowsToObjs(r) as unknown as Category[]
            }
            return []
          } catch (e) {
            console.error('[ExpenseShare] categories.where failed:', e)
            return []
          }
        },
        delete: async (): Promise<number> => {
          try {
            if (field === 'project_id') {
              await turso.execute({ sql: 'DELETE FROM categories WHERE project_id = ?', args: [Number(value)] })
              return 1
            }
            return 0
          } catch (e: any) {
            console.error('[ExpenseShare] categories.where.delete failed:', e)
            throw e
          }
        },
      }),
    }),
  }

  // ─── TRANSACTIONS ─────────────────────────────────────────────────────────

  private async buildTransactionRows(tx: any[], notes: any[]): Promise<any[]> {
    if (!tx.length) return []

    const projIds = [...new Set(tx.map((t) => t.project_id))]
    const userIds = [...new Set(tx.map((t) => String(t.user_id)))]
    const catIds = [...new Set(tx.map((t) => t.category_id).filter(Boolean))]

    const ph = (arr: any[]) => arr.map(() => '?').join(',')

    const [projRes, userRes, catRes] = await Promise.all([
      projIds.length ? turso.execute({ sql: `SELECT id, name, icon, color, currency FROM projects WHERE id IN (${ph(projIds)})`, args: projIds }) : Promise.resolve({ rows: [], columns: [] }),
      userIds.length ? turso.execute({ sql: `SELECT id, name FROM users WHERE id IN (${ph(userIds)})`, args: userIds }) : Promise.resolve({ rows: [], columns: [] }),
      catIds.length ? turso.execute({ sql: `SELECT id, name, parent_id FROM categories WHERE id IN (${ph(catIds)})`, args: catIds }) : Promise.resolve({ rows: [], columns: [] }),
    ])

    const projMap = new Map(rowsToObjs(projRes).map((p) => [Number(p.id), p]))
    const userMap = new Map(rowsToObjs(userRes).map((u) => [String(u.id), u]))
    const catMap = new Map(rowsToObjs(catRes).map((c) => [Number(c.id), c]))

    const parentIds = [...new Set(rowsToObjs(catRes).map((c) => c.parent_id).filter(Boolean))]
    const parentMap = new Map<number, any>()
    if (parentIds.length) {
      const pr = await turso.execute({ sql: `SELECT id, name FROM categories WHERE id IN (${ph(parentIds)})`, args: parentIds })
      rowsToObjs(pr).forEach((c) => parentMap.set(Number(c.id), c))
    }

    return tx.map((t) => {
      const n = notes.filter((x) => Number(x.transaction_id) === Number(t.id))
      const proj: any = projMap.get(Number(t.project_id))
      const usr: any = userMap.get(String(t.user_id))
      const cat: any = t.category_id ? catMap.get(Number(t.category_id)) : null
      const parent: any = cat?.parent_id ? parentMap.get(Number(cat.parent_id)) : null
      return {
        id: t.id,
        project_id: t.project_id,
        user_id: t.user_id,
        category_id: t.category_id,
        type: t.type,
        amount: Number(t.amount_eur ?? t.amount ?? 0),
        amount_eur: Number(t.amount_eur ?? t.amount ?? 0),
        amount_cfa: t.amount_cfa != null ? Number(t.amount_cfa) : undefined,
        amount_usd: t.amount_usd != null ? Number(t.amount_usd) : undefined,
        title: t.title,
        description: t.description,
        created_at: t.created_at,
        project_name: proj?.name,
        project_icon: proj?.icon,
        project_color: proj?.color,
        project_currency: proj?.currency,
        user_name: usr?.name,
        category_name: cat?.name,
        parent_category_name: parent?.name,
        has_text: n.some((nn) => nn.content_type === 'text'),
        has_document: n.some((nn) => nn.content_type === 'text' && nn.file_path),
        has_image: n.some((nn) => nn.content_type === 'image'),
        has_audio: n.some((nn) => nn.content_type === 'audio'),
        has_video: n.some((nn) => nn.content_type === 'video'),
      }
    })
  }

  async getProjectTransactions(projectId: number): Promise<any[]> {
    try {
      const uid = this.getCurrentUserId()
      if (!uid) return []
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.includes(Number(projectId))) return []

      const txRes = await turso.execute({ sql: 'SELECT * FROM transactions WHERE project_id = ? ORDER BY created_at DESC', args: [projectId] })
      const tx = rowsToObjs(txRes)
      if (!tx.length) return []

      const ids = tx.map((t) => t.id)
      const notesRes = await turso.execute({ sql: `SELECT * FROM notes WHERE transaction_id IN (${ids.map(() => '?').join(',')})`, args: ids })
      const notes = rowsToObjs(notesRes)

      return this.buildTransactionRows(tx, notes)
    } catch (e) {
      console.error('[ExpenseShare] getProjectTransactions failed:', e)
      return []
    }
  }

  async getRecentTransactions(limit = 10): Promise<any[]> {
    try {
      const uid = this.getCurrentUserId()
      if (!uid) return []
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.length) return []

      const ph = authorized.map(() => '?').join(',')
      const txRes = await turso.execute({ sql: `SELECT * FROM transactions WHERE project_id IN (${ph}) ORDER BY created_at DESC LIMIT ?`, args: [...authorized, limit] })
      const tx = rowsToObjs(txRes)
      if (!tx.length) return []

      const ids = tx.map((t) => t.id)
      const notesRes = await turso.execute({ sql: `SELECT * FROM notes WHERE transaction_id IN (${ids.map(() => '?').join(',')})`, args: ids })
      const notes = rowsToObjs(notesRes)

      return this.buildTransactionRows(tx, notes)
    } catch (e) {
      console.error('[ExpenseShare] getRecentTransactions failed:', e)
      return []
    }
  }

  async getTransactionsSince(sinceISO: string, limit = 50): Promise<any[]> {
    try {
      const uid = this.getCurrentUserId()
      if (!uid) return []
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.length) return []

      const ph = authorized.map(() => '?').join(',')
      const txRes = await turso.execute({ sql: `SELECT * FROM transactions WHERE project_id IN (${ph}) AND created_at > ? AND user_id != ? ORDER BY created_at DESC LIMIT ?`, args: [...authorized, sinceISO, String(uid), limit] })
      const tx = rowsToObjs(txRes)
      if (!tx.length) return []

      const ids = tx.map((t) => t.id)
      const notesRes = await turso.execute({ sql: `SELECT * FROM notes WHERE transaction_id IN (${ids.map(() => '?').join(',')})`, args: ids })
      const notes = rowsToObjs(notesRes)

      return this.buildTransactionRows(tx, notes)
    } catch (e) {
      console.error('[ExpenseShare] getTransactionsSince failed:', e)
      return []
    }
  }

  async getNewTransactionsCountSince(sinceISO: string): Promise<number> {
    try {
      const uid = this.getCurrentUserId()
      if (!uid) return 0
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.length) return 0
      const ph = authorized.map(() => '?').join(',')
      const r = await turso.execute({ sql: `SELECT COUNT(*) as cnt FROM transactions WHERE project_id IN (${ph}) AND created_at > ? AND user_id != ?`, args: [...authorized, sinceISO, String(uid)] })
      return Number(rowToObj(r.rows[0], r.columns).cnt ?? 0)
    } catch {
      return 0
    }
  }

  async createTransaction(payload: any): Promise<number> {
    const p = typeof payload === 'object' ? payload : null
    if (!p) throw new Error('Invalid payload')
    const r = await turso.execute({
      sql: 'INSERT INTO transactions (project_id, user_id, category_id, type, amount, amount_eur, amount_cfa, amount_usd, title, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      args: [Number(p.project_id), String(p.user_id), p.category_id ? Number(p.category_id) : null, p.type, Number(p.amount ?? 0), Number(p.amount_eur ?? p.amount ?? 0), Number(p.amount_cfa ?? 0), Number(p.amount_usd ?? 0), p.title, p.description ?? null, p.created_at ?? new Date().toISOString()],
    })
    return Number(rowToObj(r.rows[0], r.columns).id)
  }

  transactions = {
    add: async (data: Transaction): Promise<number> => {
      try {
        const basePayload = { ...data, user_id: String(data.user_id), project_id: Number(data.project_id), category_id: data.category_id ? Number(data.category_id) : null }

        let projCurrency = 'EUR'
        try {
          const proj = await this.getProjectById(Number(basePayload.project_id))
          projCurrency = (proj?.currency as string) || 'EUR'
        } catch {}

        let eurToCfa = 655.957
        let eurToUsd = 1.0
        try {
          const [cfaSetting, usdSetting] = await Promise.all([
            this.settings.get(`project:${Number(basePayload.project_id)}:eur_to_cfa`),
            this.settings.get(`project:${Number(basePayload.project_id)}:eur_to_usd`),
          ])
          if (cfaSetting?.value && !isNaN(Number(cfaSetting.value))) eurToCfa = Number(cfaSetting.value)
          if (usdSetting?.value && !isNaN(Number(usdSetting.value))) eurToUsd = Number(usdSetting.value)
        } catch {}

        const inputAmount = Number(data.amount || 0)
        const cur = String(projCurrency).toUpperCase()
        let amount_eur = 0, amount_cfa = 0, amount_usd = 0

        if (cur === 'EUR') {
          amount_eur = inputAmount; amount_cfa = inputAmount * eurToCfa; amount_usd = inputAmount * eurToUsd
        } else if (cur === 'XOF' || cur === 'CFA') {
          amount_cfa = inputAmount; amount_eur = eurToCfa ? inputAmount / eurToCfa : inputAmount; amount_usd = amount_eur * eurToUsd
        } else if (cur === 'USD') {
          amount_usd = inputAmount; amount_eur = eurToUsd ? inputAmount / eurToUsd : inputAmount; amount_cfa = amount_eur * eurToCfa
        } else {
          amount_eur = inputAmount; amount_cfa = inputAmount * eurToCfa; amount_usd = inputAmount * eurToUsd
        }

        const r2 = (v: number) => Math.round(v * 100) / 100
        const r0 = (v: number) => Math.round(v)
        amount_eur = r2(amount_eur); amount_usd = r2(amount_usd); amount_cfa = r0(amount_cfa)

        const r = await turso.execute({
          sql: 'INSERT INTO transactions (project_id, user_id, category_id, type, amount, amount_eur, amount_cfa, amount_usd, title, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
          args: [basePayload.project_id, basePayload.user_id, basePayload.category_id, data.type, amount_eur, amount_eur, amount_cfa, amount_usd, data.title, data.description ?? null, new Date().toISOString()],
        })
        const id = Number(rowToObj(r.rows[0], r.columns).id)

        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('expenshare:new-transaction', { detail: { transactionId: id, projectId: Number(basePayload.project_id) } }))
          }
        } catch {}

        return id
      } catch (e: any) {
        console.error('[ExpenseShare] transactions.add failed:', e)
        throw e
      }
    },

    where: (field: string) => ({
      equals: (value: any) => ({
        toArray: async (): Promise<Transaction[]> => {
          try {
            if (field === 'project_id') {
              const r = await turso.execute({ sql: 'SELECT * FROM transactions WHERE project_id = ? ORDER BY created_at DESC', args: [Number(value)] })
              return rowsToObjs(r) as unknown as Transaction[]
            }
            return []
          } catch (e) {
            console.error('[ExpenseShare] transactions.where failed:', e)
            return []
          }
        },
        delete: async (): Promise<number> => {
          try {
            if (field === 'project_id') {
              await turso.execute({ sql: 'DELETE FROM transactions WHERE project_id = ?', args: [Number(value)] })
              return 1
            }
            return 0
          } catch (e: any) {
            console.error('[ExpenseShare] transactions.where.delete failed:', e)
            throw e
          }
        },
      }),
    }),
  }

  async getTransactionById(id: number): Promise<any | null> {
    try {
      const r = await turso.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: [id] })
      if (!r.rows.length) return null
      return rowToObj(r.rows[0], r.columns)
    } catch (e) {
      console.error('[ExpenseShare] getTransactionById failed:', e)
      return null
    }
  }

  async updateTransaction(id: number, data: {
    amount: number
    category_id: number | null
    title: string
    description: string
  }): Promise<void> {
    try {
      // Récupérer les taux de change du projet
      const tx = await this.getTransactionById(id)
      if (!tx) throw new Error('Transaction introuvable')

      let eurToCfa = 655.957, eurToUsd = 1.0
      try {
        const [cfaSetting, usdSetting] = await Promise.all([
          this.settings.get(`project:${Number(tx.project_id)}:eur_to_cfa`),
          this.settings.get(`project:${Number(tx.project_id)}:eur_to_usd`),
        ])
        if (cfaSetting?.value && !isNaN(Number(cfaSetting.value))) eurToCfa = Number(cfaSetting.value)
        if (usdSetting?.value && !isNaN(Number(usdSetting.value))) eurToUsd = Number(usdSetting.value)
      } catch {}

      const proj = await this.getProjectById(Number(tx.project_id))
      const cur = String(proj?.currency || 'EUR').toUpperCase()
      const amt = Number(data.amount)
      let amount_eur = 0, amount_cfa = 0, amount_usd = 0

      if (cur === 'EUR') {
        amount_eur = amt; amount_cfa = amt * eurToCfa; amount_usd = amt * eurToUsd
      } else if (cur === 'XOF' || cur === 'CFA') {
        amount_cfa = amt; amount_eur = eurToCfa ? amt / eurToCfa : amt; amount_usd = amount_eur * eurToUsd
      } else if (cur === 'USD') {
        amount_usd = amt; amount_eur = eurToUsd ? amt / eurToUsd : amt; amount_cfa = amount_eur * eurToCfa
      } else {
        amount_eur = amt; amount_cfa = amt * eurToCfa; amount_usd = amt * eurToUsd
      }

      const r2 = (v: number) => Math.round(v * 100) / 100
      const r0 = (v: number) => Math.round(v)

      await turso.execute({
        sql: 'UPDATE transactions SET amount = ?, amount_eur = ?, amount_cfa = ?, amount_usd = ?, category_id = ?, title = ?, description = ? WHERE id = ?',
        args: [r2(amount_eur), r2(amount_eur), r0(amount_cfa), r2(amount_usd), data.category_id, data.title, data.description || null, id],
      })

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('expenshare:project-updated'))
      }
    } catch (e: any) {
      console.error('[ExpenseShare] updateTransaction failed:', e)
      throw e
    }
  }

  async deleteTransaction(id: number): Promise<void> {
    try {
      await turso.execute({ sql: 'DELETE FROM notes WHERE transaction_id = ?', args: [id] })
      await turso.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [id] })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('expenshare:project-updated'))
      }
    } catch (e: any) {
      console.error('[ExpenseShare] deleteTransaction failed:', e)
      throw e
    }
  }

  // ─── GLOBAL STATS ─────────────────────────────────────────────────────────

  async getGlobalStats() {
    const empty = { totalExpenses: 0, totalBudgets: 0, balance: 0, transactionCount: 0, lastTransactionDate: null, projectCount: 0, expensesByMonth: [], budgetsByMonth: [], totalExpenses_eur: 0, totalBudgets_eur: 0, totalExpenses_cfa: 0, totalBudgets_cfa: 0, totalExpenses_usd: 0, totalBudgets_usd: 0, eurToCfa: null as number | null, eurToUsd: null as number | null }
    try {
      const uid = this.getCurrentUserId()
      if (!uid) return empty
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.length) return { ...empty, projectCount: 0 }

      const ph = authorized.map(() => '?').join(',')
      const [txRes, projCount, cfaSetting, usdSetting] = await Promise.all([
        turso.execute({ sql: `SELECT * FROM transactions WHERE project_id IN (${ph})`, args: authorized }),
        turso.execute({ sql: `SELECT COUNT(*) as cnt FROM projects WHERE id IN (${ph})`, args: authorized }),
        this.settings.get(`user:${uid}:eur_to_cfa`).catch(() => null),
        this.settings.get(`user:${uid}:eur_to_usd`).catch(() => null),
      ])

      const userEurToCfa = cfaSetting?.value && Number(cfaSetting.value) > 0 ? Number(cfaSetting.value) : null
      const userEurToUsd = usdSetting?.value && Number(usdSetting.value) > 0 ? Number(usdSetting.value) : null

      const all = rowsToObjs(txRes)
      const projectCount = Number(rowToObj(projCount.rows[0], projCount.columns).cnt ?? 0)
      const expenses = all.filter((t) => t.type === 'expense')
      const budgets = all.filter((t) => t.type === 'budget')

      const getEur = (t: any) => Number(t.amount_eur ?? t.amount ?? 0)
      const getCfa = (t: any) => Number(t.amount_cfa ?? 0)
      const getUsd = (t: any) => Number(t.amount_usd ?? 0)

      const totalExpenses = expenses.reduce((s, t) => s + getEur(t), 0)
      const totalBudgets = budgets.reduce((s, t) => s + getEur(t), 0)

      const groupByMonth = (arr: any[]) => {
        const months: Record<string, number> = {}
        arr.forEach((t) => {
          const d = new Date(t.created_at)
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          months[k] = (months[k] || 0) + getEur(t)
        })
        return Object.entries(months).map(([month, amount]) => ({ month, amount }))
      }

      const lastTransactionDate = all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at || null

      // Utiliser les taux utilisateur pour la conversion (source de vérité), sinon les montants stockés
      const totalExpenses_cfa = userEurToCfa
        ? Math.round(totalExpenses * userEurToCfa)
        : expenses.reduce((s, t) => s + getCfa(t), 0)
      const totalBudgets_cfa = userEurToCfa
        ? Math.round(totalBudgets * userEurToCfa)
        : budgets.reduce((s, t) => s + getCfa(t), 0)
      const totalExpenses_usd = userEurToUsd
        ? Math.round(totalExpenses * userEurToUsd * 100) / 100
        : expenses.reduce((s, t) => s + getUsd(t), 0)
      const totalBudgets_usd = userEurToUsd
        ? Math.round(totalBudgets * userEurToUsd * 100) / 100
        : budgets.reduce((s, t) => s + getUsd(t), 0)

      return {
        totalExpenses, totalBudgets, balance: totalBudgets - totalExpenses,
        transactionCount: all.length, lastTransactionDate, projectCount,
        expensesByMonth: groupByMonth(expenses), budgetsByMonth: groupByMonth(budgets),
        totalExpenses_eur: totalExpenses, totalBudgets_eur: totalBudgets,
        totalExpenses_cfa, totalBudgets_cfa,
        totalExpenses_usd, totalBudgets_usd,
        eurToCfa: userEurToCfa,
        eurToUsd: userEurToUsd,
      }
    } catch (e) {
      console.error('[ExpenseShare] getGlobalStats failed:', e)
      return empty
    }
  }

  // ─── NOTES ────────────────────────────────────────────────────────────────

  async getNotesByTransaction(transactionId: number): Promise<Note[]> {
    try {
      const r = await turso.execute({ sql: 'SELECT * FROM notes WHERE transaction_id = ? ORDER BY created_at ASC', args: [transactionId] })
      return rowsToObjs(r) as unknown as Note[]
    } catch (e) {
      console.error('[ExpenseShare] getNotesByTransaction failed:', e)
      return []
    }
  }

  notes = {
    delete: async (noteId: number): Promise<void> => {
      try {
        await turso.execute({ sql: 'DELETE FROM notes WHERE id = ?', args: [noteId] })
      } catch (e: any) {
        console.error('[ExpenseShare] notes.delete failed:', e)
        throw e
      }
    },

    add: async (data: Note): Promise<number> => {
      try {
        const r = await turso.execute({
          sql: 'INSERT INTO notes (transaction_id, content_type, content, file_path, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
          args: [Number(data.transaction_id), data.content_type, data.content ?? null, data.file_path ?? null, new Date().toISOString()],
        })
        return Number(rowToObj(r.rows[0], r.columns).id)
      } catch (e: any) {
        console.error('[ExpenseShare] notes.add failed:', e)
        throw e
      }
    },

    where: (field: string) => ({
      equals: (value: any) => ({
        toArray: async (): Promise<Note[]> => {
          try {
            if (field === 'transaction_id') {
              const r = await turso.execute({ sql: 'SELECT * FROM notes WHERE transaction_id = ? ORDER BY created_at ASC', args: [Number(value)] })
              return rowsToObjs(r) as unknown as Note[]
            }
            return []
          } catch (e) {
            console.error('[ExpenseShare] notes.where failed:', e)
            return []
          }
        },
        delete: async (): Promise<number> => {
          try {
            if (field === 'transaction_id') {
              await turso.execute({ sql: 'DELETE FROM notes WHERE transaction_id = ?', args: [Number(value)] })
              return 1
            }
            return 0
          } catch (e: any) {
            console.error('[ExpenseShare] notes.where.delete failed:', e)
            throw e
          }
        },
      }),
    }),
  }

  // ─── SETTINGS ─────────────────────────────────────────────────────────────

  settings = {
    get: async (key: string): Promise<Setting | null> => {
      try {
        const r = await turso.execute({ sql: 'SELECT * FROM settings WHERE key = ? LIMIT 1', args: [key] })
        if (!r.rows.length) return null
        return rowToObj(r.rows[0], r.columns) as unknown as Setting
      } catch (e) {
        console.error('[ExpenseShare] settings.get failed:', e)
        return null
      }
    },

    put: async (data: Setting): Promise<string> => {
      try {
        await turso.execute({
          sql: 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          args: [data.key, data.value, new Date().toISOString()],
        })
        return data.key
      } catch (e: any) {
        console.error('[ExpenseShare] settings.put failed:', e)
        throw e
      }
    },
  }

  // ─── BUDGET TRANSFERS ────────────────────────────────────────────────────

  async createBudgetTransfer(payload: {
    source_project_id: number
    target_project_id: number
    amount_eur: number
    amount_cfa: number
    amount_usd: number
    note?: string
  }): Promise<number> {
    const uid = this.getCurrentUserId()
    const r = await turso.execute({
      sql: 'INSERT INTO project_budget_transfers (source_project_id, target_project_id, amount_eur, amount_cfa, amount_usd, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      args: [payload.source_project_id, payload.target_project_id, payload.amount_eur, payload.amount_cfa, payload.amount_usd, payload.note ?? null, uid, new Date().toISOString()],
    })
    return Number(rowToObj(r.rows[0], r.columns).id)
  }

  async getProjectBudgetTransfers(projectId: number): Promise<{
    outgoing: any[]
    incoming: any[]
  }> {
    try {
      const [outR, inR] = await Promise.all([
        turso.execute({ sql: 'SELECT t.*, p.name as target_name, p.icon as target_icon, p.color as target_color FROM project_budget_transfers t LEFT JOIN projects p ON p.id = t.target_project_id WHERE t.source_project_id = ? ORDER BY t.created_at DESC', args: [projectId] }),
        turso.execute({ sql: 'SELECT t.*, p.name as source_name, p.icon as source_icon, p.color as source_color FROM project_budget_transfers t LEFT JOIN projects p ON p.id = t.source_project_id WHERE t.target_project_id = ? ORDER BY t.created_at DESC', args: [projectId] }),
      ])
      return { outgoing: rowsToObjs(outR), incoming: rowsToObjs(inR) }
    } catch {
      return { outgoing: [], incoming: [] }
    }
  }

  async deleteProjectBudgetTransfer(transferId: number): Promise<boolean> {
    try {
      await turso.execute({ sql: 'DELETE FROM project_budget_transfers WHERE id = ?', args: [transferId] })
      return true
    } catch {
      return false
    }
  }

  async getAllProjectBudgetTransfers(projectIds: number[]): Promise<any[]> {
    if (!projectIds.length) return []
    try {
      const ph = projectIds.map(() => '?').join(',')
      const r = await turso.execute({
        sql: `SELECT t.*,
          ps.name as source_name, ps.icon as source_icon,
          pt.name as target_name, pt.icon as target_icon
          FROM project_budget_transfers t
          LEFT JOIN projects ps ON ps.id = t.source_project_id
          LEFT JOIN projects pt ON pt.id = t.target_project_id
          WHERE t.source_project_id IN (${ph}) OR t.target_project_id IN (${ph})
          ORDER BY t.created_at DESC`,
        args: [...projectIds, ...projectIds],
      })
      return rowsToObjs(r)
    } catch {
      return []
    }
  }

  // ─── EXPORT ───────────────────────────────────────────────────────────────

  downloadDatabase() {
    ;(async () => {
      try {
        const tables = ['users', 'projects', 'project_users', 'categories', 'transactions', 'notes', 'settings'] as const
        const result: Record<string, any[]> = {}
        for (const t of tables) {
          const r = await turso.execute({ sql: `SELECT * FROM ${t}`, args: [] })
          result[t] = rowsToObjs(r)
        }
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `expenseshare-turso-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } catch (e) {
        console.error('[ExpenseShare] downloadDatabase failed:', e)
      }
    })()
  }

  uploadDatabase(file: File) {
    void file
    throw new Error('Import direct non supporté. Utilisez le script de migration.')
  }
}

export type TursoDatabaseInstance = TursoDatabase
export const db = new TursoDatabase()
