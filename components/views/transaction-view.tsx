"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Loader2, CheckCircle2, TrendingDown, TrendingUp, Camera, Mic, Upload, FileText, X, Video } from "lucide-react"
import { MediaUpload, type MediaUploadHandle } from "@/components/media/media-upload"
import { CategoryPicker } from "@/components/forms/category-picker"
import { useDatabase } from "@/hooks/use-database"
import type { MediaFile } from "@/lib/media-types"
import type { Category, Note, ProjectWithId } from "@/lib/types"

interface TransactionViewProps {
  preselectedProjectId?: number
  onSuccess: () => void
  onCancel: () => void
}

export function TransactionView({ preselectedProjectId, onSuccess, onCancel }: TransactionViewProps) {
  const { db } = useDatabase()
  const [projects, setProjects] = useState<ProjectWithId[]>([])
  const [categories, setCategories] = useState<(Category & { id: number })[]>([])
  const [type, setType] = useState<"expense" | "budget">("expense")
  const [projectId, setProjectId] = useState(preselectedProjectId ? String(preselectedProjectId) : "")
  const [categoryId, setCategoryId] = useState("")
  const [amount, setAmount] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [showNote, setShowNote] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const audioRef = useRef<MediaUploadHandle | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const selectedProject = projects.find(p => String(p.id) === projectId)
  const projectCurrency = selectedProject?.currency || "EUR"
  const currencySymbol = projectCurrency === "CFA" ? "F CFA" : projectCurrency === "USD" ? "$" : "€"

  // ─── Chargement projets ───────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    if (!db) return
    try {
      const userData = JSON.parse(localStorage.getItem("expenshare_current_user") || "{}")
      const user = await db.users.getByName(userData.name)
      if (!user?.id) return
      const raw = await db.getUserProjects(user.id)
      const list = ((raw ?? []) as unknown as ProjectWithId[]).filter(p => p?.id != null)
      setProjects(list)
      // Auto-sélection si un seul projet
      if (!projectId && list.length === 1) setProjectId(String(list[0].id))
    } catch {}
  }, [db, projectId])

  // ─── Chargement catégories ────────────────────────────────────────────────
  const loadCategories = useCallback(async (pid: number) => {
    if (!db) return
    try {
      const cats = await db.getProjectCategories(pid)
      setCategories(
        cats
          .filter((c): c is Category & { id: number } => c.id !== undefined)
          .sort((a, b) => a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name))
      )
    } catch {}
  }, [db])

  useEffect(() => {
    loadProjects()
    if (preselectedProjectId) loadCategories(preselectedProjectId)
  }, [loadProjects, preselectedProjectId, loadCategories])

  useEffect(() => {
    if (projectId && type === "expense") loadCategories(Number(projectId))
    setCategoryId("")
    setTitle("")
  }, [projectId, type, loadCategories])

  // ─── Ajout de catégorie inline ────────────────────────────────────────────
  const handleAddCategory = useCallback(async (name: string, parentId: number | null): Promise<number> => {
    if (!db || !projectId) throw new Error("Projet non sélectionné")
    const parent = parentId ? categories.find(c => c.id === parentId) : null
    const level = parent ? 2 : 1
    const newId = await db.categories.add({
      project_id: Number(projectId),
      name,
      parent_id: parentId ?? undefined,
      level,
    })
    return newId
  }, [db, projectId, categories])

  const handleCategoryAdded = useCallback((newId: number, name: string, parentId: number | null) => {
    setCategories(prev => [
      ...prev,
      { id: newId, project_id: Number(projectId), name, parent_id: parentId ?? undefined, level: parentId ? 2 : 1 } as Category & { id: number }
    ])
    // Dispatch pour mettre à jour les autres composants
    window.dispatchEvent(new CustomEvent("expenshare:project-updated"))
  }, [projectId])

  // ─── Soumission ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!projectId) { setError("Sélectionnez un projet"); return }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { setError("Montant invalide"); return }
    if (type === "expense" && !categoryId) { setError("Sélectionnez ou créez une catégorie"); return }
    if (type === "budget" && !title.trim()) { setError("Le titre est obligatoire pour un budget"); return }

    setIsLoading(true)
    try {
      if (!db) throw new Error("Base de données non disponible")
      const userData = JSON.parse(localStorage.getItem("expenshare_current_user") || "{}")
      const user = await db.users.getByName(userData.name)
      if (!user) throw new Error("Utilisateur non trouvé")

      const selectedCat = categories.find(c => String(c.id) === categoryId)
      const txTitle = title.trim() || selectedCat?.name || ""

      const txId = await db.transactions.add({
        project_id: Number(projectId),
        user_id: user.id!,
        category_id: categoryId ? Number(categoryId) : null,
        type,
        amount: Number(amount),
        title: txTitle,
        description,
      })

      if (txId) {
        if (description.trim()) {
          await db.notes.add({ transaction_id: txId, content_type: "text", content: description.trim(), file_path: undefined } as Note)
        }
        for (const media of mediaFiles) {
          await db.notes.add({
            transaction_id: txId,
            content_type: media.type === "image" ? "image" : media.type === "audio" ? "audio" : media.type === "video" ? "video" : "text",
            content: media.url,
            file_path: media.name,
          } as Note)
        }
      }

      setSuccess(true)
      setTimeout(onSuccess, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement")
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Succès ───────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 gap-4">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${type === "expense" ? "bg-red-100 dark:bg-red-950/30" : "bg-blue-100 dark:bg-blue-950/30"}`}>
          <CheckCircle2 className={`h-10 w-10 ${type === "expense" ? "text-red-500" : "text-blue-500"}`} />
        </div>
        <p className="text-xl font-bold">{type === "expense" ? "Dépense" : "Budget"} enregistré !</p>
        <p className="text-sm text-muted-foreground">Retour en cours…</p>
      </div>
    )
  }

  const recFmt = `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}`

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-10 space-y-5">

      {/* ─── Type switcher ─── */}
      <div className="flex gap-2 p-1 bg-muted rounded-2xl">
        {(["expense", "budget"] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { setType(t); setCategoryId(""); setTitle("") }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
              type === t
                ? t === "expense"
                  ? "bg-white dark:bg-card shadow text-red-600"
                  : "bg-white dark:bg-card shadow text-blue-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "expense" ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            {t === "expense" ? "Dépense" : "Budget"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ─── Montant ─── */}
        <div
          onClick={() => amountRef.current?.focus()}
          className={`bg-card border-2 rounded-2xl p-5 cursor-text transition-colors ${
            amount ? (type === "expense" ? "border-red-200 dark:border-red-800" : "border-blue-200 dark:border-blue-800") : "border-border"
          }`}
        >
          <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2 block">
            Montant *
          </label>
          <div className="flex items-baseline gap-3">
            <input
              ref={amountRef}
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

        {/* ─── Projet ─── */}
        <div className="space-y-2">
          <label className="text-sm font-semibold">Projet *</label>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 rounded-xl bg-muted">Aucun projet disponible</p>
          ) : (preselectedProjectId && selectedProject) || projects.length === 1 ? (
            <div className="flex items-center gap-3 h-12 px-4 rounded-xl border border-border bg-muted/30">
              <span className="text-lg">{(preselectedProjectId ? selectedProject : projects[0])?.icon}</span>
              <span className="text-sm font-medium">{(preselectedProjectId ? selectedProject : projects[0])?.name}</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
              {projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProjectId(String(p.id))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    projectId === String(p.id)
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card border-border hover:border-primary/50 hover:bg-muted/60"
                  }`}
                >
                  <span>{p.icon}</span>
                  <span className="max-w-[120px] truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── Catégorie (dépense) ─── */}
        {type === "expense" && (
          <div className="space-y-2">
            <label className="text-sm font-semibold">
              Catégorie *
              {!projectId && <span className="ml-2 text-xs font-normal text-muted-foreground">— sélectionnez d'abord un projet</span>}
            </label>
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              projectId={projectId}
              onSelect={(id, name) => {
                setCategoryId(id)
                if (id && !title) setTitle(name)
              }}
              onCategoryAdded={handleCategoryAdded}
              onAddCategory={handleAddCategory}
              disabled={!projectId}
            />
          </div>
        )}

        {/* ─── Titre budget ─── */}
        {type === "budget" && (
          <div className="space-y-2">
            <label className="text-sm font-semibold">Titre du budget *</label>
            <input
              type="text"
              placeholder="Ex : Apport initial, Remboursement…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all text-sm"
              required
            />
          </div>
        )}

        {/* ─── Description optionnelle (dépense) ─── */}
        {type === "expense" && (
          <div className="space-y-2">
            <label className="text-sm font-semibold text-muted-foreground">Description (optionnelle)</label>
            <input
              type="text"
              placeholder="Précisions…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm"
            />
          </div>
        )}

        {/* ─── Pièces jointes ─── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">Pièces jointes</label>
            {mediaFiles.length > 0 && (
              <span className="text-xs text-muted-foreground">{mediaFiles.length} fichier{mediaFiles.length > 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Boutons media */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Camera, label: "Photo", id: "tv-img", color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/20" },
              {
                icon: Mic,
                label: isRecordingAudio ? recFmt : "Audio",
                id: "tv-aud",
                color: isRecordingAudio ? "text-red-500" : "text-green-500",
                bg: isRecordingAudio ? "bg-red-50 dark:bg-red-950/20 animate-pulse" : "bg-green-50 dark:bg-green-950/20",
              },
              { icon: Video, label: "Vidéo", id: "tv-vid", color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/20" },
              { icon: FileText, label: "Note", id: "tv-note", color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/20" },
            ].map(({ icon: Icon, label, id, color, bg }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === "tv-note") { setShowNote(v => !v); return }
                  if (id === "tv-aud" && audioRef.current) {
                    audioRef.current.getRecordingState()
                      ? audioRef.current.stopAudioRecording()
                      : audioRef.current.startAudioRecording()
                    return
                  }
                  document.getElementById(id)?.click()
                }}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl ${bg} hover:opacity-80 transition-all`}
              >
                <Icon className={`h-5 w-5 ${color}`} />
                <span className="text-[10px] font-medium text-muted-foreground leading-none">{label}</span>
              </button>
            ))}
          </div>

          {/* Note textarea */}
          {showNote && (
            <div className="relative">
              <textarea
                placeholder="Votre note…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm resize-none pr-8"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowNote(false)}
                className="absolute top-2 right-2 p-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Fichiers joints */}
          {mediaFiles.length > 0 && (
            <MediaUpload
              onMediaAdd={m => setMediaFiles(p => [...p, m])}
              onMediaRemove={id => setMediaFiles(p => p.filter(m => m.id !== id))}
              mediaFiles={mediaFiles}
              maxFiles={10}
            />
          )}

          {/* Inputs cachés */}
          <div className="hidden">
            <MediaUpload id="tv-img" onMediaAdd={m => setMediaFiles(p => [...p, m])} onMediaRemove={id => setMediaFiles(p => p.filter(m => m.id !== id))} mediaFiles={mediaFiles} maxFiles={10} acceptedTypes={["image/*"]} />
            <MediaUpload id="tv-aud" ref={audioRef} onMediaAdd={m => setMediaFiles(p => [...p, m])} onMediaRemove={id => setMediaFiles(p => p.filter(m => m.id !== id))} mediaFiles={mediaFiles} maxFiles={5} acceptedTypes={["audio/*"]} onRecordingStart={() => { setIsRecordingAudio(true); setRecordingSeconds(0) }} onRecordingStop={() => setIsRecordingAudio(false)} onRecordingTimeTick={s => setRecordingSeconds(s)} />
            <MediaUpload id="tv-vid" onMediaAdd={m => setMediaFiles(p => [...p, m])} onMediaRemove={id => setMediaFiles(p => p.filter(m => m.id !== id))} mediaFiles={mediaFiles} maxFiles={5} acceptedTypes={["video/*"]} />
            <MediaUpload id="tv-file" onMediaAdd={m => setMediaFiles(p => [...p, m])} onMediaRemove={id => setMediaFiles(p => p.filter(m => m.id !== id))} mediaFiles={mediaFiles} maxFiles={10} acceptedTypes={["application/*", ".pdf", ".doc", ".docx", ".xls", ".xlsx"]} />
          </div>
        </div>

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
            onClick={onCancel}
            className="flex-1 h-13 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-medium"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className={`flex-1 h-13 rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              type === "expense"
                ? "bg-red-500 hover:bg-red-600 disabled:bg-red-300"
                : "bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300"
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              `Enregistrer ${type === "expense" ? "la dépense" : "le budget"}`
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
