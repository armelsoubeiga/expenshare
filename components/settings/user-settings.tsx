"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Loader2, Trash2, ArrowLeft } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"

interface UserSettingsProps {
  isOpen: boolean
  onClose: () => void
}

export function UserSettings({ isOpen, onClose }: UserSettingsProps) {
  const { db, isReady } = useDatabase()
  const [projects, setProjects] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState("")
  const [isDeleting, setIsDeleting] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  // Nouveaux états: devise utilisateur et taux de conversion
  const [currency, setCurrency] = useState<"EUR"|"CFA"|"USD">("EUR")
  const [eurToCfa, setEurToCfa] = useState<string>("")
  const [eurToUsd, setEurToUsd] = useState<string>("")
  const [savingCurrency, setSavingCurrency] = useState(false)

  useEffect(() => {
    if (isOpen && isReady) {
      loadUserData()
    }
  }, [isOpen, isReady])

  const loadUserData = async () => {
    try {
      const storedUser = localStorage.getItem("expenshare_user")
      if (!storedUser) {
        setError("Utilisateur non connecté")
        setIsLoading(false)
        return
      }

      if (!db) {
        setError("La base de données n'est pas disponible")
        setIsLoading(false)
        return
      }

      const userData = JSON.parse(storedUser)
      setUserId(userData.id)

      // Détection admin
      let adminId = null
      if (db.getAdminUserId) {
        adminId = await db.getAdminUserId()
      }
      const isUserAdmin = adminId && userData.id === adminId
      setIsAdmin(!!isUserAdmin)

      let allProjects = []
      if (isUserAdmin && db.projects && db.projects.toArray) {
        // L'admin voit tous les projets
        allProjects = await db.projects.toArray()
        // Charger les noms des propriétaires
        if (db.users && db.users.toArray) {
          const users = await db.users.toArray()
          const userMap = new Map((users as any[]).map((u: any) => [String(u.id), u]))
          allProjects = (allProjects as any[]).map((p: any) => ({
            ...p,
            owner: userMap.get(String(p.created_by))
          }))
        }
      } else {
        // Utilisateur normal : ses propres projets
        allProjects = await db.projects
          .where("created_by")
          .equals(userData.id)
          .toArray()
      }
      setProjects(allProjects)

      // Charger paramètres devise utilisateur
      try {
        const userCurrency = await db.settings.get(`user:${userData.id}:currency`)
        const cfaRate = await db.settings.get(`user:${userData.id}:eur_to_cfa`)
        const usdRate = await db.settings.get(`user:${userData.id}:eur_to_usd`)
        if (userCurrency?.value) setCurrency(userCurrency.value as any)
        if (cfaRate?.value) setEurToCfa(String(cfaRate.value))
        if (usdRate?.value) setEurToUsd(String(usdRate.value))
      } catch (e) {
        // silencieux
      }
      setIsLoading(false)
    } catch (error) {
      console.error("Erreur lors du chargement des données utilisateur:", error)
      setError("Erreur lors du chargement des projets")
      setIsLoading(false)
    }
  }

  const saveCurrencySettings = async () => {
    if (!db || !userId) return
    setSavingCurrency(true)
    try {
      await db.settings.put({ key: `user:${userId}:currency`, value: currency })
      if (eurToCfa) await db.settings.put({ key: `user:${userId}:eur_to_cfa`, value: eurToCfa })
      if (eurToUsd) await db.settings.put({ key: `user:${userId}:eur_to_usd`, value: eurToUsd })

      // Notifier l'application pour appliquer immédiatement
      try {
        const detail = {
          currency,
          eurToCfa,
          eurToUsd,
          userId,
          updatedAt: Date.now(),
        }
        window.dispatchEvent(new CustomEvent('expenshare:currency-changed', { detail }))
      } catch { /* ignore */ }
    } catch (e) {
      setError("Erreur lors de l'enregistrement des paramètres de devise")
    } finally {
      setSavingCurrency(false)
    }
  }

  const handleDeleteProject = async (projectId: number) => {
    if (!db || !userId) {
      setError("La base de données ou l'utilisateur n'est pas disponible")
      return
    }

    setIsDeleting(projectId)
    try {
      // 1. Supprimer toutes les transactions associées au projet
      await db.transactions
        .where("project_id")
        .equals(projectId)
        .delete()

      // 2. Supprimer toutes les catégories associées au projet
      await db.categories
        .where("project_id")
        .equals(projectId)
        .delete()

      // 3. Supprimer toutes les associations d'utilisateurs au projet
      await db.project_users
        .where("project_id")
        .equals(projectId)
        .delete()

      // 4. Supprimer le projet lui-même
      await db.projects
        .where("id")
        .equals(projectId)
        .delete()

      // Actualiser la liste des projets
      setProjects(projects.filter(project => project.id !== projectId))
      setConfirmDelete(null)
    } catch (error) {
      console.error("Erreur lors de la suppression du projet:", error)
      setError("Erreur lors de la suppression du projet")
    } finally {
      setIsDeleting(null)
    }
  }

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
            <h3 className="text-lg font-medium">Devise d'affichage</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Choisissez votre devise et définissez les taux de conversion (1 € = …)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="text-sm font-medium">Devise</label>
                <select
                  className="mt-1 w-full border rounded-md bg-transparent px-3 py-2"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as any)}
                >
                  <option value="EUR">Euro (EUR)</option>
                  <option value="CFA">CFA</option>
                  <option value="USD">Dollar (USD)</option>
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
                ? "Liste de tous les projets de tous les utilisateurs. Vous pouvez supprimer n'importe quel projet."
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
                      ? "Aucun projet n'a encore été créé."
                      : "Vous n'avez pas encore créé de projets."}
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
