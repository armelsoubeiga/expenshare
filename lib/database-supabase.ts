"use client"

import { supabase } from './supabase'
import { User, Project, ProjectUser, Category, Transaction, Note, Setting } from './types'

// Classe de gestion de la base de données avec Supabase
class SupabaseDatabase {
  // --- Helpers d'autorisation (sans RLS) ---
  private getCurrentUserId(): string | null {
    try {
      const stored =
        (typeof window !== 'undefined' && (localStorage.getItem('expenshare_current_user') || localStorage.getItem('expenshare_user'))) ||
        null
      if (!stored) return null
      const obj = JSON.parse(stored)
      return obj?.id ? String(obj.id) : null
    } catch {
      return null
    }
  }

  /**
   * Retourne la liste des project_ids accessibles pour un utilisateur donné
   */
  private async getAuthorizedProjectIds(userId: string): Promise<number[]> {
    try {
      // Projets créés par l'utilisateur
      const { data: created } = await supabase
        .from('projects')
        .select('id')
        .eq('created_by', userId)

      // Projets où l'utilisateur est membre
      const { data: memberships } = await supabase
        .from('project_users')
        .select('project_id')
        .eq('user_id', userId)

      const ids = new Set<number>()
      ;(created || []).forEach((p: any) => ids.add(Number(p.id)))
      ;(memberships || []).forEach((m: any) => ids.add(Number(m.project_id)))
      return Array.from(ids)
    } catch {
      return []
    }
  }

