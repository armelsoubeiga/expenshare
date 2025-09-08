"use client"

import { useState, useEffect } from "react"
import { BottomNavigation } from "./bottom-navigation"
import { TopHeader } from "./top-header"
import { HomePage } from "@/components/pages/home-page"
import { StatsPage } from "@/components/pages/stats-page"
import { InputPage } from "@/components/pages/input-page"
import { LoadingPage } from "@/components/ui/loading-spinner"
import { useDatabase } from "@/hooks/use-database"

interface MainLayoutProps {
  onLogout: () => void
}

export type TabType = "home" | "stats" | "input"

export function MainLayout({ onLogout }: MainLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabType>("home")
  const { isReady, error } = useDatabase()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        switch (e.key) {
          case "1":
            e.preventDefault()
            setActiveTab("home")
            break
          case "2":
            e.preventDefault()
            setActiveTab("stats")
            break
          case "3":
            e.preventDefault()
            setActiveTab("input")
            break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <HomePage />
      case "stats":
        return <StatsPage />
      case "input":
        return <InputPage />
      default:
        return <HomePage />
    }
  }

  // Montre l'erreur en priorité, sinon on reste bloqué sur le spinner
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold text-destructive">Erreur de base de données</h2>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded"
          >
            Recharger
          </button>
        </div>
      </div>
    )
  }

  if (!isReady) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopHeader onLogout={onLogout} />

      <main className="flex-1 pb-16 overflow-auto" role="main">
        {renderContent()}
      </main>

      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="sr-only">Raccourcis clavier : Alt+1 pour Accueil, Alt+2 pour Stats, Alt+3 pour Saisie</div>
    </div>
  )
}
