"use client"

import { useState, useEffect, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, X, Loader2, Save, User as UserIcon } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"
import type { Category, ProjectUser, ProjectWithId, User as UserRecord } from "@/lib/types"

type UserWithId = Omit<UserRecord, "id"> & { id: string; is_admin?: boolean }
type ProjectMember = UserWithId & { role: string }

interface ProjectSettingsFormProps {
  onBack: () => void
  onSuccess: () => void
  projectId: number
  activeTab?: string
}

const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "Dollar US" },
  { code: "CFA", symbol: "CFA", name: "Franc CFA" },
]

const PROJECT_COLORS = [
  { name: "Bleu",   value: "#3b82f6" },
  { name: "Vert",   value: "#10b981" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Rose",   value: "#ec4899" },
  { name: "Orange", value: "#f59e0b" },
  { name: "Rouge",  value: "#ef4444" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Teal",   value: "#14b8a6" },
]

const PROJECT_ICONS = ["📁", "🏠", "🚗", "🛒", "🎯", "💼", "🎨", "🏖️", "🎓", "💡"]

const TABS = [
  { id: "general",    label: "Général" },
  { id: "categories", label: "Catégories" },
  { id: "users",      label: "Utilisateurs" },
  { id: "currency",   label: "Devise" },
]

export function ProjectSettingsForm({ onBack, onSuccess, projectId, activeTab = "general" }: ProjectSettingsFormProps) {
  const { toast } = useToast()
  const { db } = useDatabase()

  const [currentTab, setCurrentTab] = useState(activeTab)
  const [project, setProject]       = useState<ProjectWithId | null>(null)
  const [projectUsers, setProjectUsers] = useState<ProjectMember[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [allUsers, setAllUsers]     = useState<UserWithId[]>([])

  const [formData, setFormData] = useState({ name: "", description: "", icon: "📁", color: "#3b82f6", currency: "EUR" })
  const [eurToCfa, setEurToCfa] = useState("")
  const [eurToUsd, setEurToUsd] = useState("")

  const [newCategory, setNewCategory]   = useState("")
  const [newSubcategory, setNewSubcategory] = useState("")
  const [selectedCategoryForSub, setSelectedCategoryForSub] = useState<number | null>(null)

  const [newUserId, setNewUserId]   = useState<string | null>(null)
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [isRemovingUser, setIsRemovingUser] = useState<string | null>(null)

  const [error, setError]     = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  // ─── Chargement ────────────────────────────────────────────────────────────
  const loadProjectData = useCallback(async () => {
    if (!db) return
    setIsLoading(true)
    setEurToCfa("")
    setEurToUsd("")
    try {
      const projectData = await db.getProjectById(projectId)
      if (projectData && typeof projectData.id === "number") {
        setProject({ ...projectData, id: Number(projectData.id) })
        const dbCurrency = (projectData.currency as string) || "EUR"
        setFormData({
          name: projectData.name,
          description: projectData.description ?? "",
          icon: projectData.icon,
          color: projectData.color,
          currency: dbCurrency === "XOF" ? "CFA" : dbCurrency,
        })
      }

      const cats = await db.categories.where("project_id").equals(projectId).toArray()
      setCategories(Array.isArray(cats) ? cats.filter((c): c is Category => c != null && typeof c.name === "string") : [])

      const users = await db.users.toArray()
      setAllUsers(users.reduce<UserWithId[]>((acc, u) => {
        if (u && typeof u.id === "string") acc.push({ ...u, id: u.id })
        return acc
      }, []))

      const puRaw = await db.project_users.where("project_id").equals(projectId).toArray()
      const puRecords = Array.isArray(puRaw) ? puRaw.filter((r): r is ProjectUser => r != null && typeof r.role === "string") : []
      const members = await Promise.all(puRecords.map(async pu => {
        const u = await db.users.get(pu.user_id)
        if (!u || typeof u.id !== "string") return null
        return { ...u, id: u.id, role: pu.role } as ProjectMember
      }))
      setProjectUsers(members.filter((m): m is ProjectMember => m !== null))

      const cfa = await db.settings.get(`project:${projectId}:eur_to_cfa`)
      const usd = await db.settings.get(`project:${projectId}:eur_to_usd`)
      if (cfa?.value) setEurToCfa(String(cfa.value))
      if (usd?.value) setEurToUsd(String(usd.value))
    } catch {
      setError("Erreur lors du chargement")
    } finally {
      setIsLoading(false)
    }
  }, [db, projectId])

  useEffect(() => { if (db) void loadProjectData() }, [db, loadProjectData])

  // ─── Enregistrer le projet ─────────────────────────────────────────────────
  const handleSaveProject = async () => {
    if (!db) return
    if (!formData.name.trim()) { setError("Le nom du projet est obligatoire"); return }
    setIsLoading(true); setError("")
    try {
      const updated = await db.updateProject(projectId, {
        name: formData.name, description: formData.description,
        icon: formData.icon, color: formData.color, currency: formData.currency,
      })
      if (!updated) { setError("Erreur lors de la mise à jour"); return }
      if (eurToCfa) await db.settings.put({ key: `project:${projectId}:eur_to_cfa`, value: eurToCfa }).catch(() => {})
      if (eurToUsd) await db.settings.put({ key: `project:${projectId}:eur_to_usd`, value: eurToUsd }).catch(() => {})
      window.dispatchEvent(new CustomEvent("expenshare:project-currency-changed", { detail: { projectId, currency: formData.currency, eurToCfa, eurToUsd } }))
      window.dispatchEvent(new CustomEvent("expenshare:project-updated", { detail: { projectId } }))
      toast({ title: "Projet mis à jour", description: "Modifications enregistrées." })
      setSavedOk(true); setTimeout(() => setSavedOk(false), 2000)
      onSuccess()
    } catch { setError("Erreur lors de la mise à jour") }
    finally { setIsLoading(false) }
  }

  // ─── Catégories ───────────────────────────────────────────────────────────
  const addCategory = async () => {
    if (!newCategory.trim() || !db) return
    setIsLoading(true)
    try {
      await db.categories.add({ project_id: projectId, name: newCategory.trim(), level: 1, parent_id: undefined })
      setNewCategory(""); await loadProjectData()
    } catch { /* ignore */ } finally { setIsLoading(false) }
  }

  const addSubcategory = async () => {
    if (!newSubcategory.trim() || !selectedCategoryForSub || !db) return
    setIsLoading(true)
    try {
      await db.categories.add({ project_id: projectId, name: newSubcategory.trim(), level: 2, parent_id: selectedCategoryForSub })
      setNewSubcategory(""); await loadProjectData()
    } catch { /* ignore */ } finally { setIsLoading(false) }
  }

  // ─── Utilisateurs ─────────────────────────────────────────────────────────
  const addUserToProject = async () => {
    if (!db || !newUserId) return
    setIsAddingUser(true)
    try {
      if (projectUsers.some(u => u.id === newUserId)) { setError("Déjà dans le projet"); return }
      await db.project_users.add({ project_id: projectId, user_id: newUserId, role: "member", added_at: new Date().toISOString() })
      await loadProjectData(); setNewUserId(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur d'ajout"
      setError(msg)
      toast({ title: "Échec", description: msg, variant: "destructive" })
    } finally { setIsAddingUser(false) }
  }

  const removeUserFromProject = async (userId: string | number) => {
    if (!db) return
    setIsRemovingUser(String(userId))
    try {
      await db.project_users.remove(projectId, userId)
      await loadProjectData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur de suppression"
      setError(msg)
      toast({ title: "Échec", description: msg, variant: "destructive" })
    } finally { setIsRemovingUser(null) }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-0">

      {/* Onglets underline */}
      <div className="border-b border-border mb-6">
        <div className="flex overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`flex-shrink-0 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                currentTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
          <span className="text-red-500 text-sm flex-1">{error}</span>
          <button onClick={() => setError("")}><X className="h-4 w-4 text-red-400" /></button>
        </div>
      )}

      {isLoading && !project ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-5">

          {/* ── Général ── */}
          {currentTab === "general" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nom du projet</Label>
                <Input id="name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description (optionnel)</Label>
                <Textarea id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Icône</Label>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_ICONS.map(icon => (
                    <button key={icon} type="button" onClick={() => setFormData({ ...formData, icon })}
                      className={`text-2xl p-2 rounded-xl transition-all ${formData.icon === icon ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-muted"}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Couleur</Label>
                <div className="flex flex-wrap gap-2.5">
                  {PROJECT_COLORS.map(c => (
                    <button key={c.value} type="button" onClick={() => setFormData({ ...formData, color: c.value })}
                      aria-label={c.name}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${formData.color === c.value ? "border-foreground ring-2 ring-offset-1 ring-primary" : "border-transparent hover:scale-110"}`}
                      style={{ backgroundColor: c.value }} />
                  ))}
                </div>
              </div>
              <button
                onClick={handleSaveProject} disabled={isLoading}
                className={`w-full h-11 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                  savedOk ? "bg-green-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : savedOk ? "✓ Enregistré" : <><Save className="h-4 w-4" /> Enregistrer</>}
              </button>
            </div>
          )}

          {/* ── Devise ── */}
          {currentTab === "currency" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Devise du projet</Label>
                <Select value={formData.currency} onValueChange={v => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} – {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>1 € = (CFA)</Label>
                  <Input type="number" min="0" step="0.01" placeholder="655.957" value={eurToCfa} onChange={e => setEurToCfa(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>1 € = (USD)</Label>
                  <Input type="number" min="0" step="0.01" placeholder="1.08" value={eurToUsd} onChange={e => setEurToUsd(e.target.value)} />
                </div>
              </div>
              <button
                onClick={handleSaveProject} disabled={isLoading}
                className={`w-full h-11 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                  savedOk ? "bg-green-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : savedOk ? "✓ Enregistré" : <><Save className="h-4 w-4" /> Enregistrer</>}
              </button>
            </div>
          )}

          {/* ── Catégories ── */}
          {currentTab === "categories" && (
            <div className="space-y-6">
              {/* Ajouter catégorie */}
              <div className="space-y-1.5">
                <Label>Nouvelle catégorie</Label>
                <div className="flex gap-2">
                  <Input placeholder="Nom…" value={newCategory} onChange={e => setNewCategory(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void addCategory() } }} />
                  <button onClick={() => void addCategory()} disabled={isLoading || !newCategory.trim()}
                    className="px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0">
                    <Plus className="h-4 w-4" /> Ajouter
                  </button>
                </div>
              </div>

              {/* Ajouter sous-catégorie */}
              <div className="space-y-1.5">
                <Label>Nouvelle sous-catégorie</Label>
                <div className="flex gap-2">
                  <Select value={selectedCategoryForSub?.toString() ?? ""} onValueChange={v => setSelectedCategoryForSub(Number(v))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Catégorie parente" /></SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c.level === 1).map(c => (
                        <SelectItem key={c.id} value={c.id!.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input className="flex-1" placeholder="Nom…" value={newSubcategory} onChange={e => setNewSubcategory(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void addSubcategory() } }} />
                  <button onClick={() => void addSubcategory()} disabled={isLoading || !newSubcategory.trim() || !selectedCategoryForSub}
                    className="px-3 h-10 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-40 flex items-center flex-shrink-0">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Liste */}
              <div className="space-y-2">
                <Label>Catégories existantes</Label>
                {categories.filter(c => c.level === 1).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Aucune catégorie pour ce projet</p>
                ) : (
                  <div className="space-y-2">
                    {categories.filter(c => c.level === 1).map(parent => (
                      <div key={parent.id} className="border border-border rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-muted/40 font-medium text-sm">{parent.name}</div>
                        {categories.filter(c => c.parent_id === parent.id).map(sub => (
                          <div key={sub.id} className="flex items-center gap-2 px-4 py-2 border-t border-border/50">
                            <span className="text-muted-foreground">└</span>
                            <span className="text-sm flex-1">{sub.name}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Utilisateurs ── */}
          {currentTab === "users" && (
            <div className="space-y-6">
              {/* Ajouter un utilisateur */}
              <div className="space-y-1.5">
                <Label>Ajouter un membre</Label>
                <div className="flex gap-2">
                  <Select value={newUserId ?? ""} onValueChange={v => {
                    if (!projectUsers.some(pu => pu.id === v)) setNewUserId(v)
                  }}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Sélectionner un utilisateur" /></SelectTrigger>
                    <SelectContent>
                      {allUsers.filter(u => !projectUsers.some(pu => pu.id === u.id)).map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button onClick={addUserToProject} disabled={!newUserId || isAddingUser}
                    className="px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0">
                    {isAddingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Ajouter</>}
                  </button>
                </div>
              </div>

              {/* Liste membres */}
              <div className="space-y-1.5">
                <Label>Membres actuels</Label>
                {projectUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center bg-muted/30 rounded-xl">Aucun membre</p>
                ) : (
                  <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                    {projectUsers.map(user => (
                      <div key={user.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <UserIcon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                        </div>
                        {user.role !== "owner" && (
                          <button
                            onClick={() => {
                              if (user.role === "owner") {
                                toast({ title: "Propriétaire non retirable", variant: "destructive" }); return
                              }
                              void removeUserFromProject(user.id)
                            }}
                            disabled={isRemovingUser === user.id}
                            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
                          >
                            {isRemovingUser === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
