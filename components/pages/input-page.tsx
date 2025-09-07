"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, FolderPlus, Settings, FolderTree } from "lucide-react"
import { ProjectForm } from "@/components/forms/project-form"
import { TransactionForm } from "@/components/forms/transaction-form"
import { CategoryForm } from "@/components/forms/category-form"
import { ProjectSettingsForm } from "@/components/forms/project-settings-form"
import { useUserProjects } from "@/hooks/use-database"

export function InputPage() {
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [selectedProjectForCategories, setSelectedProjectForCategories] = useState<number | null>(null)
  const [selectedProjectForSettings, setSelectedProjectForSettings] = useState<number | null>(null)
  const [userId, setUserId] = useState<number | null>(null)

  // Get user ID
  useEffect(() => {
    const storedUser = localStorage.getItem("expenshare_user")
    if (storedUser) {
      const userData = JSON.parse(storedUser)
      setUserId(userData.id)
    }
  }, [])

  const { projects, isLoading, refetch } = useUserProjects(userId || 0)

  const handleProjectSuccess = () => {
    refetch()
  }

  const handleTransactionSuccess = () => {
    // Refresh data if needed
  }

  const handleCategorySuccess = () => {
    // Géré par handleProjectSettingsSuccess
    refetch()
  }

  const handleProjectSettingsSuccess = () => {
    refetch()
  }

  const openCategoryForm = (projectId: number) => {
    // Ouvrir directement les paramètres du projet avec l'onglet catégories activé
    setSelectedProjectForCategories(projectId)
    setSelectedProjectForSettings(projectId)
    setShowProjectSettings(true)
  }
  
  const openProjectSettings = (projectId: number) => {
    setSelectedProjectForSettings(projectId)
    setShowProjectSettings(true)
  }

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Saisie</h2>
        <p className="text-muted-foreground">Ajoutez des dépenses, budgets et projets</p>
      </div>

      <div className="grid gap-4">
        {/* Nouveau Projet */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5" />
              Nouveau Projet
            </CardTitle>
            <CardDescription>Créez un nouveau projet pour organiser vos dépenses</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => setShowProjectForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un projet
            </Button>
          </CardContent>
        </Card>

        {/* Saisie de dépenses/budgets */}
        <Card className={projects.length === 0 ? "opacity-50" : ""}>
          <CardHeader>
            <CardTitle>Saisie de dépenses/budgets</CardTitle>
            <CardDescription>Ajoutez des transactions à vos projets existants</CardDescription>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Créez d'abord un projet pour pouvoir saisir des dépenses
              </p>
            ) : (
              <Button className="w-full" onClick={() => setShowTransactionForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle transaction
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Gestion des projets existants */}
        {projects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Gestion des Projets
              </CardTitle>
              <CardDescription>Configurez vos projets existants et leurs catégories</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {projects.map((project) => (
                    <div key={project.id} className="border rounded-lg overflow-hidden hover:bg-accent/50 transition-colors h-full flex flex-col">
                      <div 
                        className="p-4 flex items-center gap-3 cursor-pointer flex-grow" 
                        onClick={() => setShowTransactionForm(true)}
                      >
                        <div className="flex-shrink-0 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-2xl">{project.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">{project.name}</h4>
                          {project.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
                          )}
                          <Badge variant="outline" className="mt-1">
                            {project.role}
                          </Badge>
                        </div>
                      </div>
                      <div className="p-3 pt-0">
                        <Button variant="outline" size="sm" onClick={() => openProjectSettings(project.id)} className="w-full">
                          <Settings className="h-4 w-4 mr-1" />
                          Paramètres
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Forms */}
      <ProjectForm
        isOpen={showProjectForm}
        onClose={() => setShowProjectForm(false)}
        onSuccess={handleProjectSuccess}
      />

      <TransactionForm
        isOpen={showTransactionForm}
        onClose={() => setShowTransactionForm(false)}
        onSuccess={handleTransactionSuccess}
      />

      {/* Nous n'avons plus besoin de ce composant séparé pour les catégories car nous utilisons l'onglet catégories des paramètres */}

      {selectedProjectForSettings && (
        <ProjectSettingsForm 
          isOpen={showProjectSettings}
          onClose={() => {
            setShowProjectSettings(false)
            setSelectedProjectForSettings(null)
          }}
          onSuccess={handleProjectSettingsSuccess}
          projectId={selectedProjectForSettings}
          activeTab={selectedProjectForCategories ? "categories" : "general"}
        />
      )}
    </div>
  )
}
