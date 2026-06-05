"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Loader2, CheckCircle2, TrendingDown, TrendingUp, Camera, Mic, FileText, X, Video, Paperclip, AlertTriangle } from "lucide-react"
import { MediaUpload, type MediaUploadHandle } from "@/components/media/media-upload"
import { CategoryPicker } from "@/components/forms/category-picker"
import { useDatabase } from "@/hooks/use-database"
import { useNavigation } from "@/lib/navigation-context"
import type { MediaFile } from "@/lib/media-types"
import type { Category, Note, ProjectWithId } from "@/lib/types"

interface TransactionViewProps {
  preselectedProjectId?: number
  onSuccess: () => void
  onCancel: () => void
}

export function TransactionView({ preselectedProjectId, onSuccess, onCancel }: TransactionViewProps) {
  const { db } = useDatabase()
  const { navigate } = useNavigation()
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
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const audioRef = useRef<MediaUploadHandle | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const vidInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  const [eurToCfa, setEurToCfa] = useState(655.957)
  const [eurToUsd, setEurToUsd] = useState(1.0)
  const [cfaRateConfigured, setCfaRateConfigured] = useState(false)
  const [usdRateConfigured, setUsdRateConfigured] = useState(false)
  const [entryCurrencyOverride, setEntryCurrencyOverride] = useState<string | null>(null)

  const selectedProject = projects.find(p => String(p.id) === projectId)
  const projectCurrency = selectedProject?.currency || "EUR"
  const projectCurrencyCode = (projectCurrency === 'XOF' ? 'CFA' : projectCurrency).toUpperCase() as 'EUR' | 'CFA' | 'USD'
  const entryCurrency = (entryCurrencyOverride || projectCurrencyCode) as 'EUR' | 'CFA' | 'USD'

  const currencyLabel = (c: string) => c === 'CFA' ? 'F CFA' : c === 'USD' ? 'USD $' : 'EUR €'
  const currencySymbol = entryCurrency === "CFA" ? "F CFA" : entryCurrency === "USD" ? "$" : "€"

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

  const loadProjects = useCallback(async () => {
    if (!db) return
    try {
      const userData = JSON.parse(localStorage.getItem("expenshare_current_user") || "{}")
      const user = await db.users.getByName(userData.name)
      if (!user?.id) return
      const raw = await db.getUserProjects(user.id)
      const list = ((raw ?? []) as unknown as ProjectWithId[]).filter(p => p?.id != null)
      setProjects(list)
      if (!projectId && list.length === 1) setProjectId(String(list[0].id))
    } catch {}
  }, [db, projectId])

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
    setEntryCurrencyOverride(null)
  }, [projectId, type, loadCategories])

  useEffect(() => {
    if (!db || !projectId) return
    ;(async () => {
      try {
        const [cfa, usd] = await Promise.all([
          db.settings.get(`project:${projectId}:eur_to_cfa`),
          db.settings.get(`project:${projectId}:eur_to_usd`),
        ])
        const cfaVal = cfa?.value && Number(cfa.value) > 0 ? Number(cfa.value) : null
        const usdVal = usd?.value && Number(usd.value) > 0 ? Number(usd.value) : null
        setCfaRateConfigured(cfaVal !== null)
        setUsdRateConfigured(usdVal !== null)
        if (cfaVal) setEurToCfa(cfaVal)
        if (usdVal) setEurToUsd(usdVal)
      } catch {}
    })()
  }, [db, projectId])

  const convertToProjectCurrency = useCallback((amt: number): number => {
    if (entryCurrency === projectCurrencyCode) return amt
    let inEur: number
    if (entryCurrency === 'EUR') inEur = amt
    else if (entryCurrency === 'CFA') inEur = eurToCfa > 0 ? amt / eurToCfa : amt
    else inEur = eurToUsd > 0 ? amt / eurToUsd : amt
    if (projectCurrencyCode === 'EUR') return Math.round(inEur * 100) / 100
    if (projectCurrencyCode === 'CFA') return Math.round(inEur * eurToCfa)
    return Math.round(inEur * eurToUsd * 100) / 100
  }, [entryCurrency, projectCurrencyCode, eurToCfa, eurToUsd])

  const needsRateWarning = useMemo(() => {
    if (entryCurrency === projectCurrencyCode) return false
    const pair = [entryCurrency, projectCurrencyCode]
    if (pair.includes('CFA') && !cfaRateConfigured) return true
    if (pair.includes('USD') && !usdRateConfigured) return true
    return false
  }, [entryCurrency, projectCurrencyCode, cfaRateConfigured, usdRateConfigured])

  const formatPreview = useCallback((amt: number): string => {
    const cur = projectCurrencyCode === 'CFA' ? 'XOF' : projectCurrencyCode
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: cur,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: cur === 'XOF' ? 0 : 2,
    }).format(amt)
  }, [projectCurrencyCode])

  const handleAddCategory = useCallback(async (name: string, parentId: number | null): Promise<number> => {
    if (!db || !projectId) throw new Error("Projet non sélectionné")
    const parent = parentId ? categories.find(c => c.id === parentId) : null
    return db.categories.add({
      project_id: Number(projectId),
      name,
      parent_id: parentId ?? undefined,
      level: parent ? 2 : 1,
    })
  }, [db, projectId, categories])

  const handleCategoryAdded = useCallback((newId: number, name: string, parentId: number | null) => {
    setCategories(prev => [
      ...prev,
      { id: newId, project_id: Number(projectId), name, parent_id: parentId ?? undefined, level: parentId ? 2 : 1 } as Category & { id: number }
    ])
    window.dispatchEvent(new CustomEvent("expenshare:project-updated"))
  }, [projectId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!projectId) { setError("Sélectionnez un projet"); return }
    const rawAmount = Number(amount.replace(',', '.'))
    if (!amount || isNaN(rawAmount) || rawAmount <= 0) { setError("Montant invalide"); return }
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
      const submitAmount = convertToProjectCurrency(rawAmount)

      const txId = await db.transactions.add({
        project_id: Number(projectId),
        user_id: user.id!,
        category_id: categoryId ? Number(categoryId) : null,
        type,
        amount: submitAmount,
        title: txTitle,
        description,
      })

      if (txId && !Number.isNaN(txId)) {
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
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('expenshare:project-updated'))
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
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={e => {
                const raw = e.target.value.replace(',', '.')
                if (raw === '' || /^\d*\.?\d*$/.test(raw)) setAmount(raw)
              }}
              autoFocus
              className={`flex-1 text-5xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/25 w-full ${
                type === "expense" ? "text-red-600" : "text-blue-600"
              }`}
            />
            <span className={`text-2xl font-medium ${type === "expense" ? "text-red-400" : "text-blue-400"}`}>
              {currencySymbol}
            </span>
          </div>

          {projectId && (
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {(['EUR', 'CFA', 'USD'] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={e => { e.stopPropagation(); setEntryCurrencyOverride(c === projectCurrencyCode ? null : c) }}
                  className={`px-2.5 py-1 text-[11px] rounded-full border font-medium transition-colors ${
                    entryCurrency === c
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {currencyLabel(c)}
                </button>
              ))}
              {needsRateWarning && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); if (projectId) navigate({ type: 'project-settings', projectId: Number(projectId) }) }}
                  className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline ml-1"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Taux à configurer
                </button>
              )}
            </div>
          )}

          {entryCurrency !== projectCurrencyCode && amount && !isNaN(Number(amount.replace(',', '.'))) && Number(amount.replace(',', '.')) > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              ≈ <span className="font-semibold">{formatPreview(convertToProjectCurrency(Number(amount.replace(',', '.'))))}</span>
              {needsRateWarning && <span className="text-amber-500 ml-1">(taux par défaut)</span>}
            </p>
          )}
        </div>

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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">Pièces jointes</label>
            {mediaFiles.length > 0 && (
              <span className="text-xs text-muted-foreground">{mediaFiles.length} fichier{mediaFiles.length > 1 ? "s" : ""}</span>
            )}
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {[
              { icon: Camera,    label: "Photo",  color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/20",    action: () => imgInputRef.current?.click() },
              { icon: Mic,       label: isRecordingAudio ? recFmt : "Audio", color: isRecordingAudio ? "text-red-500" : "text-green-500", bg: isRecordingAudio ? "bg-red-50 dark:bg-red-950/20 animate-pulse" : "bg-green-50 dark:bg-green-950/20", action: () => { if (audioRef.current) { audioRef.current.getRecordingState() ? audioRef.current.stopAudioRecording() : audioRef.current.startAudioRecording() } } },
              { icon: Video,     label: "Vidéo",  color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/20", action: () => vidInputRef.current?.click() },
              { icon: Paperclip, label: "Doc",    color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/20", action: () => docInputRef.current?.click() },
              { icon: FileText,  label: "Note",   color: "text-amber-500",  bg: "bg-amber-50 dark:bg-amber-950/20",  action: () => setShowNote(v => !v) },
            ].map(({ icon: Icon, label, color, bg, action }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl ${bg} hover:opacity-80 transition-all`}
              >
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
              ref={audioRef}
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
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-10 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-medium"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isLoading || uploading}
            className={`flex-1 h-10 rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
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
