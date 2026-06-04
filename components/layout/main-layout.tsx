"use client"

import { useEffect } from "react"
import { NavigationProvider, useNavigation, type AppPage } from "@/lib/navigation-context"
import { BottomNavigation } from "./bottom-navigation"
import { TopHeader } from "./top-header"
import { SidebarNavigation } from "./sidebar-navigation"
import { HomePage } from "@/components/pages/home-page"
import { StatsPage } from "@/components/pages/stats-page"
import { InputPage } from "@/components/pages/input-page"
import { TransactionView } from "@/components/views/transaction-view"
import { ProjectView } from "@/components/views/project-view"
import { ChangePinView } from "@/components/views/change-pin-view"
import { SettingsView } from "@/components/views/settings-view"
import { ProjectTransfersView } from "@/components/views/project-transfers-view"
import { ExportView } from "@/components/views/export-view"
import { EditTransactionView } from "@/components/views/edit-transaction-view"
import { ProjectSettingsForm } from "@/components/forms/project-settings-form"
import { LoadingPage } from "@/components/ui/loading-spinner"
import { useDatabase } from "@/hooks/use-database"

interface MainLayoutProps {
  onLogout: () => void
}

function AppContent({ onLogout }: MainLayoutProps) {
  const { currentPage, navigate, goBack, canGoBack } = useNavigation()
  const { isReady, error } = useDatabase()

  // Keyboard shortcuts for tab navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && currentPage.type === 'main') {
        switch (e.key) {
          case "1": e.preventDefault(); navigate({ type: 'main', tab: 'home' }); break
          case "2": e.preventDefault(); navigate({ type: 'main', tab: 'stats' }); break
          case "3": e.preventDefault(); navigate({ type: 'main', tab: 'input' }); break
        }
      }
      if (e.key === 'Escape' && canGoBack) goBack()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [currentPage, navigate, goBack, canGoBack])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-lg font-semibold text-destructive">Erreur de connexion</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-xl font-medium"
          >
            Recharger l'app
          </button>
        </div>
      </div>
    )
  }

  if (!isReady) return <LoadingPage />

  const activeTab = currentPage.type === 'main' ? currentPage.tab : null
  const isSubPage = currentPage.type !== 'main'

  const setTab = (tab: 'home' | 'stats' | 'input') => navigate({ type: 'main', tab })

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop: sidebar layout */}
      <div className="hidden md:flex min-h-screen">
        <SidebarNavigation
          activeTab={activeTab}
          onTabChange={setTab}
          onLogout={onLogout}
          isSubPage={isSubPage}
          onBack={goBack}
        />
        <main className="flex-1 md:ml-[220px] overflow-auto min-h-screen">
          <PageContent currentPage={currentPage} navigate={navigate} goBack={goBack} />
        </main>
      </div>

      {/* Mobile: top header + bottom nav */}
      <div className="md:hidden flex flex-col min-h-screen">
        {isSubPage ? (
          <SubPageHeader currentPage={currentPage} onBack={goBack} />
        ) : (
          <TopHeader onLogout={onLogout} />
        )}
        <main className="flex-1 overflow-auto pb-24">
          <PageContent currentPage={currentPage} navigate={navigate} goBack={goBack} />
        </main>
        {!isSubPage && activeTab && (
          <BottomNavigation activeTab={activeTab} onTabChange={setTab} />
        )}
      </div>
    </div>
  )
}

function SubPageHeader({ currentPage, onBack }: { currentPage: AppPage; onBack: () => void }) {
  const titles: Record<string, string> = {
    'new-transaction': 'Nouvelle transaction',
    'new-project': 'Nouveau projet',
    'project-settings': 'Paramètres du projet',
    'change-pin': 'Changer le PIN',
    'settings': 'Paramètres',
    'project-transfers': 'Partage de budget',
    'export': 'Exporter les données',
    'edit-transaction': 'Modifier la transaction',
  }
  return (
    <header className="bg-card border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
      <button
        onClick={onBack}
        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors -ml-1"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 className="text-base font-semibold">{titles[currentPage.type] || 'Retour'}</h1>
    </header>
  )
}

function PageContent({
  currentPage,
  navigate,
  goBack,
}: {
  currentPage: AppPage
  navigate: (p: AppPage) => void
  goBack: () => void
}) {
  if (currentPage.type === 'new-transaction') {
    return (
      <div className="animate-slide-in">
        <TransactionView
          preselectedProjectId={currentPage.projectId}
          onSuccess={goBack}
          onCancel={goBack}
        />
      </div>
    )
  }

  if (currentPage.type === 'new-project') {
    return (
      <div className="animate-slide-in">
        <ProjectView onSuccess={goBack} onCancel={goBack} />
      </div>
    )
  }

  if (currentPage.type === 'change-pin') return <div className="animate-slide-in"><ChangePinView onBack={goBack} /></div>
  if (currentPage.type === 'settings') return <div className="animate-slide-in"><SettingsView onBack={goBack} /></div>
  if (currentPage.type === 'project-transfers') return <div className="animate-slide-in"><ProjectTransfersView projectId={currentPage.projectId} onBack={goBack} /></div>
  if (currentPage.type === 'export') return <div className="animate-slide-in"><ExportView onBack={goBack} /></div>
  if (currentPage.type === 'edit-transaction') return (
    <div className="animate-slide-in">
      <EditTransactionView transactionId={currentPage.transactionId} onBack={goBack} onSuccess={() => { goBack() }} />
    </div>
  )
  if (currentPage.type === 'project-settings') return (
    <div className="animate-slide-in">
      <ProjectSettingsForm projectId={currentPage.projectId} onBack={goBack} onSuccess={goBack} />
    </div>
  )

  if (currentPage.type === 'main') {
    switch (currentPage.tab) {
      case 'home': return <HomePage />
      case 'stats': return <StatsPage />
      case 'input': return <InputPage navigate={navigate} />
    }
  }

  return null
}

export function MainLayout({ onLogout }: MainLayoutProps) {
  return (
    <NavigationProvider>
      <AppContent onLogout={onLogout} />
    </NavigationProvider>
  )
}

export type { AppPage }
export type TabType = 'home' | 'stats' | 'input'
