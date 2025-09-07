"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Minus, FileText, Loader2, Camera, Mic, Upload } from "lucide-react"
import { MediaUpload, type MediaUploadHandle } from "@/components/media/media-upload"
import { useDatabase } from "@/hooks/use-database"
import { MediaFile } from "@/lib/media-types"

interface TransactionFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function TransactionForm({ isOpen, onClose, onSuccess }: TransactionFormProps) {
  const { db } = useDatabase()
  const [projects, setProjects] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [formData, setFormData] = useState({
    projectId: "",
    categoryId: "",
    type: "expense" as "expense" | "budget",
    amount: "",
    title: "",
    description: "",
  })
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const audioUploadRef = useRef<MediaUploadHandle | null>(null)
  const [showDescriptionDialog, setShowDescriptionDialog] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [lastAudioSaved, setLastAudioSaved] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadUserProjects()
      resetForm()
    }
  }, [isOpen])

  useEffect(() => {
    if (formData.projectId && formData.type === "expense") {
      loadProjectCategories(Number.parseInt(formData.projectId))
    }
  }, [formData.projectId, formData.type])

  const resetForm = () => {
    setFormData({
      projectId: "",
      categoryId: "",
      type: "expense",
      amount: "",
      title: "",
      description: "",
    })
    setMediaFiles([])
    setError("")
  }

  const loadUserProjects = async () => {
    if (!db) return
    try {
      // Récupérer l'utilisateur courant
      const currentUserData = JSON.parse(localStorage.getItem("expenshare_current_user") || "{}")
      const currentUser = await db.getUserByName(currentUserData.name)

      if (!currentUser) return

      // Obtenir les projets de l'utilisateur
      const userProjects = await db.getUserProjects(currentUser.id)
      setProjects(userProjects)
    } catch (error) {
      console.error("Failed to load projects:", error)
    }
  }

  const loadProjectCategories = async (projectId: number) => {
    if (!db) return
    try {
      // Obtenir les catégories du projet
      const projectCategories = await db.getProjectCategories(projectId)
      
      // Trier les catégories par niveau puis par nom
  const sortedCategories = projectCategories.sort((a: any, b: any) => {
        if (a.level !== b.level) return a.level - b.level
        return a.name.localeCompare(b.name)
      })

      setCategories(sortedCategories)
    } catch (error) {
      console.error("Failed to load categories:", error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.projectId || !formData.amount || (formData.type === "budget" && !formData.title)) {
      setError("Veuillez remplir tous les champs obligatoires")
      return
    }
    
    // Pour les dépenses, assurez-vous qu'une catégorie est sélectionnée
    if (formData.type === "expense" && !formData.categoryId) {
      setError("Veuillez sélectionner une catégorie pour cette dépense")
      return
    }

    const amount = Number.parseFloat(formData.amount)
    if (isNaN(amount) || amount <= 0) {
      setError("Le montant doit être un nombre positif")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!db) throw new Error("Base de données non disponible")

      const currentUserData = JSON.parse(localStorage.getItem("expenshare_current_user") || "{}")
      const currentUser = await db.getUserByName(currentUserData.name)

      if (!currentUser) throw new Error("Utilisateur non trouvé")

      // Créer la transaction avec uniquement la description saisie (texte pur)
      const transactionId = await db.createTransaction({
        project_id: Number.parseInt(formData.projectId),
        user_id: currentUser.id!,
        category_id: formData.categoryId ? Number.parseInt(formData.categoryId) : null,
        type: formData.type,
        amount: amount,
        title: formData.title,
        description: formData.description
      })

      // Enregistrer les notes/médias en base (table notes) si présents
      if (db && transactionId) {
        // Note texte (si description non vide)
        if (formData.description && formData.description.trim().length > 0) {
          await db.notes.add({
            transaction_id: transactionId,
            content_type: "text",
            content: formData.description.trim(),
            file_path: undefined,
          } as any)
        }
        // Médias
        for (const media of mediaFiles) {
          // Convertir en data URL pour stockage texte portable
          let dataUrl = media.url
          if (!dataUrl && media.blob) {
            dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result))
              reader.onerror = () => reject(new Error("Failed to read file"))
              reader.readAsDataURL(media.blob!)
            })
          }
          await db.notes.add({
            transaction_id: transactionId,
            content_type: media.type === "image" ? "image" : media.type === "audio" ? "audio" : "text",
            content: dataUrl || media.name,
            file_path: media.name,
          } as any)
        }
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création de la transaction")
    } finally {
      setIsLoading(false)
    }
  }

  const handleMediaAdd = (media: MediaFile) => {
    setMediaFiles((prev) => [...prev, media])
  }

  const handleMediaRemove = (mediaId: string) => {
    setMediaFiles((prev) => {
      const media = prev.find((m) => m.id === mediaId)
      if (media?.url) {
        URL.revokeObjectURL(media.url)
      }
      return prev.filter((m) => m.id !== mediaId)
    })
  }

  const getCategoryDisplayName = (category: any) => {
    if (category.level === 1) {
      return category.name
    } else {
      const parentCategory = categories.find((c) => c.id === category.parent_id)
      return `${parentCategory?.name || ""} → ${category.name}`
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {formData.type === "expense" ? (
                <Minus className="h-5 w-5 text-red-500" />
              ) : (
                <Plus className="h-5 w-5 text-blue-500" />
              )}
              Nouvelle {formData.type === "expense" ? "Dépense" : "Entrée de Budget"}
            </DialogTitle>
            <DialogDescription>
              Ajoutez une {formData.type === "expense" ? "dépense" : "entrée de budget"} à votre projet
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={formData.type}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value as "expense" | "budget", categoryId: "" }))}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="expense" className="flex items-center gap-2">
                <Minus className="h-4 w-4" />
                Dépense
              </TabsTrigger>
              <TabsTrigger value="budget" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Budget
              </TabsTrigger>
            </TabsList>

            <TabsContent value={formData.type} className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="project">Projet *</Label>
                  <Select
                    value={formData.projectId}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, projectId: value, categoryId: "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez un projet" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          <div className="flex items-center gap-2">
                            <span>{project.icon}</span>
                            <span>{project.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.type === "expense" && categories.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="category">Catégorie (titre de la dépense)</Label>
                    <Select
                      value={formData.categoryId}
                      onValueChange={(value) => {
                        setFormData((prev) => ({ ...prev, categoryId: value }))
                        const selectedCategory = categories.find((c) => c.id.toString() === value)
                        if (selectedCategory && !formData.title) {
                          setFormData((prev) => ({ ...prev, title: selectedCategory.name }))
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez une catégorie" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id.toString()}>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{category.level === 2 ? "  └ " : ""}</span>
                              <span>{getCategoryDisplayName(category)}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="amount">Montant *</Label>
                  <div className="relative">
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                      required
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">
                    {formData.type === "expense" ? 
                      "Description additionnelle" : 
                      "Titre *"
                    }
                  </Label>
                  {formData.type === "expense" ? (
                    <Input
                      id="title"
                      placeholder="Description optionnelle"
                      value={formData.title}
                      onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id="title"
                      placeholder="Ex: Apport initial, Remboursement..."
                      value={formData.title}
                      onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Notes et fichiers</Label>
                  <div className="grid grid-cols-4 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Simuler le clic sur le bouton d'ajout d'images
                        document.getElementById("image-upload-btn")?.click();
                      }}
                      className="flex-1"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Images
                    </Button>
                    
                    <Button
                      type="button"
                      variant={isRecordingAudio ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => {
                        if (!audioUploadRef.current) return
                        if (audioUploadRef.current.getRecordingState()) {
                          audioUploadRef.current.stopAudioRecording()
                        } else {
                          audioUploadRef.current.startAudioRecording()
                        }
                      }}
                      className="flex-1"
                    >
                      <Mic className="h-4 w-4 mr-2" />
                      {isRecordingAudio ? `Arrêter (${Math.floor(recordingSeconds/60)}:${String(recordingSeconds%60).padStart(2,'0')})` : "Audio"}
                    </Button>
                    
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Simuler le clic sur le bouton d'ajout de fichiers
                        document.getElementById("file-upload-btn")?.click();
                      }}
                      className="flex-1"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Fichiers
                    </Button>
                    
                    {/* Composants MediaUpload invisibles mais liés à l'état */}
                    <div className="hidden">
                      <MediaUpload
                        id="image-upload-btn"
                        onMediaAdd={handleMediaAdd}
                        onMediaRemove={handleMediaRemove}
                        mediaFiles={mediaFiles}
                        maxFiles={10}
                        acceptedTypes={["image/*"]}
                      />
                      
                      <MediaUpload
                        id="audio-upload-btn"
                        ref={audioUploadRef as any}
                        onMediaAdd={(m) => { handleMediaAdd(m); setLastAudioSaved(m.name) }}
                        onMediaRemove={handleMediaRemove}
                        mediaFiles={mediaFiles}
                        maxFiles={10}
                        acceptedTypes={["audio/*"]}
                        onRecordingStart={() => { setIsRecordingAudio(true); setRecordingSeconds(0) }}
                        onRecordingStop={() => { setIsRecordingAudio(false) }}
                        onRecordingTimeTick={(s) => setRecordingSeconds(s)}
                      />
                      
                      <MediaUpload
                        id="file-upload-btn"
                        onMediaAdd={handleMediaAdd}
                        onMediaRemove={handleMediaRemove}
                        mediaFiles={mediaFiles}
                        maxFiles={10}
                        acceptedTypes={["application/*", "text/*", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"]}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDescriptionDialog(true)}
                      className="flex-1"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </div>

                  {mediaFiles.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {mediaFiles.length} fichier(s) joint(s)
                      <ul className="mt-1 space-y-0.5">
                        {mediaFiles.slice(0, 3).map((m) => (
                          <li key={m.id} className="truncate">
                            <span className="uppercase mr-1 text-muted-foreground">[{m.type}]</span>
                            {m.name}
                          </li>
                        ))}
                        {mediaFiles.length > 3 && (
                          <li className="text-muted-foreground">… et {mediaFiles.length - 3} autres</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {formData.description && <div className="text-xs text-muted-foreground">Description ajoutée</div>}
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={onClose} className="flex-1 bg-transparent">
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isLoading} className="flex-1">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enregistrement...
                      </>
                    ) : (
                      "Enregistrer"
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={showDescriptionDialog} onOpenChange={setShowDescriptionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Description de la transaction</DialogTitle>
            <DialogDescription>
              Ajoutez des détails supplémentaires à votre {formData.type === "expense" ? "dépense" : "budget"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Détails supplémentaires..."
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={4}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDescriptionDialog(false)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button type="button" onClick={() => setShowDescriptionDialog(false)} className="flex-1">
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
