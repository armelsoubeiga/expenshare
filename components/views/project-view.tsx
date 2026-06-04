"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle2 } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"

interface ProjectViewProps {
  onSuccess: () => void
  onCancel: () => void
}

const COLORS = [
  { name: "Bleu", value: "#3b82f6" },
  { name: "Vert", value: "#10b981" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Rose", value: "#ec4899" },
  { name: "Orange", value: "#f59e0b" },
  { name: "Rouge", value: "#ef4444" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Teal", value: "#14b8a6" },
]

const ICONS = ["📁", "🏠", "🚗", "🛒", "🎯", "💼", "🎨", "🏖️", "🎓", "💡"]
const CURRENCIES = [
  { value: "EUR", label: "Euro (€)" },
  { value: "CFA", label: "Franc CFA (XOF)" },
  { value: "USD", label: "Dollar US ($)" },
]

export function ProjectView({ onSuccess, onCancel }: ProjectViewProps) {
  const { db } = useDatabase()
  const [formData, setFormData] = useState({ name: "", description: "", icon: "📁", color: "#3b82f6", currency: "EUR" })
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) { setError("Le nom du projet est obligatoire"); return }
    setIsLoading(true)
    setError("")
    try {
      if (!db) throw new Error("Base de données non disponible")
      const stored = localStorage.getItem("expenshare_user") || localStorage.getItem("expenshare_current_user")
      if (!stored) throw new Error("Utilisateur non connecté")
      const user = JSON.parse(stored)
      await db.createProject(formData.name, formData.description || "", formData.icon, formData.color, formData.currency, user.id || 0)
      window.dispatchEvent(new CustomEvent('expenshare:project-updated'))
      setSuccess(true)
      setTimeout(onSuccess, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 gap-4">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
        </div>
        <p className="text-lg font-semibold">Projet créé !</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Aperçu du projet */}
        <div className="flex items-center gap-4 p-5 bg-card border border-border rounded-2xl">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-all"
            style={{ backgroundColor: `${formData.color}20` }}
          >
            {formData.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{formData.name || "Nom du projet"}</p>
            <p className="text-sm text-muted-foreground truncate">{formData.description || "Description"}</p>
          </div>
        </div>

        {/* Nom */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Nom du projet *</Label>
          <Input
            placeholder="Ex: Rénovation, Vacances 2025…"
            value={formData.name}
            onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
            className="h-12 rounded-xl"
            autoFocus
            required
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Description</Label>
          <Textarea
            placeholder="Décrivez brièvement votre projet…"
            value={formData.description}
            onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
            rows={2}
            className="rounded-xl resize-none"
          />
        </div>

        {/* Icône */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Icône</Label>
          <div className="flex flex-wrap gap-2">
            {ICONS.map(icon => (
              <button
                key={icon}
                type="button"
                onClick={() => setFormData(p => ({ ...p, icon }))}
                className={`w-11 h-11 rounded-xl text-xl transition-all ${
                  formData.icon === icon ? 'bg-primary/10 ring-2 ring-primary' : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Couleur */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Couleur</Label>
          <div className="flex flex-wrap gap-2.5">
            {COLORS.map(color => (
              <button
                key={color.value}
                type="button"
                onClick={() => setFormData(p => ({ ...p, color: color.value }))}
                className={`w-9 h-9 rounded-xl transition-all ${
                  formData.color === color.value ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </div>

        {/* Devise */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Devise</Label>
          <div className="flex gap-2">
            {CURRENCIES.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setFormData(p => ({ ...p, currency: c.value }))}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all border ${
                  formData.currency === c.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-12 rounded-xl">
            Annuler
          </Button>
          <Button type="submit" disabled={isLoading} className="flex-1 h-12 rounded-xl">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Créer le projet"}
          </Button>
        </div>
      </form>
    </div>
  )
}
