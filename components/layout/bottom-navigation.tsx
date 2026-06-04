"use client"

import { Home, BarChart3, PlusCircle } from "lucide-react"
import type { TabType } from "./main-layout"

interface BottomNavigationProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  const tabs = [
    { id: "home" as TabType, label: "Accueil", icon: Home },
    { id: "input" as TabType, label: "Ajouter", icon: PlusCircle, primary: true },
    { id: "stats" as TabType, label: "Projets", icon: BarChart3 },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border">
      <div className="flex items-end justify-around px-2 pt-2 pb-safe" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          if (tab.primary) {
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="flex flex-col items-center gap-1 pb-2 -mt-4 relative"
                aria-label={tab.label}
              >
                <div className={`
                  w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-200
                  ${isActive
                    ? 'bg-primary scale-105 shadow-primary/30'
                    : 'bg-primary/90 hover:bg-primary hover:scale-105 shadow-primary/20'
                  }
                `}>
                  <Icon className="h-7 w-7 text-primary-foreground" strokeWidth={2} />
                </div>
                <span className={`text-[11px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                  {tab.label}
                </span>
              </button>
            )
          }

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center gap-1 pb-2 px-5 relative min-w-[64px]"
              aria-label={tab.label}
            >
              <div className={`
                w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
                ${isActive ? 'bg-primary/10' : 'hover:bg-muted'}
              `}>
                <Icon
                  className={`h-5 w-5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
              <span className={`text-[11px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
