"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

export type AppPage =
  | { type: 'main'; tab: 'home' | 'stats' | 'input' }
  | { type: 'new-transaction'; projectId?: number }
  | { type: 'new-project' }
  | { type: 'project-settings'; projectId: number }
  | { type: 'change-pin' }
  | { type: 'settings' }
  | { type: 'project-transfers'; projectId: number }
  | { type: 'export' }
  | { type: 'edit-transaction'; transactionId: number }
  | { type: 'user-management' }

interface NavigationContextType {
  currentPage: AppPage
  navigate: (page: AppPage) => void
  goBack: () => void
  canGoBack: boolean
}

const NavigationContext = createContext<NavigationContextType | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<AppPage[]>([{ type: 'main', tab: 'home' }])

  const navigate = useCallback((page: AppPage) => {
    setStack(prev => [...prev, page])
  }, [])

  const goBack = useCallback(() => {
    setStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev)
  }, [])

  const currentPage = stack[stack.length - 1]
  const canGoBack = stack.length > 1

  return (
    <NavigationContext.Provider value={{ currentPage, navigate, goBack, canGoBack }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}
