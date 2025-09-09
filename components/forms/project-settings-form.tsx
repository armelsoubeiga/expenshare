"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { FolderPlus, Plus, X, Users, Loader2, Save, Settings, User } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"
import { Category } from "@/lib/types"

interface ProjectSettingsFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  projectId: number
  activeTab?: string
}

// Restreindre aux 3 devises demandées
const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "Dollar US" },
  // Utiliser le code "CFA" pour l'UX, on convertira en "XOF" pour l'affichage si nécessaire
  { code: "CFA", symbol: "CFA", name: "Franc CFA" },
]

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

export function ProjectSettingsForm({ isOpen, onClose, onSuccess, projectId, activeTab = "details" }: ProjectSettingsFormProps) {
  const { toast } = useToast()
  const { db } = useDatabase()
  const [project, setProject] = useState<any>(null)
  const [projectUsers, setProjectUsers] = useState<any[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [currentTab, setCurrentTab] = useState(activeTab)
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "📁",
    color: "#3b82f6",
    currency: "EUR",
  })
  // Taux de conversion spécifiques au projet (1 € = …)
  const [eurToCfa, setEurToCfa] = useState<string>("")
  const [eurToUsd, setEurToUsd] = useState<string>("")

  const [newCategory, setNewCategory] = useState("")
  const [newSubcategory, setNewSubcategory] = useState("")
  const [selectedCategoryForSub, setSelectedCategoryForSub] = useState<number | null>(null)
  
  const [newUserId, setNewUserId] = useState<string | null>(null)
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [isRemovingUser, setIsRemovingUser] = useState<string | null>(null)
  
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen && projectId && db) {
      loadProjectData()
      // Mettre à jour l'onglet actif si les props changent
      setCurrentTab(activeTab)
    }
  }, [isOpen, projectId, db, activeTab])

  const loadProjectData = async () => {
    if (!db) return
    setIsLoading(true)
    
    try {
      // Charger les infos du projet
      const projectData = await db.getProjectById(projectId)
      if (projectData) {
        setProject(projectData)
        // Charger le code de devise et normaliser 'XOF' vers 'CFA'
        const dbCurrency = (projectData.currency as string) || 'EUR'
        const uiCurrency = dbCurrency === 'XOF' ? 'CFA' : dbCurrency
        setFormData({
          name: projectData.name,
          description: projectData.description || "",
          icon: projectData.icon,
          color: projectData.color,
          currency: uiCurrency,
        })
      }
      
      // Charger les catégories
      const projectCategories = await db.categories
        .where("project_id")
        .equals(projectId)
        .toArray()
        
      setCategories(projectCategories)
      
      // Charger tous les utilisateurs
      const users = await db.users.toArray()
      setAllUsers(users)
      
      // Charger les utilisateurs du projet
      const projectUserRecords = await db.project_users
        .where("project_id")
        .equals(projectId)
        .toArray()
        
      const projUsers = await Promise.all(
        projectUserRecords.map(async (pu: any) => {
          const user = await db.users.get(pu.user_id)
          return user ? { ...user, role: pu.role } : null
        })
      )
      
      setProjectUsers(projUsers.filter(Boolean))
      // Charger les taux de conversion projet (si définis)
      try {
        const cfa = await db.settings.get(`project:${projectId}:eur_to_cfa`)
        const usd = await db.settings.get(`project:${projectId}:eur_to_usd`)
        if (cfa?.value) setEurToCfa(String(cfa.value))
        if (usd?.value) setEurToUsd(String(usd.value))
      } catch (e) {
        // ignorer
      }
      
    } catch (error) {
      console.error("Failed to load project data:", error)
      setError("Erreur lors du chargement des données du projet")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveProject = async () => {
    if (!db) return
    setIsLoading(true)
    setError("")
    
    try {
      // Valider que le nom du projet n'est pas vide
      if (!formData.name.trim()) {
        setError("Le nom du projet est obligatoire")
        return
      }

      // Mettre à jour les données du projet (enregistrer directement le code de devise choisi)
      const updatedProject = await db.updateProject(projectId, {
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        color: formData.color,
        currency: formData.currency
      })

  if (updatedProject) {
        // Sauvegarder les taux de conversion projet si fournis (ignorer si db.settings indisponible)
        if (eurToCfa) {
          try { await db.settings.put({ key: `project:${projectId}:eur_to_cfa`, value: eurToCfa }) } catch { /* skip */ }
        }
        if (eurToUsd) {
          try { await db.settings.put({ key: `project:${projectId}:eur_to_usd`, value: eurToUsd }) } catch { /* skip */ }
        }

  // Recharger entièrement les données du projet (devise et taux) pour garantir la cohérence
  await loadProjectData()

        // Notifier l'app du changement de devise projet
        const detail = {
          projectId,
          currency: formData.currency,
          eurToCfa,
          eurToUsd,
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('expenshare:project-currency-changed', { detail }))
          // Event pour rechargement général des données
          window.dispatchEvent(new CustomEvent('expenshare:project-updated', { detail: { projectId } }))
        }

        // Afficher un toast de succès
        toast({
          title: "Projet mis à jour",
          description: "Les modifications ont été enregistrées avec succès.",
          variant: "default"
        })

  // Fermer le formulaire et notifier le succès
  onSuccess()
  onClose()
      } else {
        setError("Erreur lors de la mise à jour du projet")
      }
    } catch (error) {
      console.error("Failed to update project:", error)
      setError("Erreur lors de la mise à jour du projet")
    } finally {
      setIsLoading(false)
    }
  }
  
  const addCategory = async () => {
    if (!newCategory.trim() || !db) return
    setIsLoading(true)
    
    try {
      await db.categories.add({
        project_id: projectId,
        name: newCategory.trim(),
        level: 1,
        parent_id: undefined,
      })
      
      setNewCategory("")
      await loadProjectData() // Recharger les catégories
    } catch (error) {
      console.error("Failed to add category:", error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const addSubcategory = async () => {
    if (!newSubcategory.trim() || !selectedCategoryForSub || !db) return
    setIsLoading(true)
    
    try {
      await db.categories.add({
        project_id: projectId,
        name: newSubcategory.trim(),
        level: 2,
        parent_id: selectedCategoryForSub,
      })
      
      setNewSubcategory("")
      await loadProjectData() // Recharger les catégories
    } catch (error) {
      console.error("Failed to add subcategory:", error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const addUserToProject = async () => {
    if (!db || !newUserId) return
    
    setIsAddingUser(true)
    try {
  // Vérifier que l'utilisateur n'est pas déjà dans le projet
  if (projectUsers.some(user => String(user.id) === String(newUserId))) {
        setError("Cet utilisateur est déjà dans le projet")
        return
      }
      
      // Ajouter l'utilisateur au projet avec un rôle par défaut
      await db.project_users.add({
        project_id: projectId,
        user_id: newUserId as any,
        role: "member",
        added_at: new Date()
      })

  // Recharger la liste depuis la DB pour garantir cohérence (RLS etc.)
      await loadProjectData()
      setNewUserId(null)
      
    } catch (error: any) {
      console.error("Failed to add user to project:", error)
      const msg = (error && error.message) ? String(error.message) : "Erreur lors de l'ajout de l'utilisateur au projet"
      setError(msg)
      // Avertissements spécifiques
      if (msg.includes('Seul le propriétaire du projet') || msg.includes("L'administrateur doit faire partie du projet")) {
        toast({
          title: "Action non autorisée",
          description: msg,
          variant: "destructive"
        })
      } else {
        toast({ title: "Échec de l'ajout", description: msg, variant: "destructive" })
      }
    } finally {
      setIsAddingUser(false)
    }
  }
  
  const removeUserFromProject = async (userId: string | number) => {
    if (!db) return
    
    setIsRemovingUser(String(userId))
    try {
      // Supprimer l'utilisateur du projet
      await db.project_users.remove(projectId, userId)

  // Recharger la liste depuis la DB
  await loadProjectData()
      
    } catch (error: any) {
      console.error("Failed to remove user from project:", error)
      const msg = (error && error.message) ? String(error.message) : "Erreur lors de la suppression de l'utilisateur du projet"
      setError(msg)
      // Avertissements spécifiques
      if (msg.includes('Impossible de retirer le propriétaire')) {
        toast({
          title: "Propriétaire non retirable",
          description: "Vous ne pouvez pas retirer le propriétaire du projet.",
          variant: "destructive"
        })
      } else if (msg.includes('Seul le propriétaire du projet') || msg.includes('administrateur')) {
        toast({
          title: "Action non autorisée",
          description: "Vous n'avez pas la permission de retirer cet utilisateur.",
          variant: "destructive"
        })
      } else {
        toast({ title: "Échec de la suppression", description: msg, variant: "destructive" })
      }
    } finally {
  setIsRemovingUser(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Paramètres du projet
          </DialogTitle>
          <DialogDescription>Configurez les paramètres du projet</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="my-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading && !project ? (
          <div className="flex justify-center p-6">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue={currentTab} className="mt-4" onValueChange={setCurrentTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">Général</TabsTrigger>
              <TabsTrigger value="categories">Catégories</TabsTrigger>
              <TabsTrigger value="users">Utilisateurs</TabsTrigger>
              <TabsTrigger value="currency">Devise</TabsTrigger>
            </TabsList>

            {/* Onglet Général */}
            <TabsContent value="general" className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du projet</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optionnel)</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Icône</Label>
                  <div className="flex flex-wrap gap-2">
                    {PROJECT_ICONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon })}
                        className={`text-2xl p-2 rounded-md ${
                          formData.icon === icon ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted"
                        }`}
                        aria-label={`Choisir l'icône ${icon}`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Couleur</Label>
                  <div className="flex flex-wrap gap-2">
                    {PROJECT_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, color: color.value })}
                        className={`w-7 h-7 rounded-full border-2 ${
                          formData.color === color.value ? "border-primary ring-2 ring-primary" : "border-muted"
                        }`}
                        style={{ backgroundColor: color.value }}
                        aria-label={`Choisir la couleur ${color.name}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

                  {/* Onglet Devise */}
                  <TabsContent value="currency" className="space-y-4 py-4">
                <div className="space-y-4">
                  <div>
                    <Label>Devise</Label>
                    <Select
                      value={formData.currency}
                      onValueChange={value => setFormData({ ...formData, currency: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une devise" />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(currency => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.symbol} - {currency.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1">
                      <Label>1 € = (CFA)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={eurToCfa}
                        onChange={e => setEurToCfa(e.target.value)}
                      />
                    </div>
                    <div className="flex-1">
                      <Label>1 € = (USD)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={eurToUsd}
                        onChange={e => setEurToUsd(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button onClick={handleSaveProject} disabled={isLoading} className="mt-4">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Enregistrer les modifications
                  </Button>
                </div>
            </TabsContent>

            {/* Onglet Catégories */}
            <TabsContent value="categories" className="py-4">
              <div className="space-y-6">
                {/* Ajouter une catégorie */}
                <div className="space-y-2">
                  <Label>Ajouter une catégorie</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nom de la catégorie"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                    />
                    <Button type="button" onClick={addCategory} disabled={isLoading || !newCategory.trim()}>
                      <Plus className="h-4 w-4 mr-1" />
                      Ajouter
                    </Button>
                  </div>
                </div>

                {/* Ajouter une sous-catégorie */}
                <div className="space-y-2">
                  <Label>Ajouter une sous-catégorie</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={selectedCategoryForSub?.toString() || ""}
                      onValueChange={(value) => setSelectedCategoryForSub(Number(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une catégorie" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories
                          .filter((cat) => cat.level === 1)
                          .map((cat) => (
                            <SelectItem key={cat.id} value={cat.id!.toString()}>
                              {cat.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nom de la sous-catégorie"
                        value={newSubcategory}
                        onChange={(e) => setNewSubcategory(e.target.value)}
                      />
                      <Button
                        type="button"
                        onClick={addSubcategory}
                        disabled={isLoading || !newSubcategory.trim() || !selectedCategoryForSub}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Liste des catégories et sous-catégories */}
                <div className="space-y-4">
                  <Label>Catégories existantes</Label>
                  <div className="space-y-3">
                    {categories
                      .filter((cat) => cat.level === 1)
                      .map((mainCat) => (
                        <div key={mainCat.id} className="border rounded-md p-3">
                          <div className="flex justify-between items-center">
                            <div className="font-medium">{mainCat.name}</div>
                          </div>
                          <div className="mt-2 pl-4 space-y-1">
                            {categories
                              .filter((subCat) => subCat.parent_id === mainCat.id)
                              .map((subCat) => (
                                <div key={subCat.id} className="flex justify-between items-center py-1">
                                  <div className="text-sm">{subCat.name}</div>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Onglet Utilisateurs */}
            <TabsContent value="users" className="py-4">
              <div className="space-y-4">
                {/* Ajouter un utilisateur */}
                <div className="space-y-2">
                  <Label>Ajouter un utilisateur au projet</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Select
                      onValueChange={(value) => {
                        const selectedUser = allUsers.find((user) => user.id.toString() === value);
                        if (selectedUser && !projectUsers.some((pu) => String(pu.id) === value)) {
                          setNewUserId(value);
                        }
                      }}
                    >
                      <SelectTrigger className="col-span-2">
                        <SelectValue placeholder="Sélectionner un utilisateur" />
                      </SelectTrigger>
                      <SelectContent>
                        {allUsers
                          .filter((user) => !projectUsers.some((pu) => pu.id === user.id))
                          .map((user) => (
                            <SelectItem key={user.id} value={user.id.toString()}>
                              {user.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={addUserToProject} 
                      disabled={!newUserId || isAddingUser}
                    >
                      {isAddingUser ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Ajouter
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Liste des utilisateurs du projet */}
                <div className="space-y-2">
                  <Label>Utilisateurs actuels</Label>
                  <div className="border rounded-md divide-y">
                    {projectUsers.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground text-center">
                        Aucun utilisateur dans ce projet
                      </p>
                    ) : (
                      projectUsers.map((user) => (
                        <div key={user.id} className="flex justify-between items-center p-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground">{user.role}</p>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              if (user.role === 'owner') {
                                toast({
                                  title: "Propriétaire non retirable",
                                  description: "Vous ne pouvez pas retirer le propriétaire du projet.",
                                  variant: "destructive"
                                })
                                return
                              }
                              removeUserFromProject(user.id)
                            }}
                            disabled={isRemovingUser === user.id}
                          >
                            {isRemovingUser === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
