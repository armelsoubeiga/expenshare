"use client"

import { useState } from "react"
import { Plus, X, ChevronRight, Loader2, FolderOpen } from "lucide-react"
import type { Category } from "@/lib/types"

interface CategoryPickerProps {
  categories: (Category & { id: number })[]
  selectedId: string
  projectId: string
  onSelect: (id: string, name: string) => void
  onCategoryAdded: (newId: number, name: string, parentId: number | null) => void
  onAddCategory: (name: string, parentId: number | null) => Promise<number>
  disabled?: boolean
}

export function CategoryPicker({
  categories,
  selectedId,
  projectId,
  onSelect,
  onCategoryAdded,
  onAddCategory,
  disabled,
}: CategoryPickerProps) {
  const [openParentId, setOpenParentId] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addParentId, setAddParentId] = useState<number | null>(null)
  const [addName, setAddName] = useState("")
  const [saving, setSaving] = useState(false)

  const roots = categories.filter(c => !c.parent_id || c.parent_id === null || c.level === 1)
  const childrenOf = (parentId: number) => categories.filter(c => Number(c.parent_id) === parentId)
  const hasChildren = (catId: number) => categories.some(c => Number(c.parent_id) === catId)

  const openParent = roots.find(c => c.id === openParentId)
  const subCats = openParentId ? childrenOf(openParentId) : []

  const selectedCat = categories.find(c => String(c.id) === selectedId)
  const selectedParent = selectedCat?.parent_id
    ? categories.find(c => c.id === Number(selectedCat.parent_id))
    : null

  const handleSelectRoot = (cat: Category & { id: number }) => {
    if (hasChildren(cat.id)) {
      setOpenParentId(prev => prev === cat.id ? null : cat.id)
    } else {
      onSelect(String(cat.id), cat.name)
      setOpenParentId(null)
    }
  }

  const handleSelectChild = (cat: Category & { id: number }) => {
    onSelect(String(cat.id), cat.name)
  }

  const startAdd = (parentId: number | null) => {
    if (!projectId) return
    setAddParentId(parentId)
    setAddName("")
    setShowAdd(true)
  }

  const handleAdd = async () => {
    if (!addName.trim() || saving) return
    setSaving(true)
    try {
      const newId = await onAddCategory(addName.trim(), addParentId)
      onCategoryAdded(newId, addName.trim(), addParentId)
      onSelect(String(newId), addName.trim())
      setShowAdd(false)
      setAddName("")
      if (addParentId) setOpenParentId(addParentId)
    } catch {
      // error handled by parent
    } finally {
      setSaving(false)
    }
  }

  if (!projectId) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-muted text-sm text-muted-foreground">
        <FolderOpen className="h-4 w-4 flex-shrink-0" />
        Sélectionnez d'abord un projet
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Affichage de la sélection courante */}
      {selectedCat && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-xl text-sm">
          <div className="flex-1 min-w-0">
            <span className="font-medium text-primary">
              {selectedParent ? `${selectedParent.name} / ` : ""}
              {selectedCat.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => { onSelect("", ""); setOpenParentId(null) }}
            className="p-0.5 rounded-lg hover:bg-primary/20 text-primary transition-colors flex-shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ─── Chips racines ─── */}
      {roots.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-sm text-muted-foreground">Aucune catégorie pour ce projet</p>
          <button
            type="button"
            onClick={() => startAdd(null)}
            disabled={disabled}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Créer la première catégorie
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto pr-1">
          {roots.map(cat => {
            const kids = hasChildren(cat.id)
            const isOpen = openParentId === cat.id
            const isSelected = !kids && selectedId === String(cat.id)
            const childSelected = kids && categories.some(c => Number(c.parent_id) === cat.id && String(c.id) === selectedId)
            return (
              <button
                key={cat.id}
                type="button"
                disabled={disabled}
                onClick={() => handleSelectRoot(cat)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                  isSelected || childSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : isOpen
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-card border-border hover:border-primary/50 hover:bg-muted/60"
                } disabled:opacity-40`}
              >
                {cat.name}
                {kids && (
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                )}
              </button>
            )
          })}

          {/* Bouton ajouter catégorie racine */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => startAdd(null)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nouvelle</span>
          </button>
        </div>
      )}

      {/* ─── Sous-catégories ─── */}
      {openParentId && (
        <div className="ml-3 pl-3 border-l-2 border-primary/25 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {openParent?.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {subCats.length === 0 && !showAdd && (
              <span className="text-xs text-muted-foreground">Aucune sous-catégorie</span>
            )}
            {subCats.map(cat => (
              <button
                key={cat.id}
                type="button"
                disabled={disabled}
                onClick={() => handleSelectChild(cat)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                  selectedId === String(cat.id)
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card border-border hover:border-primary/50 hover:bg-muted/60"
                } disabled:opacity-40`}
              >
                {cat.name}
              </button>
            ))}
            {/* Bouton ajouter sous-catégorie */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => startAdd(openParentId)}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nouvelle</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── Formulaire d'ajout inline ─── */}
      {showAdd && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <div className="flex-1 space-y-1">
            <p className="text-xs font-medium text-primary">
              {addParentId
                ? `Sous-catégorie de « ${categories.find(c => c.id === addParentId)?.name} »`
                : "Nouvelle catégorie"}
            </p>
            <input
              type="text"
              placeholder="Nom…"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void handleAdd() } if (e.key === "Escape") setShowAdd(false) }}
              autoFocus
              className="w-full bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!addName.trim() || saving}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5" />Ajouter</>}
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
