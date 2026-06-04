"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, CheckCircle2, TrendingDown, TrendingUp, X, Trash2, ArrowLeft } from "lucide-react"
import { CategoryPicker } from "@/components/forms/category-picker"
import { useDatabase } from "@/hooks/use-database"
import type { TursoDatabaseInstance } from "@/lib/database-turso"
import type { Category, Note } from "@/lib/types"

interface EditTransactionViewProps {
  transactionId: number
  onBack: () => void
  onSuccess: () => void
}

type ExistingNote = Note & { id: number }

export function EditTransactionView({ transactionId, onBack, onSuccess }: EditTransactionViewProps) {
  const { db, isReady } = useDatabase()
  const database = db as TursoDatabaseInstance | null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  // Transaction fields
  const [type, setType] = useState<"expense" | "budget">("expense")
  const [projectId, setProjectId] = useState(0)
  const [projectName, setProjectName] = useState("")
  const [projectCurrency, setProjectCurrency] = useState("EUR")
  const [categoryId, setCategoryId] = useState("")
  const [amount, setAmount] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")

  // Category data
  const [categories, setCategories] = useState<(Category & { id: number })[]>([])

  // Existing notes (media)
  const [existingNotes, setExistingNotes] = useState<ExistingNote[]>([])
  const [deletedNoteIds, setDeletedNoteIds] = useState<Set<number>>(new Set())

  const currencySymbol = projectCurrency === "CFA" ? "F CFA" : projectCurrency === "USD" ? "$" : "€"

  // ─── Chargement de la transaction ─────────────────────────────────────────
  const loadTransaction = useCallback(async () => {
    if (!database || !isReady) return
    setLoading(true)
    setError("")
    try {
      const tx = await database.getTransactionById(transactionId)
      if (!tx) { setError("Transaction introuvable"); setLoading(false); return }

      setType(tx.type === "budget" ? "budget" : "expense")
      setProjectId(Number(tx.project_id))
      setAmount(String(
        tx.type === "expense"
          ? Number(tx.amount_eur ?? tx.amount ?? 0)
          : Number(tx.amount_eur ?? tx.amount ?? 0)
      ))
      setTitle(tx.title || "")
      setDescription(tx.description || "")
      if (tx.category_id) setCategoryId(String(tx.category_id))

      // Projet
      const proj = await database.getProjectById(Number(tx.project_id))
      setProjectName(proj?.name || "")
      const cur = String(proj?.currency || "EUR").toUpperCase()
      setProjectCurrency(cur === "XOF" ? "CFA" : cur)

      // Catégories du projet
      const cats = await database.getProjectCategories(Number(tx.project_id))
      setCategories(
        cats
          .filter((c): c is Category & { id: number } => c.id !== undefined)
          .sort((a, b) => a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name))
      )

      // Notes existantes
      const notes = await database.getNotesByTransaction(transactionId)
      setExistingNotes(notes.filter((n): n is ExistingNote => n.id !== undefined))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }, [database, isReady, transactionId])

  useEffect(() => { void loadTransaction() }, [loadTransaction])

  // ─── Ajout de catégorie inline ─────────────────────────────────────────────
  const handleAddCategory = useCallback(async (name: string, parentId: number | null): Promise<number> => {
    if (!database) throw new Error("DB non disponible")
    const parent = parentId ? categories.find(c => c.id === parentId) : null
    return database.categories.add({
      project_id: projectId,
      name,
      parent_id: parentId ?? undefined,
      level: parent ? 2 : 1,
    })
  }, [database, categories, projectId])

  const handleCategoryAdded = useCallback((newId: number, name: string, parentId: number | null) => {
    setCategories(prev => [
      ...prev,
      { id: newId, project_id: projectId, name, parent_id: parentId ?? undefined, level: parentId ? 2 : 1 } as Category & { id: number },
    ])
  }, [projectId])

  // ─── Sauvegarde ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const amt = Number(amount)
    if (!amount || isNaN(amt) || amt <= 0) { setError("Montant invalide"); return }
    if (type === "expense" && !categoryId) { setError("Sélectionnez une catégorie"); return }
    if (type === "budget" && !title.trim()) { setError("Le titre est obligatoire"); return }

    setSaving(true)
    try {
      if (!database) throw new Error("DB non disponible")

      // Mettre à jour la transaction
      await database.updateTransaction(transactionId, {
        amount: amt,
        category_id: categoryId ? Number(categoryId) : null,
        title: title.trim(),
        description: description.trim(),
      })

      // Supprimer les notes marquées pour suppression
      for (const noteId of deletedNoteIds) {
        await database.notes.delete(noteId)
      }

      setSuccess(true)
      setTimeout(onSuccess, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde")
    } finally {
      setSaving(false)
    }
  }

  // ─── Suppression ────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!database) return
    setDeleting(true)
    try {
      await database.deleteTransaction(transactionId)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression")
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  // ─── États d'affichage ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 gap-4">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
        <p className="text-xl font-bold">Transaction mise à jour !</p>
        <p className="text-sm text-muted-foreground">Retour en cours…</p>
      </div>
    )
  }

  const visibleNotes = existingNotes.filter(n => !deletedNoteIds.has(n.id))

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-10 space-y-5">

      {/* ─── Header ─── */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold">Modifier la transaction</h1>
          <p className="text-xs text-muted-foreground">{projectName}</p>
        </div>
        {/* Supprimer */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors border border-red-200 dark:border-red-800"
          >
            <Trash2 className="h-3.5 w-3.5" /> Supprimer
          </button>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-red-600 font-medium">Confirmer ?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 rounded-xl bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Oui, supprimer"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 rounded-xl border border-border text-xs hover:bg-muted transition-colors"
            >
              Non
            </button>
          </div>
        )}
      </div>

      {/* ─── Type (lecture seule) ─── */}
      <div className="flex gap-2 p-1 bg-muted rounded-2xl">
        {(["expense", "budget"] as const).map(t => (
          <div
            key={t}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold ${
              type === t
                ? t === "expense"
                  ? "bg-white dark:bg-card shadow text-red-600"
                  : "bg-white dark:bg-card shadow text-blue-600"
                : "text-muted-foreground/40"
            }`}
          >
            {t === "expense" ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            {t === "expense" ? "Dépense" : "Budget"}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ─── Montant ─── */}
        <div
          className={`bg-card border-2 rounded-2xl p-5 cursor-text transition-colors ${
            amount
              ? type === "expense" ? "border-red-200 dark:border-red-800" : "border-blue-200 dark:border-blue-800"
              : "border-border"
          }`}
        >
          <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2 block">
            Montant *
          </label>
          <div className="flex items-baseline gap-3">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              className={`flex-1 text-5xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/25 w-full ${
                type === "expense" ? "text-red-600" : "text-blue-600"
              }`}
            />
            <span className={`text-2xl font-medium ${type === "expense" ? "text-red-400" : "text-blue-400"}`}>
              {currencySymbol}
            </span>
          </div>
        </div>

        {/* ─── Catégorie (dépenses) ─── */}
        {type === "expense" && (
          <div className="space-y-2">
            <label className="text-sm font-semibold">Catégorie *</label>
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              projectId={String(projectId)}
              onSelect={(id, name) => {
                setCategoryId(id)
                if (id && !title) setTitle(name)
              }}
              onCategoryAdded={handleCategoryAdded}
              onAddCategory={handleAddCategory}
            />
          </div>
        )}

        {/* ─── Titre ─── */}
        <div className="space-y-2">
          <label className="text-sm font-semibold">
            {type === "expense" ? "Description (optionnelle)" : "Titre *"}
          </label>
          <input
            type="text"
            placeholder={type === "expense" ? "Précisions…" : "Ex: Apport initial…"}
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full h-12 px-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm"
            required={type === "budget"}
          />
        </div>

        {/* ─── Note ─── */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-muted-foreground">Note (optionnelle)</label>
          <textarea
            placeholder="Précisions supplémentaires…"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm resize-none"
          />
        </div>

        {/* ─── Pièces jointes existantes ─── */}
        {visibleNotes.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-semibold">Pièces jointes actuelles</label>
            <div className="space-y-1.5">
              {visibleNotes.map(note => (
                <div key={note.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/30">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    note.content_type === "image" ? "bg-blue-100 text-blue-600" :
                    note.content_type === "audio" ? "bg-green-100 text-green-600" :
                    note.content_type === "video" ? "bg-purple-100 text-purple-600" :
                    "bg-orange-100 text-orange-600"
                  }`}>
                    {note.content_type === "image" ? "🖼" : note.content_type === "audio" ? "🎵" : note.content_type === "video" ? "🎬" : "📄"}
                  </div>
                  <span className="flex-1 text-sm truncate min-w-0">
                    {note.file_path || (note.content_type === "text" ? note.content.slice(0, 40) + (note.content.length > 40 ? "…" : "") : note.content_type)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeletedNoteIds(prev => new Set([...prev, note.id]))}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex-shrink-0"
                    title="Supprimer cette pièce jointe"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {deletedNoteIds.size > 0 && (
                <p className="text-xs text-amber-600">
                  {deletedNoteIds.size} pièce{deletedNoteIds.size > 1 ? "s jointes seront supprimées" : " jointe sera supprimée"} à la sauvegarde.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── Erreur ─── */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
            <span className="text-red-500 text-sm flex-1">{error}</span>
            <button type="button" onClick={() => setError("")}><X className="h-4 w-4 text-red-400" /></button>
          </div>
        )}

        {/* ─── Actions ─── */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 h-12 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-medium"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`flex-1 h-12 rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              type === "expense"
                ? "bg-red-500 hover:bg-red-600 disabled:bg-red-300"
                : "bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300"
            }`}
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enregistrer les modifications"}
          </button>
        </div>
      </form>
    </div>
  )
}
