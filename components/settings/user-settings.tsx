"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Loader2, Trash2, ArrowLeft } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"
import type { SupabaseDatabaseInstance } from "@/lib/database-supabase"
import type { CurrencyCode, ProjectWithId, User } from "@/lib/types"
import { SUPPORTED_CURRENCIES } from "@/lib/types"
import { CURRENCY_LABELS, normalizeCurrencyCode } from "@/lib/utils"

interface UserSettingsProps {
  isOpen: boolean
  onClose: () => void
}

type ProjectOwner = Pick<User, "id" | "name">

type ProjectListItem = ProjectWithId & {
  owner?: ProjectOwner | null
}

export function UserSettings({ isOpen, onClose }: UserSettingsProps) {
  const { db, isReady } = useDatabase()
  const database = db as SupabaseDatabaseInstance | null
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState("")
  const [isDeleting, setIsDeleting] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  // Nouveaux états: devise utilisateur et taux de conversion
  const [currency, setCurrency] = useState<CurrencyCode>("EUR")
  const [eurToCfa, setEurToCfa] = useState<string>("")
  const [eurToUsd, setEurToUsd] = useState<string>("")
  const [savingCurrency, setSavingCurrency] = useState(false)

  const loadUserData = useCallback(async () => {
    setIsLoading(true)

    if (!database) {
      setError("La base de données n'est pas disponible")
      setIsLoading(false)
      return
    }

    try {
      const storedUserRaw =
        typeof window !== "undefined" ? localStorage.getItem("expenshare_user") : null

      if (!storedUserRaw) {
        setError("Utilisateur non connecté")
        setIsLoading(false)
        return
      }

      let parsedUser: unknown
      try {
        parsedUser = JSON.parse(storedUserRaw)
      } catch {
        setError("Données utilisateur invalides")
        setIsLoading(false)
        return
      }

      const parsedId = (parsedUser as { id?: unknown })?.id
      if (typeof parsedId !== "string" && typeof parsedId !== "number") {
        setError("Identifiant utilisateur introuvable")
        setIsLoading(false)
        return
      }

      const normalizedUserId = String(parsedId)
      setUserId(normalizedUserId)

      const adminIdentifier = await database.getAdminUserId()
      const isUserAdmin = Boolean(adminIdentifier && normalizedUserId === adminIdentifier)
      setIsAdmin(isUserAdmin)

      let fetchedProjects: ProjectListItem[] = []

      if (isUserAdmin) {
        const allProjects = await database.projects.toArray()
        const projectsWithOwner = allProjects
          .filter((project): project is ProjectWithId => project?.id != null)
          .map<ProjectListItem>((project) => ({
            ...project,
            id: Number(project.id),
            owner: null,
          }))

        try {
          const users = await database.users.toArray()
          const ownerEntries = users
            .map((user) => {
              if (typeof user?.id !== "string" || typeof user?.name !== "string" || user.name.length === 0) {
                return null
              }

              return [String(user.id), { id: String(user.id), name: user.name } as ProjectOwner]
            })
            .filter((entry): entry is [string, ProjectOwner] => entry !== null)

          const ownerMap = new Map<string, ProjectOwner>(ownerEntries)

          fetchedProjects = projectsWithOwner.map((project) => ({
            ...project,
            owner: ownerMap.get(String(project.created_by)) ?? null,
          }))
        } catch (ownerError) {
          console.error("[UserSettings] Unable to load project owners:", ownerError)
          fetchedProjects = projectsWithOwner
        }
      } else {
        const ownProjects = await database.projects
          .where("created_by")
          .equals(normalizedUserId)
          .toArray()

        fetchedProjects = ownProjects
          .filter((project): project is ProjectWithId => project?.id != null)
          .map<ProjectListItem>((project) => ({
            ...project,
            id: Number(project.id),
            owner: null,
          }))
      }

      setProjects(fetchedProjects)

      try {
        const userCurrency = await database.settings.get(`user:${normalizedUserId}:currency`)
        const cfaRate = await database.settings.get(`user:${normalizedUserId}:eur_to_cfa`)
        const usdRate = await database.settings.get(`user:${normalizedUserId}:eur_to_usd`)

  const normalizedCurrency = normalizeCurrencyCode(userCurrency?.value)
        if (normalizedCurrency) {
          setCurrency(normalizedCurrency)
        }

        setEurToCfa(typeof cfaRate?.value === "string" ? cfaRate.value : "")
        setEurToUsd(typeof usdRate?.value === "string" ? usdRate.value : "")
      } catch (settingsError) {
        console.error("[UserSettings] Failed to load currency settings:", settingsError)
      }

      setError("")
    } catch (error) {
      console.error("[UserSettings] Erreur lors du chargement des données utilisateur:", error)
      setError("Erreur lors du chargement des projets")
    } finally {
      setIsLoading(false)
    }
  }, [database])

  useEffect(() => {
    if (!isOpen || !isReady || !database) {
      return
    }

    void loadUserData()
  }, [isOpen, isReady, database, loadUserData])

  const saveCurrencySettings = useCallback(async () => {
    if (!database || !userId) {
      setError("La base de données n'est pas disponible")
      return
    }

    setSavingCurrency(true)
    try {
      await database.settings.put({ key: `user:${userId}:currency`, value: currency })

      if (eurToCfa.trim()) {
        await database.settings.put({ key: `user:${userId}:eur_to_cfa`, value: eurToCfa.trim() })
      }

      if (eurToUsd.trim()) {
        await database.settings.put({ key: `user:${userId}:eur_to_usd`, value: eurToUsd.trim() })
      }

      try {
        const detail = {
          currency,
          eurToCfa: eurToCfa.trim(),
          eurToUsd: eurToUsd.trim(),
          userId,
          updatedAt: Date.now(),
        }
        window.dispatchEvent(new CustomEvent("expenshare:currency-changed", { detail }))
      } catch {
        // ignore dispatch errors
      }
    } catch (error: unknown) {
      console.error("[UserSettings] Failed to save currency settings:", error)
      setError("Erreur lors de l'enregistrement des paramètres de devise")
    } finally {
      setSavingCurrency(false)
    }
  }, [currency, database, eurToCfa, eurToUsd, userId])

  const handleCurrencyChange = useCallback((value: string) => {
    const normalized = normalizeCurrencyCode(value)
    if (normalized) {
      setCurrency(normalized)
    }
  }, [])

  const handleDeleteProject = useCallback(
    async (projectId: number) => {
      if (!database || !userId) {
        setError("La base de données ou l'utilisateur n'est pas disponible")
        return
      }

      setIsDeleting(projectId)
      try {
        await database.transactions.where("project_id").equals(projectId).delete()
        await database.categories.where("project_id").equals(projectId).delete()
        await database.project_users.where("project_id").equals(projectId).delete()
        await database.projects.where("id").equals(projectId).delete()

        setProjects((prev) => prev.filter((project) => project.id !== projectId))
        setConfirmDelete(null)
      } catch (error: unknown) {
        console.error("Erreur lors de la suppression du projet:", error)
        setError("Erreur lors de la suppression du projet")
      } finally {
        setIsDeleting(null)
      }
    },
    [database, userId],
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Paramètres utilisateur
          </DialogTitle>
          <DialogDescription>
            Gérez vos projets et paramètres personnels
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Paramètres devise utilisateur */}
          <div>
            <h3 className="text-lg font-medium">Devise d’affichage</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Choisissez votre devise et définissez les taux de conversion (1 € = …)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="text-sm font-medium">Devise</label>
                <select
                  className="mt-1 w-full border rounded-md bg-transparent px-3 py-2"
                  value={currency}
                  onChange={(event) => handleCurrencyChange(event.target.value)}
                >
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {CURRENCY_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">1 € = (CFA)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full border rounded-md bg-transparent px-3 py-2"
                  placeholder="Ex: 655.957"
                  value={eurToCfa}
                  onChange={(e) => setEurToCfa(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">1 € = (USD)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full border rounded-md bg-transparent px-3 py-2"
                  placeholder="Ex: 1.08"
                  value={eurToUsd}
                  onChange={(e) => setEurToUsd(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <Button onClick={saveCurrencySettings} disabled={savingCurrency}>
                {savingCurrency ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium">{isAdmin ? "Tous les projets" : "Mes projets"}</h3>
            <p className="text-sm text-muted-foreground mb-2">
              {isAdmin
                ? "Liste de tous les projets de tous les utilisateurs. Vous pouvez supprimer n’importe quel projet."
                : "Liste des projets que vous avez créés. Vous pouvez supprimer les projets dont vous êtes propriétaire."}
            </p>

            {isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {projects.length === 0 ? (
                  <div className="text-center p-4 border rounded-lg text-muted-foreground">
                    {isAdmin
                      ? "Aucun projet n’a encore été créé."
                      : "Vous n’avez pas encore créé de projets."}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projects.map((project) => (
                      <Card key={project.id} className="overflow-hidden">
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{project.icon}</span>
                              <CardTitle className="text-base">{project.name}</CardTitle>
                            </div>
                            <Badge 
                              variant="outline" 
                              style={{ backgroundColor: `${project.color}20`, borderColor: project.color }}
                            >
                              {isAdmin && project.owner && project.owner.name
                                ? `Propriétaire: ${project.owner.name}`
                                : "Propriétaire"}
                            </Badge>
                          </div>
                          {project.description && (
                            <CardDescription className="mt-1 line-clamp-2">
                              {project.description}
                            </CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          {confirmDelete === project.id ? (
                            <div className="flex flex-col gap-2">
                              <p className="text-sm font-medium text-destructive">
                                Êtes-vous sûr de vouloir supprimer ce projet ? Cette action est irréversible.
                              </p>
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmDelete(null)}
                                  disabled={isDeleting === project.id}
                                >
                                  Annuler
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteProject(project.id)}
                                  disabled={isDeleting === project.id}
                                >
                                  {isDeleting === project.id ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Suppression...
                                    </>
                                  ) : (
                                    "Confirmer"
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-end">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setConfirmDelete(project.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-1" /> 
                                Supprimer
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
