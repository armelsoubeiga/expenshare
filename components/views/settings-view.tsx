"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"
import type { TursoDatabaseInstance } from "@/lib/database-turso"
import type { CurrencyCode, ProjectWithId, User } from "@/lib/types"
import { SUPPORTED_CURRENCIES } from "@/lib/types"
import { CURRENCY_LABELS, normalizeCurrencyCode } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface SettingsViewProps {
  onBack: () => void
}

type ActiveTab = "currency" | "projects"
type ProjectOwner = Pick<User, "id" | "name">
type ProjectListItem = ProjectWithId & { owner?: ProjectOwner | null }

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "currency", label: "Devise" },
  { id: "projects", label: "Projets" },
]

export function SettingsView({ onBack }: SettingsViewProps) {
  const { db, isReady } = useDatabase()
  const database = db as TursoDatabaseInstance | null

  const [activeTab, setActiveTab] = useState<ActiveTab>("currency")
  const [projects, setProjects]   = useState<ProjectListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userId, setUserId]       = useState<string | null>(null)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [error, setError]         = useState("")
  const [isDeleting, setIsDeleting]     = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const [currency, setCurrency]       = useState<CurrencyCode>("EUR")
  const [eurToCfa, setEurToCfa]       = useState("")
  const [eurToUsd, setEurToUsd]       = useState("")
  const [savingCurrency, setSavingCurrency] = useState(false)
  const [savedCurrency, setSavedCurrency]   = useState(false)

  // ─── Chargement ────────────────────────────────────────────────────────────
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
        fetchedProjects = own
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

  useEffect(() => {
    if (isReady && database) void loadUserData()
  }, [isReady, database, loadUserData])

  // ─── Sauvegarde devise ──────────────────────────────────────────────────────
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

  // ─── Suppression projet ────────────────────────────────────────────────────
  const handleDeleteProject = useCallback(async (projectId: number) => {
    if (!database || !userId) return
    setIsDeleting(projectId)
    try {
      await database.transactions.where("project_id").equals(projectId).delete()
      await database.categories.where("project_id").equals(projectId).delete()
      await database.project_users.where("project_id").equals(projectId).delete()
      await database.projects.where("id").equals(projectId).delete()
      setProjects(prev => prev.filter(p => p.id !== projectId))
      setConfirmDelete(null)
      window.dispatchEvent(new CustomEvent("expenshare:project-updated"))
    } catch {
      setError("Erreur lors de la suppression")
    } finally {
      setIsDeleting(null)
    }
  }, [database, userId])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* Onglets underline */}
      <div className="border-b border-border mb-6">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.id === "projects"
                ? `${isAdmin ? "Tous les projets" : "Mes projets"}${!isLoading ? ` (${projects.length})` : ""}`
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
            {savingCurrency
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : savedCurrency ? "✓ Enregistré" : "Enregistrer"}
          </button>
        </div>
      )}

      {/* ── Onglet Projets ── */}
      {activeTab === "projects" && (
        isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground bg-card border border-border rounded-2xl">
            Aucun projet
          </div>
        ) : (
          <div className="space-y-2.5">
            {projects.map(project => (
              <div key={project.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ backgroundColor: `${project.color}20` }}
                  >
                    {project.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{project.name}</p>
                    {isAdmin && (project as any).owner?.name && (
                      <p className="text-xs text-muted-foreground">par {(project as any).owner.name}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">Proprio</Badge>
                </div>

                {confirmDelete === project.id ? (
                  <div className="px-4 pb-4 space-y-2">
                    <p className="text-sm text-red-600 font-medium">Supprimer ce projet ? Action irréversible.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="flex-1 h-9 border border-border rounded-xl text-sm hover:bg-muted transition-colors"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        disabled={isDeleting === project.id}
                        className="flex-1 h-9 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {isDeleting === project.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <><Trash2 className="h-3.5 w-3.5" /> Confirmer</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-border">
                    <button
                      onClick={() => setConfirmDelete(project.id)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer ce projet
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
