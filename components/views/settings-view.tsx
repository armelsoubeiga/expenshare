"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Trash2, Plus, Star, StarOff, Pencil, Check, X, Layers } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"
import type { TursoDatabaseInstance } from "@/lib/database-turso"
import type { CurrencyCode, ProjectWithId, User } from "@/lib/types"
import { SUPPORTED_CURRENCIES } from "@/lib/types"
import { CURRENCY_LABELS, normalizeCurrencyCode } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

// ── Types ──────────────────────────────────────────────────────────────────

interface SettingsViewProps {
  onBack: () => void
}

type ActiveTab = "currency" | "projects" | "views"
type ProjectOwner = Pick<User, "id" | "name">
type ProjectListItem = ProjectWithId & { owner?: ProjectOwner | null }

export type ProjectView = {
  id: string
  name: string
  emoji: string
  projectIds: number[]
  isDefault: boolean
}

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "currency", label: "Devise" },
  { id: "projects", label: "Mes projets" },
  { id: "views", label: "Vues" },
]

const VIEW_EMOJIS = ["📊", "🏗️", "🏡", "💼", "🌿", "🎯", "🔧", "📦", "🚀", "💰"]
const MAX_VIEWS = 5

// ── Helpers ────────────────────────────────────────────────────────────────

function genId() {
  return `view_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ── Main component ─────────────────────────────────────────────────────────

export function SettingsView({ onBack }: SettingsViewProps) {
  const { db, isReady } = useDatabase()
  const database = db as TursoDatabaseInstance | null

  const [activeTab, setActiveTab] = useState<ActiveTab>("currency")
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState("")
  const [isDeleting, setIsDeleting] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const [currency, setCurrency] = useState<CurrencyCode>("EUR")
  const [eurToCfa, setEurToCfa] = useState("")
  const [eurToUsd, setEurToUsd] = useState("")
  const [savingCurrency, setSavingCurrency] = useState(false)
  const [savedCurrency, setSavedCurrency] = useState(false)

  // Views state
  const [views, setViews] = useState<ProjectView[]>([])
  const [viewsLoading, setViewsLoading] = useState(false)
  const [showCreateView, setShowCreateView] = useState(false)
  const [editingViewId, setEditingViewId] = useState<string | null>(null)

  // Form state for create/edit view
  const [formName, setFormName] = useState("")
  const [formEmoji, setFormEmoji] = useState("📊")
  const [formProjectIds, setFormProjectIds] = useState<number[]>([])
  const [formIsDefault, setFormIsDefault] = useState(false)
  const [formError, setFormError] = useState("")
  const [savingView, setSavingView] = useState(false)

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadUserData = useCallback(async () => {
    setIsLoading(true)
    if (!database) { setError("Base de données non disponible"); setIsLoading(false); return }
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("expenshare_user") : null
      if (!stored) { setError("Utilisateur non connecté"); setIsLoading(false); return }
      const parsed = JSON.parse(stored)
      const parsedId = parsed?.id
      if (typeof parsedId !== "string" && typeof parsedId !== "number") { setError("Identifiant introuvable"); setIsLoading(false); return }
      const uid = String(parsedId)
      setUserId(uid)

      const userIsAdmin = await database.isAdmin(uid)
      setIsAdmin(userIsAdmin)

      let fetchedProjects: ProjectListItem[] = []
      if (userIsAdmin) {
        const all = await database.projects.toArray()
        const users = await database.users.toArray()
        const ownerMap = new Map(users.map(u => [String(u.id), u]))
        fetchedProjects = all
          .filter((p): p is ProjectWithId => p?.id != null)
          .map(p => ({ ...p, id: Number(p.id), owner: ownerMap.get(String(p.created_by)) ?? null }))
      } else {
        const own = await database.projects.where("created_by").equals(uid).toArray()
        const memberships = await database.project_users.where("user_id").equals(uid).toArray()
        const memberProjectIds = new Set(memberships.map(m => Number(m.project_id)))
        const allAccessible = await Promise.all(
          [...memberProjectIds].map(pid => database.projects.where("id").equals(pid).toArray())
        )
        const memberProjects = allAccessible.flat().filter((p): p is ProjectWithId => p?.id != null && !own.find(o => o.id === p.id))
        fetchedProjects = [...own, ...memberProjects]
          .filter((p): p is ProjectWithId => p?.id != null)
          .map(p => ({ ...p, id: Number(p.id), owner: null }))
      }
      setProjects(fetchedProjects)

      const [cur, cfa, usd] = await Promise.all([
        database.settings.get(`user:${uid}:currency`),
        database.settings.get(`user:${uid}:eur_to_cfa`),
        database.settings.get(`user:${uid}:eur_to_usd`),
      ])
      const norm = normalizeCurrencyCode(cur?.value)
      if (norm) setCurrency(norm)
      if (typeof cfa?.value === "string") setEurToCfa(cfa.value)
      if (typeof usd?.value === "string") setEurToUsd(usd.value)
      setError("")
    } catch {
      setError("Erreur lors du chargement")
    } finally {
      setIsLoading(false)
    }
  }, [database])

  const loadViews = useCallback(async () => {
    if (!database || !userId) return
    setViewsLoading(true)
    try {
      const saved = await database.settings.get(`user:${userId}:project_views`)
      if (saved?.value) {
        try { setViews(JSON.parse(saved.value) as ProjectView[]) } catch { setViews([]) }
      } else {
        setViews([])
      }
    } catch { setViews([]) }
    finally { setViewsLoading(false) }
  }, [database, userId])

  useEffect(() => {
    if (isReady && database) void loadUserData()
  }, [isReady, database, loadUserData])

  useEffect(() => {
    if (activeTab === "views" && userId) void loadViews()
  }, [activeTab, userId, loadViews])

  // ── Currency save ─────────────────────────────────────────────────────────

  const saveCurrencySettings = useCallback(async () => {
    if (!database || !userId) return
    setSavingCurrency(true)
    try {
      await database.settings.put({ key: `user:${userId}:currency`, value: currency })
      if (eurToCfa.trim()) await database.settings.put({ key: `user:${userId}:eur_to_cfa`, value: eurToCfa.trim() })
      if (eurToUsd.trim()) await database.settings.put({ key: `user:${userId}:eur_to_usd`, value: eurToUsd.trim() })
      window.dispatchEvent(new CustomEvent("expenshare:currency-changed", {
        detail: { currency, eurToCfa: eurToCfa.trim(), eurToUsd: eurToUsd.trim(), userId },
      }))
      setSavedCurrency(true)
      setTimeout(() => setSavedCurrency(false), 2000)
    } catch {
      setError("Erreur lors de l'enregistrement")
    } finally {
      setSavingCurrency(false)
    }
  }, [currency, database, eurToCfa, eurToUsd, userId])

  // ── Project delete ────────────────────────────────────────────────────────

  const handleDeleteProject = useCallback(async (projectId: number) => {
    if (!database || !userId) return
    setIsDeleting(projectId)
    try {
      await database.transactions.where("project_id").equals(projectId).delete()
      await database.categories.where("project_id").equals(projectId).delete()
      await database.project_users.where("project_id").equals(projectId).delete()
      await database.projects.where("id").equals(projectId).delete()
      setProjects(prev => prev.filter(p => p.id !== projectId))
      // Remove from views too
      const updatedViews = views.map(v => ({ ...v, projectIds: v.projectIds.filter(id => id !== projectId) }))
      setViews(updatedViews)
      if (userId) await database.settings.put({ key: `user:${userId}:project_views`, value: JSON.stringify(updatedViews) })
      setConfirmDelete(null)
      window.dispatchEvent(new CustomEvent("expenshare:project-updated"))
    } catch {
      setError("Erreur lors de la suppression")
    } finally {
      setIsDeleting(null)
    }
  }, [database, userId, views])

  // ── Views CRUD ────────────────────────────────────────────────────────────

  const persistViews = async (newViews: ProjectView[]) => {
    if (!database || !userId) return
    await database.settings.put({ key: `user:${userId}:project_views`, value: JSON.stringify(newViews) })
    setViews(newViews)
    window.dispatchEvent(new CustomEvent("expenshare:views-updated"))
  }

  const openCreateForm = () => {
    setFormName("")
    setFormEmoji("📊")
    setFormProjectIds([])
    setFormIsDefault(false)
    setFormError("")
    setEditingViewId(null)
    setShowCreateView(true)
  }

  const openEditForm = (view: ProjectView) => {
    setFormName(view.name)
    setFormEmoji(view.emoji)
    setFormProjectIds([...view.projectIds])
    setFormIsDefault(view.isDefault)
    setFormError("")
    setEditingViewId(view.id)
    setShowCreateView(true)
  }

  const cancelForm = () => {
    setShowCreateView(false)
    setEditingViewId(null)
  }

  const saveView = async () => {
    setFormError("")
    if (!formName.trim()) { setFormError("Le nom est requis"); return }
    if (formProjectIds.length === 0) { setFormError("Sélectionnez au moins un projet"); return }
    if (!editingViewId && views.length >= MAX_VIEWS) { setFormError(`Maximum ${MAX_VIEWS} vues autorisées`); return }

    setSavingView(true)
    try {
      let newViews: ProjectView[]
      // If this view is set as default, unset others
      const ensureOneDefault = (vs: ProjectView[], thisId: string) =>
        vs.map(v => ({ ...v, isDefault: v.id === thisId ? formIsDefault : formIsDefault ? false : v.isDefault }))

      if (editingViewId) {
        newViews = views.map(v => v.id === editingViewId
          ? { ...v, name: formName.trim(), emoji: formEmoji, projectIds: formProjectIds, isDefault: formIsDefault }
          : { ...v, isDefault: formIsDefault ? false : v.isDefault }
        )
      } else {
        const newView: ProjectView = { id: genId(), name: formName.trim(), emoji: formEmoji, projectIds: formProjectIds, isDefault: formIsDefault }
        newViews = formIsDefault
          ? [...views.map(v => ({ ...v, isDefault: false })), newView]
          : [...views, newView]
        void ensureOneDefault // already handled inline
      }
      await persistViews(newViews)
      setShowCreateView(false)
      setEditingViewId(null)
    } catch {
      setFormError("Erreur lors de la sauvegarde")
    } finally {
      setSavingView(false)
    }
  }

  const deleteView = async (viewId: string) => {
    const newViews = views.filter(v => v.id !== viewId)
    await persistViews(newViews)
  }

  const toggleDefault = async (viewId: string) => {
    const target = views.find(v => v.id === viewId)
    if (!target) return
    const newDefault = !target.isDefault
    const newViews = views.map(v => ({ ...v, isDefault: v.id === viewId ? newDefault : newDefault ? false : v.isDefault }))
    await persistViews(newViews)
  }

  const toggleFormProject = (pid: number) => {
    setFormProjectIds(prev => prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid])
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* Onglets */}
      <div className="border-b border-border mb-6">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.id === "projects"
                ? `Mes projets${!isLoading ? ` (${projects.length})` : ""}`
                : tab.id === "views"
                ? `Vues${views.length > 0 ? ` (${views.length})` : ""}`
                : tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-xl px-3 py-2">{error}</p>
      )}

      {/* ── Onglet Devise ── */}
      {activeTab === "currency" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Devise principale</label>
            <div className="flex gap-2">
              {SUPPORTED_CURRENCIES.map(code => (
                <button
                  key={code}
                  onClick={() => setCurrency(code)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    currency === code
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {CURRENCY_LABELS[code]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">1 € = (CFA)</label>
              <input
                type="number" inputMode="decimal" placeholder="655.957"
                value={eurToCfa} onChange={e => setEurToCfa(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">1 € = (USD)</label>
              <input
                type="number" inputMode="decimal" placeholder="1.08"
                value={eurToUsd} onChange={e => setEurToUsd(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm"
              />
            </div>
          </div>

          <button
            onClick={saveCurrencySettings}
            disabled={savingCurrency}
            className={`w-full h-11 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
              savedCurrency ? "bg-green-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            }`}
          >
            {savingCurrency ? <Loader2 className="h-4 w-4 animate-spin" /> : savedCurrency ? "✓ Enregistré" : "Enregistrer"}
          </button>
        </div>
      )}

      {/* ── Onglet Mes projets ── */}
      {activeTab === "projects" && (
        isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground bg-card border border-border rounded-2xl">
            Aucun projet
          </div>
        ) : (
          <div className="space-y-2.5">
            {projects.map(project => {
              const ownedByMe = String(project.created_by) === userId
              return (
                <div key={project.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 p-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                      style={{ backgroundColor: `${project.color}22` }}
                    >
                      {project.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {isAdmin && (project as { owner?: { name?: string } }).owner?.name
                          ? `Par ${(project as { owner?: { name?: string } }).owner!.name}`
                          : ownedByMe ? "Créé par vous" : "Membre"}
                      </p>
                    </div>
                    {ownedByMe && (
                      <button
                        disabled={!ownedByMe || isDeleting === project.id}
                        onClick={() => ownedByMe && setConfirmDelete(project.id)}
                        title="Supprimer ce projet"
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {isDeleting === project.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  {confirmDelete === project.id && (
                    <div className="px-4 pb-4 border-t border-border pt-3 bg-red-50/50 dark:bg-red-950/10">
                      <p className="text-sm text-red-600 font-medium mb-2">Supprimer ce projet ? Toutes ses transactions seront perdues.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="flex-1 h-9 border border-border rounded-xl text-sm hover:bg-muted transition-colors"
                        >Annuler</button>
                        <button
                          onClick={() => handleDeleteProject(project.id)}
                          disabled={isDeleting === project.id}
                          className="flex-1 h-9 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {isDeleting === project.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Trash2 className="h-3.5 w-3.5" /> Confirmer</>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── Onglet Vues ── */}
      {activeTab === "views" && (
        <div className="space-y-4">

          {/* Explainer */}
          <div className="bg-muted/40 border border-border rounded-2xl p-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Layers className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
              <p>Créez des <strong className="text-foreground">groupes de projets</strong> pour voir les statistiques d&apos;un sous-ensemble depuis l&apos;accueil. La vue par défaut s&apos;affiche automatiquement à la connexion. Maximum {MAX_VIEWS} vues.</p>
            </div>
          </div>

          {viewsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Liste des vues */}
              {views.length > 0 && (
                <div className="space-y-2">
                  {views.map(view => (
                    <div key={view.id} className={`bg-card border rounded-2xl overflow-hidden transition-all ${editingViewId === view.id ? 'border-primary ring-1 ring-primary/20' : 'border-border'}`}>
                      {editingViewId !== view.id ? (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <span className="text-xl">{view.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{view.name}</span>
                              {view.isDefault && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-medium">
                                  <Star className="w-3 h-3" /> Défaut
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {view.projectIds.length} projet{view.projectIds.length > 1 ? 's' : ''} · {
                                view.projectIds.map(id => projects.find(p => p.id === id)?.name ?? `#${id}`).join(', ')
                              }
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => toggleDefault(view.id)}
                              title={view.isDefault ? "Retirer comme vue par défaut" : "Définir comme vue par défaut"}
                              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${view.isDefault ? 'text-amber-500 hover:text-amber-400' : 'text-muted-foreground hover:text-amber-500'}`}
                            >
                              {view.isDefault ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => openEditForm(view)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteView(view.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {views.length === 0 && !showCreateView && (
                <div className="text-center py-10 bg-card border border-dashed border-border rounded-2xl">
                  <Layers className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Aucune vue créée</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Créez votre première vue pour filtrer l&apos;accueil</p>
                </div>
              )}

              {/* Form create/edit */}
              {showCreateView && (
                <div className="bg-card border border-primary/30 ring-1 ring-primary/20 rounded-2xl p-4 space-y-4">
                  <h3 className="font-semibold text-sm">{editingViewId ? "Modifier la vue" : "Nouvelle vue"}</h3>

                  {formError && (
                    <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">{formError}</p>
                  )}

                  {/* Nom */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nom de la vue</label>
                    <input
                      type="text"
                      placeholder="Ex : Chantier principal, Bureau…"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      maxLength={30}
                      autoFocus
                      className="w-full h-11 px-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm"
                    />
                  </div>

                  {/* Emoji */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Icône</label>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-muted/40 rounded-xl">
                      {VIEW_EMOJIS.map(e => (
                        <button
                          key={e}
                          onClick={() => setFormEmoji(e)}
                          className={`text-lg w-9 h-9 flex items-center justify-center rounded-lg transition-all ${formEmoji === e ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted'}`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Project picker */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Projets à inclure</p>
                    {isLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement...
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-auto pr-1">
                        {projects.map(p => (
                          <label key={p.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors border ${
                            formProjectIds.includes(p.id) ? 'bg-primary/5 border-primary/30' : 'border-border hover:bg-muted/40'
                          }`}>
                            <input
                              type="checkbox"
                              checked={formProjectIds.includes(p.id)}
                              onChange={() => toggleFormProject(p.id)}
                              className="accent-primary"
                            />
                            <span className="text-base">{p.icon}</span>
                            <span className="text-sm truncate flex-1">{p.name}</span>
                          </label>
                        ))}
                        {projects.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2">Aucun projet disponible</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Default toggle */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setFormIsDefault(v => !v)}
                      className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${formIsDefault ? 'bg-amber-400' : 'bg-muted-foreground/30'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${formIsDefault ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className="text-sm">Vue par défaut à l&apos;accueil</span>
                  </label>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={cancelForm}
                      className="flex-1 h-10 border border-border rounded-xl text-sm hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
                    >
                      <X className="w-4 h-4" /> Annuler
                    </button>
                    <button
                      onClick={saveView}
                      disabled={savingView}
                      className="flex-1 h-10 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {savingView ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Enregistrer</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Add button */}
              {!showCreateView && views.length < MAX_VIEWS && (
                <button
                  onClick={openCreateForm}
                  className="w-full h-11 border-2 border-dashed border-border rounded-2xl text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Créer une vue{views.length > 0 ? ` (${views.length}/${MAX_VIEWS})` : ""}
                </button>
              )}
              {!showCreateView && views.length >= MAX_VIEWS && (
                <p className="text-xs text-center text-muted-foreground">Maximum {MAX_VIEWS} vues atteint</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
