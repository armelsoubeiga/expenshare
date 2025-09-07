"use client"

import { useState, useEffect } from "react"
import { PinAuth } from "@/components/auth/pin-auth"
import { MainLayout } from "@/components/layout/main-layout"

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if user is already authenticated in this session
    const sessionAuth = sessionStorage.getItem("expenshare_auth")
    if (sessionAuth === "true") {
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const handleAuthSuccess = () => {
    sessionStorage.setItem("expenshare_auth", "true")
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    sessionStorage.removeItem("expenshare_auth")
    setIsAuthenticated(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <PinAuth onAuthSuccess={handleAuthSuccess} />
  }

  return <MainLayout onLogout={handleLogout} />
}
