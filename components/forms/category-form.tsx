"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { FolderTree } from "lucide-react"
import { db } from "@/lib/database"

interface CategoryFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  projectId: number
}

export function CategoryForm({ isOpen, onClose, onSuccess, projectId }: CategoryFormProps) {
  const [categories, setCategories] = useState<any[]>([])
  const [formData, setFormData] = useState({
    name: "",
    parentId: "0", // Updated default value to be a non-empty string
  })
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen && projectId) {
      loadCategories()
    }
  }, [isOpen, projectId])

  const loadCategories = async () => {
    try {
      const projectCategories = await db.getProjectCategories(projectId)
      setCategories(projectCategories)
    } catch (error) {
      console.error("Failed to load categories:", error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      setError("Le nom de la catégorie est obligatoire")
      return
    }

    // Check if we're trying to create a level 4 category (max is 3)
    if (formData.parentId) {
      const parentCategory = categories.find((cat) => cat.id.toString() === formData.parentId)
      if (parentCategory && parentCategory.level >= 3) {
        setError("Maximum 3 niveaux de catégories autorisés")
        return
      }
    }

    setIsLoading(true)
    setError("")

    try {
      await db.createCategory(
        projectId,
        formData.name,
        formData.parentId ? Number.parseInt(formData.parentId) : undefined,
      )

      // Reset form
      setFormData({
        name: "",
        parentId: "0", // Updated default value to be a non-empty string
      })

      await loadCategories() // Refresh categories
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création de la catégorie")
    } finally {
      setIsLoading(false)
    }
  }

  const getAvailableParents = () => {
    // Only show categories with level < 3 as potential parents
    return categories.filter((cat) => cat.level < 3)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Nouvelle Catégorie
          </DialogTitle>
          <DialogDescription>Créez une catégorie pour organiser vos dépenses (3 niveaux maximum)</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Nom de la catégorie *</Label>
            <Input
              id="name"
              placeholder="Ex: Architecture, Matériaux, Décoration..."
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          {getAvailableParents().length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="parent">Catégorie parente (optionnel)</Label>
              <Select
                value={formData.parentId}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, parentId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucune (catégorie principale)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Aucune (catégorie principale)</SelectItem>{" "}
                  {/* Updated value prop to be a non-empty string */}
                  {getAvailableParents().map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      <div className="flex items-center gap-2">
                        <span>{"  ".repeat(category.level - 1)}└</span>
                        <span>{category.name}</span>
                        <Badge variant="outline" className="text-xs">
                          Niveau {category.level}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Current categories display */}
          {categories.length > 0 && (
            <div className="space-y-2">
              <Label>Catégories existantes</Label>
              <Card className="p-3 max-h-32 overflow-y-auto">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center gap-2 py-1">
                    <span className="text-muted-foreground">
                      {"  ".repeat(category.level - 1)}
                      {category.level > 1 ? "└ " : ""}
                    </span>
                    <span className="text-sm">{category.name}</span>
                    <Badge variant="outline" className="text-xs">
                      Niveau {category.level}
                    </Badge>
                  </div>
                ))}
              </Card>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 bg-transparent">
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? "Création..." : "Créer la catégorie"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