  /**
   * Supprime un utilisateur par son ID (admin uniquement)
   * @param userId ID de l'utilisateur à supprimer
   * @throws Error si la suppression échoue
   */
  async deleteUser(userId: string) {
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) {
      console.error('[ExpenseShare] Error deleting user:', error);
      throw new Error(error.message);
    }
    return true;
  }
  projects = {
    add: async (data: Project) => {
      try {
        const payload = {
          ...data,
          created_by: String(data.created_by),
          created_at: data.created_at ? (typeof data.created_at === 'string' ? data.created_at : (data.created_at as Date).toISOString()) : new Date().toISOString()
        }
        const { data: inserted, error } = await supabase
          .from('projects')
          .insert(payload)
          .select('id')
          .single();
        if (error) {
          console.error('[ExpenseShare] Error adding project:', error)
          throw new Error(error.message)
        }
        return inserted?.id
      } catch (error: any) {
        console.error('[ExpenseShare] projects.add failed:', error)
        throw error
      }
    },
    where: (field: string) => ({
      equals: (value: any) => ({
        toArray: async () => {
          try {
            if (field === 'id') {
              const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', Number(value))
              if (error) {
                console.error('[ExpenseShare] Error fetching projects by id:', error)
                return []
              }
              return (data || []) as Project[]
            }
            if (field === 'created_by') {
              const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('created_by', String(value))
              if (error) {
                console.error('[ExpenseShare] Error fetching projects by created_by:', error)
                return []
              }
              return (data || []) as Project[]
            }
            return []
          } catch (error) {
            console.error('[ExpenseShare] projects.where.equals.toArray failed:', error)
            return []
          }
        },
        delete: async () => {
          try {
            if (field === 'id') {
              const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', Number(value))
              if (error) {
                console.error('[ExpenseShare] Error deleting project by id:', error)
                throw new Error(error.message)
              }
              return 1
            }
            return 0
          } catch (error: any) {
            console.error('[ExpenseShare] projects.where.equals.delete failed:', error)
            throw error
          }
        }
      })
    }),
    toArray: async () => {
      try {
        const uid = this.getCurrentUserId()
        if (!uid) return []

        // Vérifier si admin
        let isAdmin = false
        try {
          const { data } = await supabase.from('users').select('id').eq('id', uid).eq('is_admin', true).maybeSingle()
          isAdmin = !!data
        } catch {}

        if (isAdmin) {
          const { data, error } = await supabase.from('projects').select('*')
          if (error) return []
          return (data || []) as Project[]
        }

        const authorized = await this.getAuthorizedProjectIds(uid)
        if (!authorized.length) return []
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .in('id', authorized)
        if (error) return []
        return (data || []) as Project[]
      } catch (error) {
        console.error('[ExpenseShare] projects.toArray failed:', error)
        return []
      }
    }
  }
  // --- Méthodes métiers attendues par l'app ---
  async createProject(name: string, description: string, icon: string, color: string, currency: string, created_by: string | number) {
    const payload: any = { name, description, icon, color, currency, created_by: String(created_by), created_at: new Date().toISOString() };
    const { data, error } = await supabase.from('projects').insert(payload).select('id').single();
    if (error) throw new Error(error.message);
    // Créer l’association owner
    await supabase.from('project_users').insert({ project_id: data!.id, user_id: String(created_by), role: 'owner', added_at: new Date().toISOString() });
    return data!.id as number;
  }

  async getUserProjects(userId: string | number) {
    try {
      // Toujours filtrer: projets créés par l'utilisateur + projets où il est membre
      const uid = String(userId)
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.length) return []

      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .in('id', authorized)

      if (error) {
        console.error('[ExpenseShare] Error loading user projects:', error)
        return []
      }

      // Récupérer les rôles depuis project_users
      const { data: rels } = await supabase
        .from('project_users')
        .select('project_id, role')
        .eq('user_id', uid)

      return (projects || []).map((p: any) => ({
        ...p,
        role:
          String(p.created_by) === uid
            ? 'owner'
            : (rels || []).find((r: any) => Number(r.project_id) === Number(p.id))?.role || 'viewer',
      }))
    } catch (error) {
      console.error('[ExpenseShare] getUserProjects failed:', error);
      return [];
    }
  }

  async getProjectById(projectId: number) {
    try {
  const uid = this.getCurrentUserId()
  if (!uid) return null
  const authorized = await this.getAuthorizedProjectIds(uid)
  if (!authorized.includes(Number(projectId))) return null
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      
      if (error) {
        console.error('[ExpenseShare] Error getting project by ID:', error);
        return null;
      }
      
      return data as Project;
    } catch (error) {
      console.error('[ExpenseShare] getProjectById failed:', error);
      return null;
    }
  }

  /**
   * Met à jour un projet et retourne l'objet projet mis à jour.
   * Retourne null en cas d'erreur.
   */
  async updateProject(projectId: number, values: { name: string; description: string; icon: string; color: string; currency: string }) {
    try {
      const { error } = await supabase
        .from('projects')
        .update(values)
        .eq('id', projectId);
      if (error) {
        console.error('[ExpenseShare] Error updating project:', error);
        return null;
      }
      // Re-fetch the project to return the updated data
      return await this.getProjectById(projectId);
    } catch (e) {
      console.error('[ExpenseShare] updateProject failed:', e);
      return null;
    }
  }

  async getProjectCategories(projectId: number) {
  const uid = this.getCurrentUserId()
  if (!uid) return []
  const authorized = await this.getAuthorizedProjectIds(uid)
  if (!authorized.includes(Number(projectId))) return []
  const { data, error } = await supabase.from('categories').select('*').eq('project_id', projectId);
    if (error) return [];
    return data as Category[];
  }

  async getProjectCategoryHierarchy(projectId: number): Promise<any[]> {
    try {
  const uid = this.getCurrentUserId()
  if (!uid) return []
  const authorized = await this.getAuthorizedProjectIds(uid)
  if (!authorized.includes(Number(projectId))) return []
      // Charger catégories du projet
      const { data: categories, error: catErr } = await supabase
        .from('categories')
        .select('*')
        .eq('project_id', projectId)
        .order('level', { ascending: true })
        .order('name', { ascending: true })

      if (catErr) return []

      // Charger transactions du projet
      const { data: transactions, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('project_id', projectId)

      if (txErr) return []

      // Totaux par (category_id, type)
      const totals = new Map<string, number>()
      ;(transactions || []).forEach((t: any) => {
        if (t.category_id) {
          const key = `${t.category_id}_${t.type}`
          totals.set(key, (totals.get(key) || 0) + Number(t.amount))
        }
      })

      // Palette de couleurs simple et stable
      const getColorForIndex = (index: number) => {
        const colors = [
          '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
          '#60A5FA', '#34D399', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'
        ]
        return colors[index % colors.length]
      }

      // Construction récursive de l'arbre (parent_id null => niveau racine)
      const cats = (categories || []) as Category[]
      const build = (parentId: number | null = null, level = 1): any[] => {
        return cats
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
              color: getColorForIndex(idx + level * 3),
              level,
              parentId: parentId !== null ? String(parentId) : undefined,
              children: children.length > 0 ? children : undefined,
            }
          })
          .filter((node) => Number(node.value || 0) > 0)
      }

      return build(null, 1)
    } catch (e) {
      console.error('[ExpenseShare] getProjectCategoryHierarchy failed:', e)
      return []
    }
  }

  async getProjectTransactions(projectId: number) {
    try {
  // Autorisation: l'utilisateur doit avoir accès à ce projet
  const uid = this.getCurrentUserId()
  if (!uid) return []
  const authorized = await this.getAuthorizedProjectIds(uid)
  if (!authorized.includes(Number(projectId))) return []

      // 1) Récupérer les transactions (sans jointures pour réduire l'impact RLS)
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (txErr) return []

      const ids = (tx || []).map((t: any) => t.id)
      const projIds = Array.from(new Set((tx || []).map((t: any) => t.project_id)))
      const userIds = Array.from(new Set((tx || []).map((t: any) => String(t.user_id))))
      const catIds = Array.from(new Set((tx || []).map((t: any) => t.category_id).filter(Boolean)))

      // 2) Charger notes (flags)
      const { data: notes } = ids.length
        ? await supabase.from('notes').select('*').in('transaction_id', ids)
        : { data: [] as any[] }

      // 3) Charger projets, users, catégories (meilleure tolérance aux RLS)
      const [projectsRes, usersRes, categoriesRes] = await Promise.all([
        projIds.length ? supabase.from('projects').select('id, name, icon, color').in('id', projIds) : Promise.resolve({ data: [] as any[], error: null } as any),
        userIds.length ? supabase.from('users').select('id, name').in('id', userIds) : Promise.resolve({ data: [] as any[], error: null } as any),
        catIds.length ? supabase.from('categories').select('id, name, parent_id').in('id', catIds) : Promise.resolve({ data: [] as any[], error: null } as any)
      ])

      const projects: any[] = (projectsRes as any)?.data || []
      const users: any[] = (usersRes as any)?.data || []
      const categories: any[] = (categoriesRes as any)?.data || []

      const projMap = new Map<any, any>(projects.map((p: any) => [p.id, p]))
      const userMap = new Map<any, any>(users.map((u: any) => [String(u.id), u]))
      const catMap = new Map<any, any>(categories.map((c: any) => [c.id, c]))

      // 4) Pour parent_category_name, on récupère les parents nécessaires
      const parentIdsAny: any[] = Array.from(new Set(categories.map((c: any) => c.parent_id).filter((v: any) => v != null)))
      const { data: parents } = parentIdsAny.length
        ? await supabase.from('categories').select('id, name').in('id', parentIdsAny as number[])
        : { data: [] as any[] }
      const parentMap = new Map<any, any>((parents || []).map((p: any) => [p.id, p]))

      return (tx || []).map((t: any) => {
        const n = (notes || []).filter((x) => x.transaction_id === t.id)
  const proj: any = projMap.get(t.project_id)
  const usr: any = userMap.get(String(t.user_id))
  const cat: any = t.category_id ? catMap.get(t.category_id) : null
  const parent: any = cat?.parent_id ? parentMap.get(cat.parent_id) : null
        return {
          id: t.id,
          project_id: t.project_id,
          user_id: t.user_id,
          category_id: t.category_id,
          type: t.type,
          amount: t.amount,
          title: t.title,
          description: t.description,
          created_at: t.created_at,
          project_name: proj?.name,
          project_icon: proj?.icon,
          project_color: proj?.color,
          user_name: usr?.name,
          category_name: cat?.name,
          parent_category_name: parent?.name,
          has_text: n.some((nn) => nn.content_type === 'text'),
          has_document: n.some((nn) => nn.content_type === 'text' && nn.file_path),
          has_image: n.some((nn) => nn.content_type === 'image'),
          has_audio: n.some((nn) => nn.content_type === 'audio'),
        }
      })
    } catch (e) {
      console.error('[ExpenseShare] getProjectTransactions failed:', e)
      return []
    }
  }

  async getRecentTransactions(limit = 10) {
    try {
      // Filtrer par projets autorisés
      const uid = this.getCurrentUserId()
      if (!uid) return []
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.length) return []

      // 1) Transactions autorisées
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .in('project_id', authorized)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (txErr) return []

      const ids = (tx || []).map((t: any) => t.id)
      const projIds = Array.from(new Set((tx || []).map((t: any) => t.project_id)))
      const userIds = Array.from(new Set((tx || []).map((t: any) => String(t.user_id))))
      const catIds = Array.from(new Set((tx || []).map((t: any) => t.category_id).filter(Boolean)))

      // 2) Notes
      const { data: notes } = ids.length
        ? await supabase.from('notes').select('*').in('transaction_id', ids)
        : { data: [] as any[] }

      // 3) Métadonnées (projets, users, catégories)
      const [projectsRes, usersRes, categoriesRes] = await Promise.all([
        projIds.length ? supabase.from('projects').select('id, name, icon, color').in('id', projIds) : Promise.resolve({ data: [] as any[], error: null } as any),
        userIds.length ? supabase.from('users').select('id, name').in('id', userIds) : Promise.resolve({ data: [] as any[], error: null } as any),
        catIds.length ? supabase.from('categories').select('id, name, parent_id').in('id', catIds) : Promise.resolve({ data: [] as any[], error: null } as any)
      ])

      const projects: any[] = (projectsRes as any)?.data || []
      const users: any[] = (usersRes as any)?.data || []
      const categories: any[] = (categoriesRes as any)?.data || []

      const projMap = new Map<any, any>(projects.map((p: any) => [p.id, p]))
      const userMap = new Map<any, any>(users.map((u: any) => [String(u.id), u]))
      const catMap = new Map<any, any>(categories.map((c: any) => [c.id, c]))

      // Parents
      const parentIdsAny: any[] = Array.from(new Set(categories.map((c: any) => c.parent_id).filter((v: any) => v != null)))
      const { data: parents } = parentIdsAny.length
        ? await supabase.from('categories').select('id, name').in('id', parentIdsAny as number[])
        : { data: [] as any[] }
      const parentMap = new Map<any, any>((parents || []).map((p: any) => [p.id, p]))

      return (tx || []).map((t: any) => {
        const n = (notes || []).filter((x) => x.transaction_id === t.id)
  const proj: any = projMap.get(t.project_id)
  const usr: any = userMap.get(String(t.user_id))
  const cat: any = t.category_id ? catMap.get(t.category_id) : null
  const parent: any = cat?.parent_id ? parentMap.get(cat.parent_id) : null
        return {
          id: t.id,
          project_id: t.project_id,
          user_id: t.user_id,
          category_id: t.category_id,
          type: t.type,
          amount: t.amount,
          title: t.title,
          description: t.description,
          created_at: t.created_at,
          project_name: proj?.name,
          project_icon: proj?.icon,
          project_color: proj?.color,
          user_name: usr?.name,
          category_name: cat?.name,
          parent_category_name: parent?.name,
          has_text: n.some((nn) => nn.content_type === 'text'),
          has_document: n.some((nn) => nn.content_type === 'text' && nn.file_path),
          has_image: n.some((nn) => nn.content_type === 'image'),
          has_audio: n.some((nn) => nn.content_type === 'audio'),
        }
      })
    } catch (e) {
      console.error('[ExpenseShare] getRecentTransactions failed:', e)
      return []
    }
  }

  async getNotesByTransaction(transactionId: number) {
    const { data, error } = await supabase.from('notes').select('*').eq('transaction_id', transactionId);
    if (error) return [];
    return data as Note[];
  }

  async getGlobalStats() {
    try {
      const uid = this.getCurrentUserId()
      if (!uid) {
        return { totalExpenses: 0, totalBudgets: 0, balance: 0, transactionCount: 0, lastTransactionDate: null, projectCount: 0, expensesByMonth: [], budgetsByMonth: [] }
      }
      const authorized = await this.getAuthorizedProjectIds(uid)
      if (!authorized.length) {
        return { totalExpenses: 0, totalBudgets: 0, balance: 0, transactionCount: 0, lastTransactionDate: null, projectCount: 0, expensesByMonth: [], budgetsByMonth: [] }
      }

      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('id, type, amount, created_at, project_id')
        .in('project_id', authorized)
      const { count: projectCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .in('id', authorized as number[])

      const expenses = (transactionsData || []).filter((t) => t.type === 'expense');
      const budgets = (transactionsData || []).filter((t) => t.type === 'budget');
      const totalExpenses = expenses.reduce((s, t) => s + Number(t.amount), 0);
      const totalBudgets = budgets.reduce((s, t) => s + Number(t.amount), 0);
      const balance = totalBudgets - totalExpenses;
      const lastTransactionDate = (transactionsData || [])
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at || null;

      const groupByMonth = (arr: any[]) => {
        const months: Record<string, number> = {};
        arr.forEach((t) => {
          const d = new Date(t.created_at);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          months[k] = (months[k] || 0) + Number(t.amount);
        });
        return Object.entries(months).map(([month, amount]) => ({ month, amount }));
      };

      return {
        totalExpenses,
        totalBudgets,
        balance,
        transactionCount: transactionsData?.length || 0,
        lastTransactionDate,
        projectCount: projectCount || 0,
        expensesByMonth: groupByMonth(expenses),
        budgetsByMonth: groupByMonth(budgets),
      };
    } catch (e) {
      return { totalExpenses: 0, totalBudgets: 0, balance: 0, transactionCount: 0, lastTransactionDate: null, projectCount: 0, expensesByMonth: [], budgetsByMonth: [] };
    }
  }

  async createTransaction(payload: any) {
    const p = typeof payload === 'object' ? payload : null;
    if (!p) throw new Error('Invalid payload');
    const toInsert: any = { ...p, user_id: String((p as any).user_id) };
    const { data, error } = await supabase.from('transactions').insert(toInsert).select('id').single();
    if (error) throw new Error(error.message);
    return data!.id as number;
  }
  async getAdminUserId(): Promise<string | null> {
    try {
      const { data, error } = await supabase.from('users').select('id').eq('is_admin', true).maybeSingle()
      if (error || !data) return null
      return data.id
    } catch {
      return null
    }
  }
  private isInitialized = false

  get isReady() {
    return this.isInitialized
  }

  // Initialiser la base de données
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Vérifier la connexion à Supabase avec timeout
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout de connexion à Supabase')), 10000))
      const query = supabase.from('users').select('id', { head: true, count: 'exact' })
      const { error } = (await Promise.race([query, timeout])) as any
      if (error) {
        console.error('[ExpenseShare] Supabase connection error:', error)
        throw error
      }

      this.isInitialized = true
      console.log('[ExpenseShare] Supabase connected')

      // Assurer qu'il existe un utilisateur admin par défaut
      await this.ensureAdminUser()

      // Vérifier la présence des autres tables clés pour fournir des erreurs explicites
      const checks = [
        supabase.from('projects').select('id', { head: true, count: 'exact' }),
        supabase.from('project_users').select('project_id', { head: true, count: 'exact' }),
        supabase.from('categories').select('id', { head: true, count: 'exact' }),
        supabase.from('transactions').select('id', { head: true, count: 'exact' }),
        supabase.from('notes').select('id', { head: true, count: 'exact' }),
        supabase.from('settings').select('key', { head: true, count: 'exact' }),
      ]
      const results = await Promise.allSettled(checks)
      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          console.warn('[ExpenseShare] Table check failed:', idx, r.reason)
        } else {
          const er = (r.value as any)?.error
          if (er) console.warn('[ExpenseShare] Table check error:', er)
        }
      })
    } catch (error: any) {
      console.error('[ExpenseShare] Failed to initialize Supabase:', error)
      throw new Error(error?.message || 'Impossible de se connecter à Supabase')
    }
  }

  // Assurer qu'il existe un utilisateur admin par défaut
  private async ensureAdminUser(): Promise<void> {
    try {
      console.log('[ExpenseShare] Checking for admin user...')
      const { data: adminUser, error: selectError } = await supabase
        .from('users')
        .select('id')
        .eq('name', 'admin')
        .maybeSingle()

      if (selectError) {
        console.error('[ExpenseShare] Error checking admin user:', selectError)
      }

      if (!adminUser) {
        console.log('[ExpenseShare] Creating admin user...')
        const pinHash = btoa('1234' + 'salt_' + 'admin')
        const { error: insertError } = await supabase.from('users').insert({
          name: 'admin',
          pin_hash: pinHash,
          is_admin: true,
          created_at: new Date().toISOString()
        })
        if (insertError) {
          console.error('[ExpenseShare] Failed to create admin user:', insertError)
        } else {
          console.log('[ExpenseShare] Admin user created successfully')
        }
      } else {
        console.log('[ExpenseShare] Admin user already exists')
      }
    } catch (error) {
      console.error('[ExpenseShare] Error in ensureAdminUser:', error)
    }
  }

  // Couche de compatibilité attendue par l'app -----------------------------
  users = {
    getByName: async (name: string) => {
      try {
        const { data, error } = await supabase.from('users').select('*').eq('name', name).maybeSingle();
        if (error) {
          console.error('[ExpenseShare] Error getting user by name:', error);
          return null;
        }
        return data as User;
      } catch (error) {
        console.error('[ExpenseShare] users.getByName failed:', error);
        return null;
      }
    },
    toArray: async (): Promise<User[]> => {
      try {
        const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false })
        if (error) {
          console.error('[ExpenseShare] Error fetching users:', error)
          throw new Error(error.message)
        }
        return (data || []) as User[]
      } catch (error: any) {
        console.error('[ExpenseShare] users.toArray failed:', error)
        throw error
      }
    },
    add: async (data: Omit<User, 'id'>): Promise<string> => {
      try {
        // Génère un UUID pour l'id utilisateur
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now();

        const payload = {
          id,
          name: data.name,
          pin_hash: data.pin_hash,
          is_admin: false,
          created_at: new Date().toISOString()
        };

        const { data: inserted, error } = await supabase
          .from('users')
          .insert(payload)
          .select('id')
          .single();

        if (error) throw new Error(`Erreur création utilisateur: ${error.message}`);
        return inserted!.id;
      } catch (error: any) {
        console.error('[ExpenseShare] users.add failed:', error)
        throw error;
      }
    },
    get: async (id: string | number) => {
      try {
        const { data, error } = await supabase.from('users').select('*').eq('id', String(id)).maybeSingle()
        if (error) {
          console.error('[ExpenseShare] Error getting user:', error)
          return null
        }
        return data as User
      } catch (error: any) {
        console.error('[ExpenseShare] users.get failed:', error)
        return null
      }
    },
  }

  project_users = {
    add: async (data: ProjectUser) => {
      try {
        const payload: any = { 
          ...data, 
          user_id: String(data.user_id),
          project_id: Number(data.project_id)
        }
        
        if (!payload.added_at) {
          payload.added_at = new Date().toISOString()
        }
        
        console.log('[ExpenseShare] Adding project user:', payload)
        const { error } = await supabase.from('project_users').insert(payload)
        
        if (error) {
          console.error('[ExpenseShare] Error adding project user:', error)
          throw new Error(error.message)
        }
        
        return 1
      } catch (error: any) {
        console.error('[ExpenseShare] project_users.add failed:', error)
        throw error
      }
    },
    // Supprimer un utilisateur d'un projet (par project_id + user_id)
    remove: async (project_id: number, user_id: string | number) => {
      try {
        const { error } = await supabase
          .from('project_users')
          .delete()
          .eq('project_id', Number(project_id))
          .eq('user_id', String(user_id))

        if (error) {
          console.error('[ExpenseShare] Error removing project user:', error)
          throw new Error(error.message)
        }

        return 1
      } catch (error: any) {
        console.error('[ExpenseShare] project_users.remove failed:', error)
        throw error
      }
    },
    where: (field: string) => ({
      equals: (value: any) => ({
        toArray: async () => {
          try {
            if (field === 'user_id') {
              const { data, error } = await supabase
                .from('project_users')
                .select('*')
                .eq('user_id', String(value))
              
              if (error) {
                console.error('[ExpenseShare] Error fetching project_users by user_id:', error)
                return []
              }
              
              return (data || []) as ProjectUser[]
            }
            
            if (field === 'project_id') {
              const { data, error } = await supabase
                .from('project_users')
                .select('*')
                .eq('project_id', Number(value))
              
              if (error) {
                console.error('[ExpenseShare] Error fetching project_users by project_id:', error)
                return []
              }
              
              return (data || []) as ProjectUser[]
            }
            
            return []
          } catch (error) {
            console.error('[ExpenseShare] project_users.where.equals.toArray failed:', error)
            return []
          }
        },
        delete: async () => {
          try {
            if (field !== 'project_id') return 0
            
            const { error } = await supabase
              .from('project_users')
              .delete()
              .eq('project_id', Number(value))
            
            if (error) {
              console.error('[ExpenseShare] Error deleting project_users by project_id:', error)
              throw new Error(error.message)
            }
            
            return 1
          } catch (error: any) {
            console.error('[ExpenseShare] project_users.where.equals.delete failed:', error)
            throw error
          }
        },
      }),
    }),
  }

  categories = {
    add: async (data: Category) => {
      try {
        const payload = {
          ...data,
          project_id: Number(data.project_id),
          parent_id: data.parent_id ? Number(data.parent_id) : null,
          created_at: new Date().toISOString()
        }
        
        const { data: inserted, error } = await supabase
          .from('categories')
          .insert(payload)
          .select('id')
          .single();
        
        if (error) {
          console.error('[ExpenseShare] Error adding category:', error)
          throw new Error(error.message)
        }
        
        return inserted?.id
      } catch (error: any) {
        console.error('[ExpenseShare] categories.add failed:', error)
        throw error
      }
    },
    where: (field: string) => ({
      equals: (value: any) => ({
        toArray: async () => {
          try {
            if (field === 'project_id') {
              const { data, error } = await supabase
                .from('categories')
                .select('*')
                .eq('project_id', Number(value))
                .order('level', { ascending: true })
                .order('name', { ascending: true })
              
              if (error) {
                console.error('[ExpenseShare] Error fetching categories by project_id:', error)
                return []
              }
              
              return (data || []) as Category[]
            }
            return []
          } catch (error) {
            console.error('[ExpenseShare] categories.where.equals.toArray failed:', error)
            return []
          }
        },
        delete: async () => {
          try {
            if (field === 'project_id') {
              const { error } = await supabase
                .from('categories')
                .delete()
                .eq('project_id', Number(value))
              
              if (error) {
                console.error('[ExpenseShare] Error deleting categories by project_id:', error)
                throw new Error(error.message)
              }
              
              return 1
            }
            return 0
          } catch (error: any) {
            console.error('[ExpenseShare] categories.where.equals.delete failed:', error)
            throw error
          }
        }
      })
    }),
  }
  
  settings = {
    get: async (key: string) => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .eq('key', key)
          .maybeSingle()
        
        if (error) {
          console.error('[ExpenseShare] Error getting setting:', error)
          return null
        }
        
        return data as Setting
      } catch (error) {
        console.error('[ExpenseShare] settings.get failed:', error)
        return null
      }
    },
    put: async (data: Setting) => {
      try {
        const payload = {
          ...data,
          updated_at: new Date().toISOString()
        }
        
        // Vérifier si le setting existe déjà
        const { data: existing } = await supabase
          .from('settings')
          .select('key')
          .eq('key', data.key)
          .maybeSingle()
        
        if (existing) {
          // Update
          const { error } = await supabase
            .from('settings')
            .update(payload)
            .eq('key', data.key)
          
          if (error) {
            console.error('[ExpenseShare] Error updating setting:', error)
            throw new Error(error.message)
          }
        } else {
          // Insert
          const { error } = await supabase
            .from('settings')
            .insert(payload)
          
          if (error) {
            console.error('[ExpenseShare] Error inserting setting:', error)
            throw new Error(error.message)
          }
        }
        
        return data.key
      } catch (error: any) {
        console.error('[ExpenseShare] settings.put failed:', error)
        throw error
      }
    }
  }
  
  notes = {
    add: async (data: Note) => {
      try {
        const payload = {
          ...data,
          transaction_id: Number(data.transaction_id),
          created_at: new Date().toISOString(),
        }

        const { data: inserted, error } = await supabase
          .from('notes')
          .insert(payload)
          .select('id')
          .single()

        if (error) {
          console.error('[ExpenseShare] Error adding note:', error)
          throw new Error(error.message)
        }

        return inserted?.id
      } catch (error: any) {
        console.error('[ExpenseShare] notes.add failed:', error)
        throw error
      }
    },
    where: (field: string) => ({
      equals: (value: any) => ({
        toArray: async () => {
          try {
            if (field === 'transaction_id') {
              const { data, error } = await supabase
                .from('notes')
                .select('*')
                .eq('transaction_id', Number(value))
                .order('created_at', { ascending: true })
              if (error) {
                console.error('[ExpenseShare] Error fetching notes by transaction_id:', error)
                return []
              }
              return (data || []) as Note[]
            }
            return []
          } catch (error) {
            console.error('[ExpenseShare] notes.where.equals.toArray failed:', error)
            return []
          }
        },
        delete: async () => {
          try {
            if (field === 'transaction_id') {
              const { error } = await supabase
                .from('notes')
                .delete()
                .eq('transaction_id', Number(value))
              if (error) {
                console.error('[ExpenseShare] Error deleting notes by transaction_id:', error)
                throw new Error(error.message)
              }
              return 1
            }
            return 0
          } catch (error: any) {
            console.error('[ExpenseShare] notes.where.equals.delete failed:', error)
            throw error
          }
        }
      })
    })
  }

  transactions = {
    add: async (data: Transaction) => {
      try {
        const payload = {
          ...data,
          user_id: String(data.user_id),
          project_id: Number(data.project_id),
          category_id: data.category_id ? Number(data.category_id) : null,
          created_at: new Date().toISOString()
        }
        
        const { data: inserted, error } = await supabase
          .from('transactions')
          .insert(payload)
          .select('id')
          .single()
        
        if (error) {
          console.error('[ExpenseShare] Error adding transaction:', error)
          throw new Error(error.message)
        }
        
        return inserted?.id
      } catch (error: any) {
        console.error('[ExpenseShare] transactions.add failed:', error)
        throw error
      }
    },
    where: (field: string) => ({
      equals: (value: any) => ({
        toArray: async () => {
          try {
            if (field === 'project_id') {
              const { data, error } = await supabase
                .from('transactions')
                .select('*')
                .eq('project_id', Number(value))
                .order('created_at', { ascending: false })
              
              if (error) {
                console.error('[ExpenseShare] Error fetching transactions by project_id:', error)
                return []
              }
              
              return (data || []) as Transaction[]
            }
            return []
          } catch (error) {
            console.error('[ExpenseShare] transactions.where.equals.toArray failed:', error)
            return []
          }
        },
        delete: async () => {
          try {
            if (field === 'project_id') {
              const { error } = await supabase
                .from('transactions')
                .delete()
                .eq('project_id', Number(value))
              
              if (error) {
                console.error('[ExpenseShare] Error deleting transactions by project_id:', error)
                throw new Error(error.message)
              }
              
              return 1
            }
            return 0
          } catch (error: any) {
            console.error('[ExpenseShare] transactions.where.equals.delete failed:', error)
            throw error
          }
        }
      })
    }),
  }
}

// Importer createClient pour le service role
import { createClient } from '@supabase/supabase-js'

// Exporter l'instance de la base de données
export const db = new SupabaseDatabase()
