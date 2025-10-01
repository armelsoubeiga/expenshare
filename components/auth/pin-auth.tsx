"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { KeyRound, User, Loader2 } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"
import { DatabaseError } from "@/components/ui/database-error"
import type { SupabaseDatabaseInstance } from "@/lib/database-supabase"
import type { User as StoredUser } from "@/lib/types"

interface PinAuthProps {
  onAuthSuccess: () => void
}

export function PinAuth({ onAuthSuccess }: PinAuthProps) {
  const { db, isLoading: dbLoading, isReady, error: dbError } = useDatabase()
  const database = (db as SupabaseDatabaseInstance | null)
  const [step, setStep] = useState<"check" | "setup-name" | "setup-pin" | "confirm-pin" | "login" | "pin-only">("check")
  const [userName, setUserName] = useState("")
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [loginUserName, setLoginUserName] = useState("")
  const [loginPin, setLoginPin] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [existingUsers, setExistingUsers] = useState<StoredUser[]>([])

  const checkExistingUsers = useCallback(async () => {
    if (!database || !database.isReady) {
      console.log("[v0] Database not ready yet")
      return
    }

    try {
      console.log("[v0] Checking existing users...")
      const users = await database.users.toArray()
      console.log("[v0] Found users:", users.length)
      setExistingUsers(users)

      if (users.length === 0) {
        setStep("setup-name")
      } else {
        setStep("pin-only")
      }
    } catch (error: unknown) {
      console.error("[v0] Error checking users:", error)
      setError("Erreur lors de l'initialisation de la base de données")
      setStep("setup-name")
    }
  }, [database])

  useEffect(() => {
    if (isReady && database) {
      void checkExistingUsers()
    }
  }, [isReady, database, checkExistingUsers])

  const handleNameSubmit = async () => {
    if (!userName.trim()) {
      setError("Veuillez saisir votre nom")
      return
    }
    // Vérifier unicité (casse respectée)
    if (database && database.isReady) {
      const users = await database.users.toArray()
      if (users.some((u) => u.name === userName)) {
        setError("Ce nom d'utilisateur existe déjà")
        return
      }
    }
    setError("")
    setStep("setup-pin")
  }

  const handlePinSubmit = () => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError("Le code PIN doit contenir exactement 4 chiffres")
      return
    }
    setError("")
    setStep("confirm-pin")
  }

  const handleConfirmPin = async () => {
    if (pin !== confirmPin) {
      setError("Les codes PIN ne correspondent pas")
      return
    }

    if (!database || !database.isReady) {
      setError("Base de données non disponible")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      // Vérifier unicité (casse respectée)
      const users = await database.users.toArray()
      if (users.some((u) => u.name === userName)) {
        setIsLoading(false)
        setError("Ce nom d'utilisateur existe déjà")
        return
      }
      const hashedPin = btoa(pin + "salt_" + userName)
      const userId = await database.users.add({
        name: userName,
        pin_hash: hashedPin,
        created_at: new Date().toISOString(),
      })
      // Store current user in localStorage for session
      localStorage.setItem(
        "expenshare_current_user",
        JSON.stringify({
          id: userId,
          name: userName,
          loginTime: new Date().toISOString(),
        }),
      )
      // Also store in expenshare_user for compatibility
      localStorage.setItem(
        "expenshare_user",
        JSON.stringify({
          id: userId,
          name: userName,
          loginTime: new Date().toISOString(),
        }),
      )
      setTimeout(() => {
        setIsLoading(false)
        onAuthSuccess()
      }, 500)
    } catch (error: unknown) {
      console.error('[PinAuth] Create user failed:', error)
      setIsLoading(false)
      const message = error instanceof Error ? error.message : "Erreur lors de la création du compte"
      setError(message)
    }
  }

  const handleLogin = async () => {
    if (!loginUserName.trim()) {
      setError("Veuillez saisir votre nom d'utilisateur")
      return
    }
    if (loginPin.length !== 4 || !/^\d{4}$/.test(loginPin)) {
      setError("Le code PIN doit contenir exactement 4 chiffres")
      return
    }
    if (!database || !database.isReady) {
      setError("Base de données non disponible")
      return
    }
    setIsLoading(true)
    setError("")
    try {
      // Recherche par nom exact (casse respectée)
      const users = await database.users.toArray()
      const user = users.find((u) => u.name === loginUserName)
      if (!user) {
        setIsLoading(false)
        setError("Nom d'utilisateur ou PIN incorrect")
        return
      }
      const hashedLoginPin = btoa(loginPin + "salt_" + user.name)
      if (hashedLoginPin !== user.pin_hash) {
        setIsLoading(false)
        setError("Nom d'utilisateur ou PIN incorrect")
        setLoginPin("")
        return
      }
      // Store current user in localStorage for session
      localStorage.setItem(
        "expenshare_current_user",
        JSON.stringify({
          id: user.id,
          name: user.name,
          loginTime: new Date().toISOString(),
        }),
      )
      localStorage.setItem(
        "expenshare_user",
        JSON.stringify({
          id: user.id,
          name: user.name,
          loginTime: new Date().toISOString(),
        }),
      )
      setIsLoading(false)
      onAuthSuccess()
    } catch (error: unknown) {
      console.error('[PinAuth] Login failed:', error)
      setIsLoading(false)
      const message = error instanceof Error ? error.message : "Erreur lors de la connexion"
      setError(message)
    }
  }

  const renderPinInput = (value: string, onChange: (value: string) => void, placeholderLabel: string) => (
    <div className="flex gap-2 justify-center">
      {[0, 1, 2, 3].map((index) => (
        <Input
          key={index}
          type="password"
          maxLength={1}
          className="w-12 h-12 text-center text-lg font-mono"
          value={value[index] || ""}
          onChange={(e) => {
            const newValue = value.split("")
            newValue[index] = e.target.value
            onChange(newValue.join(""))

            // Auto-focus next input
            if (e.target.value && index < 3) {
              const nextInput = e.target.parentElement?.children[index + 1] as HTMLInputElement
              nextInput?.focus()
            }
          }}
          onKeyDown={(e) => {
            // Handle backspace
            if (e.key === "Backspace" && !value[index] && index > 0) {
              const target = e.target as HTMLInputElement
              const prevInput = target.parentElement?.children[index - 1] as HTMLInputElement
              prevInput?.focus()
            }
            // Handle enter
            if (e.key === "Enter" && value.length === 4) {
              if (step === "pin-only") handleLogin()
            }
          }}
          aria-label={`${placeholderLabel} caractère ${index + 1}`}
        />
      ))}
    </div>
  )

  if (dbError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <DatabaseError error={dbError} />
        </div>
      </div>
    )
  }

  if (step === "check" || dbLoading || !isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {dbLoading ? "Initialisation de la base de données..." : "Chargement..."}
          </p>
          {!dbLoading && !isReady && (
            <button
              className="text-xs underline text-muted-foreground"
              onClick={() => window.location.reload()}
            >
              Réessayer
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-primary rounded-full flex items-center justify-center">
            {step === "setup-name" ? (
              <User className="w-6 h-6 text-primary-foreground" />
            ) : (
              <KeyRound className="w-6 h-6 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {step === "setup-name"
              ? "Bienvenue sur ExpenseShare"
              : step === "pin-only"
                ? "Connexion ExpenseShare"
                : `Configuration - ${userName}`}
          </CardTitle>
          <CardDescription>
            {step === "setup-name" && "Créez votre compte"}
            {step === "setup-pin" && "Créez votre code PIN de sécurité"}
            {step === "confirm-pin" && "Confirmez votre code PIN"}
            {step === "pin-only" && "Saisissez votre code PIN pour vous connecter"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "setup-name" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Votre nom</Label>
                <Input
                  id="name"
                  placeholder="Entrez votre nom"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
                />
              </div>
              <Button onClick={handleNameSubmit} className="w-full">
                Continuer
              </Button>
              {existingUsers.length > 0 && (
                <Button variant="outline" onClick={() => setStep("pin-only")} className="w-full">
                  J&rsquo;ai déjà un compte
                </Button>
              )}
            </>
          )}

          {step === "setup-pin" && (
            <>
              <div className="space-y-2">
                <Label className="text-center block">Créez votre code PIN (4 chiffres)</Label>
                {renderPinInput(pin, setPin, "Code PIN")}
              </div>
              <Button onClick={handlePinSubmit} className="w-full" disabled={pin.length !== 4}>
                Continuer
              </Button>
            </>
          )}

          {step === "confirm-pin" && (
            <>
              <div className="space-y-2">
                <Label className="text-center block">Confirmez votre code PIN</Label>
                {renderPinInput(confirmPin, setConfirmPin, "Confirmer PIN")}
              </div>
              <Button onClick={handleConfirmPin} className="w-full" disabled={confirmPin.length !== 4 || isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Création...
                  </>
                ) : (
                  "Créer mon compte"
                )}
              </Button>
            </>
          )}

          {step === "pin-only" && (
            <>
              <div className="space-y-2 flex flex-col items-center">
                <Label htmlFor="login-username" className="text-center block w-56 mx-auto">Nom d&rsquo;utilisateur</Label>
                <div className="flex justify-center w-full">
                  <Input
                    id="login-username"
                    placeholder="Nom d'utilisateur"
                    value={loginUserName}
                    onChange={e => setLoginUserName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                    autoFocus
                    className="w-56 max-w-full text-center px-2 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    style={{ maxWidth: 224 }}
                  />
                </div>
                <Label className="text-center block w-56 mx-auto mt-4">Code PIN</Label>
                {renderPinInput(loginPin, setLoginPin, "Code PIN")}
              </div>
              <Button onClick={handleLogin} className="w-full" disabled={loginPin.length !== 4 || !loginUserName.trim() || isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connexion...
                  </>
                ) : (
                  "Se connecter"
                )}
              </Button>
              <div className="text-center mt-2 mb-2">
                <span className="text-sm text-muted-foreground">ou</span>
              </div>
              <Button variant="outline" onClick={() => setStep("setup-name")} className="w-full">
                Créer un nouveau compte
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
