"use client"

import { Button } from "@/components/ui/button"
import { Home, BarChart3, Plus } from "lucide-react"
import type { TabType } from "./main-layout"

interface BottomNavigationProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  const tabs = [
    {
      id: "home" as TabType,
      label: "Accueil",
      icon: Home,
    },
    {
      id: "stats" as TabType,
      label: "Stats",
      icon: BarChart3,
    },
    {
      id: "input" as TabType,
      label: "Saisie",
      icon: Plus,
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-inset-bottom">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <Button
              key={tab.id}
              variant="ghost"
              size="sm"
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-1 h-auto py-2 px-4 ${
                isActive
                  ? "text-primary-foreground bg-primary hover:bg-primary/90"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              aria-label={`Aller à ${tab.label}`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{tab.label}</span>
            </Button>
          )
        })}
      </div>
    </nav>
  )
}
