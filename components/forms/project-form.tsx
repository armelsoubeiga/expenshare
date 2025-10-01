"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FolderPlus, Loader2 } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"

interface ProjectFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const PROJECT_COLORS = [
  { name: "Bleu", value: "#3b82f6", bg: "bg-blue-500" },
  { name: "Vert", value: "#10b981", bg: "bg-green-500" },
  { name: "Violet", value: "#8b5cf6", bg: "bg-violet-500" },
  { name: "Rose", value: "#ec4899", bg: "bg-pink-500" },
  { name: "Orange", value: "#f59e0b", bg: "bg-amber-500" },
  { name: "Rouge", value: "#ef4444", bg: "bg-red-500" },
  { name: "Indigo", value: "#6366f1", bg: "bg-indigo-500" },
  { name: "Teal", value: "#14b8a6", bg: "bg-teal-500" },
]

const PROJECT_ICONS = ["📁", "🏠", "🚗", "🛒", "🎯", "💼", "🎨", "🏖️", "🎓", "💡"]

export function ProjectForm({ isOpen, onClose, onSuccess }: ProjectFormProps) {
  const { db } = useDatabase()
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "📁",
    color: "#3b82f6",
    currency: "EUR",
  })
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      resetForm()
    }
  }, [isOpen])

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      icon: "📁",
      color: "#3b82f6",
      currency: "EUR",
    })
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      setError("Le nom du projet est obligatoire")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!db) throw new Error("Base de données non disponible")

      // Get current user
      const storedUser = localStorage.getItem("expenshare_user") || localStorage.getItem("expenshare_current_user")
      if (!storedUser) throw new Error("Utilisateur non connecté")
      
      const currentUserData = JSON.parse(storedUser)
      
      // Create project
      await db.createProject(
        formData.name,
        formData.description || "",
        formData.icon,
        formData.color,
        formData.currency,
        currentUserData.id || 0
      )

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création du projet")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5" />
            Nouveau Projet
          </DialogTitle>
          <DialogDescription>Créez un nouveau projet</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom du projet *</Label>
              <Input
                id="name"
                placeholder="Ex: Rénovation maison, Vacances 2024..."
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Décrivez brièvement votre projet..."
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Icône du projet</Label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_ICONS.map((icon) => (
                  <Button
                    key={icon}
                    type="button"
                    variant={formData.icon === icon ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormData((prev) => ({ ...prev, icon }))}
                    className="text-lg p-2 h-auto"
                  >
                    {icon}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Couleur du projet</Label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map((color) => (
                  <Button
                    key={color.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData((prev) => ({ ...prev, color: color.value }))}
                    className={`p-2 h-auto ${formData.color === color.value ? "ring-2 ring-primary" : ""}`}
                  >
                    <div className={`w-4 h-4 rounded-full ${color.bg}`} />
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création...
                </>
              ) : (
                "Créer le projet"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
