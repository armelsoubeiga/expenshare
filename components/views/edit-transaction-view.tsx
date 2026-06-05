"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Loader2, CheckCircle2, TrendingDown, TrendingUp, Camera, Mic, FileText, X, Video, Paperclip, Trash2, ArrowLeft } from "lucide-react"
import { CategoryPicker } from "@/components/forms/category-picker"
import { MediaUpload, type MediaUploadHandle } from "@/components/media/media-upload"
import { useDatabase } from "@/hooks/use-database"
import type { TursoDatabaseInstance } from "@/lib/database-turso"
import type { MediaFile } from "@/lib/media-types"
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

  const [type, setType] = useState<"expense" | "budget">("expense")
  const [projectId, setProjectId] = useState(0)
  const [projectName, setProjectName] = useState("")
  const [projectCurrency, setProjectCurrency] = useState<"EUR" | "CFA" | "USD">("EUR")
  const [categoryId, setCategoryId] = useState("")
  const [amount, setAmount] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [showNote, setShowNote] = useState(false)

  const [categories, setCategories] = useState<(Category & { id: number })[]>([])
  const [existingNotes, setExistingNotes] = useState<ExistingNote[]>([])
  const [deletedNoteIds, setDeletedNoteIds] = useState<Set<number>>(new Set())
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  const imgInputRef = useRef<HTMLInputElement>(null)
  const vidInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const audioUploadRef = useRef<MediaUploadHandle | null>(null)

  const currencySymbol = projectCurrency === "CFA" ? "F CFA" : projectCurrency === "USD" ? "$" : "€"
  const recFmt = `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}`

  const uploadToB2 = async (base64: string, contentType: string, extension: string): Promise<string> => {
    const resp = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: base64, content_type: contentType, extension }),
    })
    if (!resp.ok) throw new Error(await resp.text())
    const { key } = await resp.json() as { key: string }
    return `/api/media?key=${encodeURIComponent(key)}`
  }

  const fileToBase64 = (file: File | Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    e.target.value = ""
    setUploading(true)
    for (const file of files) {
      try {
        const base64 = await fileToBase64(file)
        const ext = file.name.split(".").pop() || "bin"
        const mediaType: MediaFile["type"] = file.type.startsWith("image/") ? "image"
          : file.type.startsWith("audio/") ? "audio"
          : file.type.startsWith("video/") ? "video"
          : "file"
        const url = await uploadToB2(base64, mediaType, ext)
        setMediaFiles(prev => [...prev, {
          id: `${Date.now()}${Math.random().toString(36).slice(2, 9)}`,
          type: mediaType,
          name: file.name,
          size: file.size,
          url,
        }])
      } catch (err) {
        setError("Erreur upload : " + (err instanceof Error ? err.message : String(err)))
      }
    }
    setUploading(false)
  }, [])

  const loadTransaction = useCallback(async () => {
    if (!database || !isReady) return
    setLoading(true)
    setError("")
    try {
      const tx = await database.getTransactionById(transactionId)
      if (!tx) { setError("Transaction introuvable"); setLoading(false); return }

      setType(tx.type === "budget" ? "budget" : "expense")
      setProjectId(Number(tx.project_id))
      if (tx.category_id) setCategoryId(String(tx.category_id))
      setTitle(tx.title || "")
      setDescription(tx.description || "")
      if (tx.description) setShowNote(true)

      const proj = await database.getProjectById(Number(tx.project_id))
      setProjectName(proj?.name || "")
      const cur = String(proj?.currency || "EUR").toUpperCase()
      const normalizedCur: "EUR" | "CFA" | "USD" =
        cur === "XOF" || cur === "CFA" ? "CFA" : cur === "USD" ? "USD" : "EUR"
      setProjectCurrency(normalizedCur)

      let displayAmount: number
      if (normalizedCur === "CFA") displayAmount = Number(tx.amount_cfa ?? 0)
      else if (normalizedCur === "USD") displayAmount = Number(tx.amount_usd ?? 0)
      else displayAmount = Number(tx.amount_eur ?? tx.amount ?? 0)
      setAmount(String(displayAmount))

      const cats = await database.getProjectCategories(Number(tx.project_id))
      setCategories(
        cats
          .filter((c): c is Category & { id: number } => c.id !== undefined)
          .sort((a, b) => a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name))
      )

      const notes = await database.getNotesByTransaction(transactionId)
      setExistingNotes(notes.filter((n): n is ExistingNote => n.id !== undefined))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }, [database, isReady, transactionId])

  useEffect(() => { void loadTransaction() }, [loadTransaction])

  const handleAddCategory = useCallback(async (name: string, parentId: number | null): Promise<number> => {
    if (!database) throw new Error("DB non disponible")
    const parent = parentId ? categories.find(c => c.id === parentId) : null
    return database.categories.add({
      project_id: projectId, name,
      parent_id: parentId ?? undefined, level: parent ? 2 : 1,
    })
  }, [database, categories, projectId])

  const handleCategoryAdded = useCallback((newId: number, name: string, parentId: number | null) => {
    setCategories(prev => [
      ...prev,
      { id: newId, project_id: projectId, name, parent_id: parentId ?? undefined, level: parentId ? 2 : 1 } as Category & { id: number },
    ])
  }, [projectId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const amt = Number(amount.replace(",", "."))
    if (!amount || isNaN(amt) || amt <= 0) { setError("Montant invalide"); return }
    if (type === "expense" && !categoryId) { setError("Sélectionnez une catégorie"); return }
    if (type === "budget" && !title.trim()) { setError("Le titre est obligatoire"); return }

    setSaving(true)
    try {
      if (!database) throw new Error("DB non disponible")

      await database.updateTransaction(transactionId, {
        amount: amt,
        category_id: categoryId ? Number(categoryId) : null,
        title: title.trim(),
        description: description.trim(),
      })

      for (const noteId of deletedNoteIds) {
        await database.notes.delete(noteId)
      }

      for (const media of mediaFiles) {
        await database.notes.add({
          transaction_id: transactionId,
          content_type: media.type === "image" ? "image"
            : media.type === "audio" ? "audio"
            : media.type === "video" ? "video"
            : "text",
          content: media.url,
          file_path: media.name,
        } as Note)
      }

      const hasExistingTextNote = existingNotes.some(
        n => n.content_type === "text" && !deletedNoteIds.has(n.id)
      )
      if (description.trim() && !hasExistingTextNote) {
        await database.notes.add({
          transaction_id: transactionId,
          content_type: "text",
          content: description.trim(),
          file_path: undefined,
        } as Note)
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("expenshare:project-updated"))
      }

      setSuccess(true)
      setTimeout(onSuccess, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde")
    } finally {
      setSaving(false)
    }
  }

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
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${type === "expense" ? "bg-red-100 dark:bg-red-950/30" : "bg-blue-100 dark:bg-blue-950/30"}`}>
          <CheckCircle2 className={`h-10 w-10 ${type === "expense" ? "text-red-500" : "text-blue-500"}`} />
        </div>
        <p className="text-xl font-bold">Transaction mise à jour !</p>
        <p className="text-sm text-muted-foreground">Retour en cours…</p>
      </div>
    )
  }

  const visibleNotes = existingNotes.filter(n => !deletedNoteIds.has(n.id))

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-10 space-y-5">

      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold">Modifier la transaction</h1>
          <p className="text-xs text-muted-foreground truncate">{projectName}</p>
        </div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors border border-red-200 dark:border-red-800">
            <Trash2 className="h-3.5 w-3.5" /> Supprimer
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600 font-medium">Confirmer ?</span>
            <button onClick={handleDelete} disabled={deleting} className="px-3 py-1.5 rounded-xl bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Oui"}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-xl border border-border text-xs hover:bg-muted transition-colors">Non</button>
          </div>
        )}
      </div>

      <div className="flex gap-2 p-1 bg-muted rounded-2xl">
        {(["expense", "budget"] as const).map(t => (
          <div key={t} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold ${type === t ? t === "expense" ? "bg-white dark:bg-card shadow text-red-600" : "bg-white dark:bg-card shadow text-blue-600" : "text-muted-foreground/40"}`}>
            {t === "expense" ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            {t === "expense" ? "Dépense" : "Budget"}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        <div className={`bg-card border-2 rounded-2xl p-5 cursor-text transition-colors ${amount ? type === "expense" ? "border-red-200 dark:border-red-800" : "border-blue-200 dark:border-blue-800" : "border-border"}`}>
          <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2 block">Montant *</label>
          <div className="flex items-baseline gap-3">
            <input
              type="text" inputMode="decimal" placeholder="0" value={amount} autoFocus
              onChange={e => { const raw = e.target.value.replace(",", "."); if (raw === "" || /^\d*\.?\d*$/.test(raw)) setAmount(raw) }}
              className={`flex-1 text-5xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/25 w-full ${type === "expense" ? "text-red-600" : "text-blue-600"}`}
            />
            <span className={`text-2xl font-medium ${type === "expense" ? "text-red-400" : "text-blue-400"}`}>{currencySymbol}</span>
          </div>
        </div>

        {type === "expense" && (
          <div className="space-y-2">
            <label className="text-sm font-semibold">Catégorie *</label>
            <CategoryPicker
              categories={categories} selectedId={categoryId} projectId={String(projectId)}
              onSelect={(id, name) => { setCategoryId(id); if (id && !title) setTitle(name) }}
              onCategoryAdded={handleCategoryAdded} onAddCategory={handleAddCategory}
            />
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-semibold text-muted-foreground">{type === "budget" ? "Titre *" : "Description (optionnelle)"}</label>
          <input
            type="text" placeholder={type === "budget" ? "Ex : Apport initial…" : "Précisions…"}
            value={title} onChange={e => setTitle(e.target.value)} required={type === "budget"}
            className="w-full h-11 px-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">Pièces jointes</label>
            {(visibleNotes.length + mediaFiles.length) > 0 && (
              <span className="text-xs text-muted-foreground">
                {visibleNotes.length + mediaFiles.length} fichier{(visibleNotes.length + mediaFiles.length) > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {[
              { icon: Camera,    label: "Photo",  color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/20",    action: () => imgInputRef.current?.click() },
              { icon: Mic,       label: isRecordingAudio ? recFmt : "Audio", color: isRecordingAudio ? "text-red-500" : "text-green-500", bg: isRecordingAudio ? "bg-red-50 dark:bg-red-950/20 animate-pulse" : "bg-green-50 dark:bg-green-950/20", action: () => { if (audioUploadRef.current) { audioUploadRef.current.getRecordingState() ? audioUploadRef.current.stopAudioRecording() : audioUploadRef.current.startAudioRecording() } } },
              { icon: Video,     label: "Vidéo",  color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/20", action: () => vidInputRef.current?.click() },
              { icon: Paperclip, label: "Doc",    color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/20", action: () => docInputRef.current?.click() },
              { icon: FileText,  label: "Note",   color: "text-amber-500",  bg: "bg-amber-50 dark:bg-amber-950/20",  action: () => setShowNote(v => !v) },
            ].map(({ icon: Icon, label, color, bg, action }) => (
              <button key={label} type="button" onClick={action} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl ${bg} hover:opacity-80 transition-all`}>
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-[9px] font-medium text-muted-foreground leading-none">{label}</span>
              </button>
            ))}
          </div>

          {uploading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Envoi en cours…
            </div>
          )}

          {showNote && (
            <div className="relative">
              <textarea
                placeholder="Votre note…" value={description} onChange={e => setDescription(e.target.value)}
                rows={3} autoFocus
                className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm resize-none pr-8"
              />
              <button type="button" onClick={() => setShowNote(false)} className="absolute top-2 right-2 p-1 rounded-lg text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {visibleNotes.length > 0 && (
            <div className="space-y-1.5">
              {visibleNotes.map(note => (
                <div key={note.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/30">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${note.content_type === "image" ? "bg-blue-100 text-blue-600" : note.content_type === "audio" ? "bg-green-100 text-green-600" : note.content_type === "video" ? "bg-purple-100 text-purple-600" : "bg-amber-100 text-amber-600"}`}>
                    {note.content_type === "image" ? "🖼" : note.content_type === "audio" ? "🎵" : note.content_type === "video" ? "🎬" : "📝"}
                  </div>
                  <span className="flex-1 text-sm truncate min-w-0">
                    {note.file_path || (note.content_type === "text" ? note.content.slice(0, 50) + (note.content.length > 50 ? "…" : "") : note.content_type)}
                  </span>
                  <button type="button" onClick={() => setDeletedNoteIds(prev => new Set([...prev, note.id]))} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex-shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {deletedNoteIds.size > 0 && (
                <p className="text-xs text-amber-600">{deletedNoteIds.size} pièce{deletedNoteIds.size > 1 ? "s jointes seront supprimées" : " jointe sera supprimée"} à la sauvegarde.</p>
              )}
            </div>
          )}

          {mediaFiles.length > 0 && (
            <MediaUpload
              previewOnly
              onMediaAdd={m => setMediaFiles(p => [...p, m])}
              onMediaRemove={id => setMediaFiles(p => p.filter(m => m.id !== id))}
              mediaFiles={mediaFiles}
              maxFiles={10}
            />
          )}

          <input ref={imgInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
          <input ref={vidInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
          <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,text/plain,text/csv" className="hidden" onChange={handleFileChange} />

          <div className="hidden">
            <MediaUpload
              ref={audioUploadRef}
              onMediaAdd={m => setMediaFiles(p => [...p, m])}
              onMediaRemove={id => setMediaFiles(p => p.filter(m => m.id !== id))}
              mediaFiles={mediaFiles}
              maxFiles={5}
              acceptedTypes={["audio/*"]}
              onRecordingStart={() => { setIsRecordingAudio(true); setRecordingSeconds(0) }}
              onRecordingStop={() => setIsRecordingAudio(false)}
              onRecordingTimeTick={s => setRecordingSeconds(s)}
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
            <span className="text-red-500 text-sm flex-1">{error}</span>
            <button type="button" onClick={() => setError("")}><X className="h-4 w-4 text-red-400" /></button>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onBack} className="flex-1 h-10 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-medium">Annuler</button>
          <button type="submit" disabled={saving || uploading} className={`flex-1 h-10 rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 ${type === "expense" ? "bg-red-500 hover:bg-red-600 disabled:bg-red-300" : "bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300"}`}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enregistrer les modifications"}
          </button>
        </div>
      </form>
    </div>
  )
}
