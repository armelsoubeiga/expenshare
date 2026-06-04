"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"
import { DatabaseError } from "@/components/ui/database-error"
import type { TursoDatabaseInstance } from "@/lib/database-turso"
import type { User as StoredUser } from "@/lib/types"
import { PinBoxes } from "./pin-boxes"

interface PinAuthProps {
  onAuthSuccess: () => void
}

export function PinAuth({ onAuthSuccess }: PinAuthProps) {
  const { db, isLoading: dbLoading, isReady, error: dbError } = useDatabase()
  const database = db as TursoDatabaseInstance | null

  const [step, setStep] = useState<"check" | "setup-name" | "setup-pin" | "confirm-pin" | "login">("check")
  const [userName, setUserName] = useState("")
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [loginUserName, setLoginUserName] = useState("")
  const [loginPin, setLoginPin] = useState("")
  const [existingUsers, setExistingUsers] = useState<StoredUser[]>([])
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [pinAutoFocus, setPinAutoFocus] = useState(false)

  // Ref pour le champ caché (sauvegarde navigateur)
  const hiddenPasswordRef = useRef<HTMLInputElement>(null)

  const checkExistingUsers = useCallback(async () => {
    if (!database?.isReady) return
    try {
      const users = await database.users.toArray()
      setExistingUsers(users)
      setStep(users.length === 0 ? "setup-name" : "login")
    } catch {
      setError("Erreur lors de l'initialisation")
      setStep("setup-name")
    }
  }, [database])

  useEffect(() => {
    if (isReady && database) void checkExistingUsers()
  }, [isReady, database, checkExistingUsers])

  // Sync le champ caché avec le PIN pour la sauvegarde navigateur
  useEffect(() => {
    if (hiddenPasswordRef.current) {
      hiddenPasswordRef.current.value = loginPin
    }
  }, [loginPin])

  const saveSession = (id: string | number | undefined, name: string) => {
    const data = JSON.stringify({ id, name, loginTime: new Date().toISOString() })
    localStorage.setItem("expenshare_current_user", data)
    localStorage.setItem("expenshare_user", data)
    sessionStorage.setItem("expenshare_auth", "true")
  }

  const handleNameSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!userName.trim()) { setError("Veuillez saisir votre nom"); return }
    if (database?.isReady) {
      const users = await database.users.toArray()
      if (users.some(u => u.name === userName)) { setError("Ce nom existe déjà"); return }
    }
    setError("")
    setPin("")
    setStep("setup-pin")
    setPinAutoFocus(true)
  }

  const handlePinSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { setError("Le PIN doit contenir 4 chiffres"); return }
    setError("")
    setConfirmPin("")
    setStep("confirm-pin")
    setPinAutoFocus(true)
  }

  const handleConfirmPin = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (pin !== confirmPin) { setError("Les PINs ne correspondent pas"); return }
    if (!database?.isReady) { setError("Base de données non disponible"); return }
    setIsLoading(true)
    setError("")
    try {
      const pinHash = btoa(pin + "salt_" + userName)
      const userId = await database.users.add({ name: userName, pin_hash: pinHash, created_at: new Date().toISOString() })
      saveSession(userId, userName)
      setTimeout(onAuthSuccess, 400)
    } catch (err) {
      setIsLoading(false)
      setError(err instanceof Error ? err.message : "Erreur lors de la création du compte")
    }
  }

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!loginUserName.trim()) { setError("Saisissez votre nom"); return }
    if (loginPin.length !== 4 || !/^\d{4}$/.test(loginPin)) { setError("PIN invalide (4 chiffres requis)"); return }
    if (!database?.isReady) { setError("Base de données non disponible"); return }
    setIsLoading(true)
    setError("")
    try {
      const users = await database.users.toArray()
      const user = users.find(u => u.name.toLowerCase() === loginUserName.trim().toLowerCase())
      if (!user || btoa(loginPin + "salt_" + user.name) !== user.pin_hash) {
        setIsLoading(false)
        setError("Nom ou PIN incorrect")
        setLoginPin("")
        setPinAutoFocus(true)
        return
      }
      saveSession(user.id, user.name)
      setIsLoading(false)
      onAuthSuccess()
    } catch (err) {
      setIsLoading(false)
      setError(err instanceof Error ? err.message : "Erreur lors de la connexion")
    }
  }

  if (dbError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md"><DatabaseError error={dbError} /></div>
      </div>
    )
  }

  if (step === "check" || dbLoading || !isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-base">ES</span>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/25">
            <span className="text-primary-foreground font-bold text-xl">ES</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ExpenseShare</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestion de dépenses partagées</p>
        </div>

        <div className="bg-card border border-border rounded-3xl shadow-xl p-6 space-y-6">
          {/* Erreur */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
            </div>
          )}

          {/* ── Saisie du nom (nouveau compte) ── */}
          {step === "setup-name" && (
            <form onSubmit={handleNameSubmit} className="space-y-5">
              <div className="text-center">
                <h2 className="font-semibold text-lg">Bienvenue !</h2>
                <p className="text-sm text-muted-foreground mt-1">Créez votre compte pour commencer</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Votre nom</label>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  placeholder="Ex: Marie, Jean…"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  autoFocus
                  className="w-full h-12 px-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                />
              </div>
              <button type="submit" className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors">
                Continuer
              </button>
              {existingUsers.length > 0 && (
                <button type="button" onClick={() => setStep("login")} className="w-full h-11 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
                  J'ai déjà un compte
                </button>
              )}
            </form>
          )}

          {/* ── Créer PIN ── */}
          {step === "setup-pin" && (
            <form onSubmit={handlePinSubmit} className="space-y-5">
              <button type="button" onClick={() => { setStep("setup-name"); setPin("") }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" /> Retour
              </button>
              <div className="text-center">
                <h2 className="font-semibold text-lg">Créez votre PIN</h2>
                <p className="text-sm text-muted-foreground mt-1">4 chiffres pour sécuriser votre compte</p>
              </div>
              <PinBoxes value={pin} onChange={setPin} showPin={showPin} autoFocus={pinAutoFocus} onComplete={handlePinSubmit} />
              <button type="button" onClick={() => setShowPin(v => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto">
                {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPin ? "Masquer" : "Afficher"} le PIN
              </button>
              <button type="submit" disabled={pin.length !== 4} className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors">
                Continuer
              </button>
            </form>
          )}

          {/* ── Confirmer PIN ── */}
          {step === "confirm-pin" && (
            <form onSubmit={handleConfirmPin} className="space-y-5">
              <button type="button" onClick={() => { setStep("setup-pin"); setConfirmPin("") }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" /> Retour
              </button>
              <div className="text-center">
                <h2 className="font-semibold text-lg">Confirmez votre PIN</h2>
                <p className="text-sm text-muted-foreground mt-1">Resaisissez votre PIN pour confirmer</p>
              </div>
              <PinBoxes value={confirmPin} onChange={setConfirmPin} showPin={showPin} autoFocus={pinAutoFocus} onComplete={handleConfirmPin} />
              <button
                type="submit"
                disabled={confirmPin.length !== 4 || isLoading}
                className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Création…</> : "Créer mon compte"}
              </button>
            </form>
          )}

          {/* ── Connexion ── */}
          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-5" autoComplete="on">
              <div className="text-center">
                <h2 className="font-semibold text-lg">Connexion</h2>
                <p className="text-sm text-muted-foreground mt-1">Entrez votre nom et votre PIN</p>
              </div>

              {/* Saisie du nom */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Nom d'utilisateur</label>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  placeholder="Votre nom"
                  value={loginUserName}
                  onChange={e => setLoginUserName(e.target.value)}
                  autoFocus
                  className="w-full h-12 px-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                />
              </div>

              {/* PIN */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Code PIN</label>
                  <button type="button" onClick={() => setShowPin(v => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showPin ? "Masquer" : "Afficher"}
                  </button>
                </div>

                {/* Champ caché pour la sauvegarde navigateur */}
                <input
                  ref={hiddenPasswordRef}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  defaultValue=""
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4)
                    if (v.length > 0) { setLoginPin(v); setPinAutoFocus(false) }
                  }}
                  className="sr-only"
                  tabIndex={-1}
                />

                <PinBoxes
                  value={loginPin}
                  onChange={setLoginPin}
                  showPin={showPin}
                  autoFocus={pinAutoFocus}
                  onComplete={() => handleLogin()}
                />
              </div>

              <button
                type="submit"
                disabled={loginPin.length !== 4 || !loginUserName.trim() || isLoading}
                className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Connexion…</> : "Se connecter"}
              </button>

              <button type="button" onClick={() => { setStep("setup-name"); setLoginUserName(""); setLoginPin("") }} className="w-full h-11 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
                Créer un nouveau compte
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
