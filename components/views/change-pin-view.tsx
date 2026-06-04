"use client"

import { useState, useEffect } from "react"
import { Loader2, CheckCircle2 } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"
import { PinBoxes } from "@/components/auth/pin-boxes"

interface ChangePinViewProps {
  onBack: () => void
}

export function ChangePinView({ onBack }: ChangePinViewProps) {
  const { db, isReady } = useDatabase()
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current')
  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("expenshare_user")
    if (stored) {
      const u = JSON.parse(stored)
      setUserId(String(u.id))
      setUserName(u.name || "")
    }
  }, [])

  const verifyCurrentPin = async () => {
    if (currentPin.length !== 4) { setError("Entrez votre PIN actuel (4 chiffres)"); return }
    if (!db || !isReady || !userId) { setError("Erreur d'initialisation"); return }
    setError("")
    const user = await db.users.get(userId)
    if (!user) { setError("Utilisateur non trouvé"); return }
    if (btoa(currentPin + "salt_" + user.name) !== user.pin_hash) {
      setError("PIN actuel incorrect")
      setCurrentPin("")
      return
    }
    setStep('new')
  }

  const handleNewPin = () => {
    if (newPin.length !== 4) { setError("Le nouveau PIN doit contenir 4 chiffres"); return }
    setError("")
    setStep('confirm')
  }

  const handleConfirm = async () => {
    if (newPin !== confirmPin) { setError("Les PINs ne correspondent pas"); setConfirmPin(""); return }
    if (!db || !userId || !userName) { setError("Erreur d'initialisation"); return }
    setIsLoading(true)
    setError("")
    try {
      const hashedPin = btoa(newPin + "salt_" + userName)
      await db.users.updatePinHash(userId, hashedPin)
      setSuccess(true)
      setTimeout(onBack, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la mise à jour")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
        </div>
        <p className="text-lg font-semibold">PIN mis à jour !</p>
      </div>
    )
  }

  const stepConfig = {
    current: { title: "PIN actuel", subtitle: "Saisissez votre code actuel", value: currentPin, onChange: setCurrentPin, onComplete: verifyCurrentPin, onSubmit: verifyCurrentPin },
    new:     { title: "Nouveau PIN", subtitle: "Choisissez votre nouveau code", value: newPin, onChange: setNewPin, onComplete: handleNewPin, onSubmit: handleNewPin },
    confirm: { title: "Confirmer le PIN", subtitle: "Resaisissez votre nouveau code", value: confirmPin, onChange: setConfirmPin, onComplete: handleConfirm, onSubmit: handleConfirm },
  }

  const current = stepConfig[step]
  const steps = ['current', 'new', 'confirm'] as const
  const stepIdx = steps.indexOf(step)

  return (
    <div className="max-w-sm mx-auto px-4 py-8 space-y-8">
      {/* Indicateur d'étapes */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
              i < stepIdx ? 'bg-green-500 text-white' :
              i === stepIdx ? 'bg-primary text-primary-foreground' :
              'bg-muted text-muted-foreground'
            }`}>
              {i < stepIdx ? '✓' : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-8 rounded-full transition-all ${i < stepIdx ? 'bg-green-500' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">{current.title}</h2>
        <p className="text-sm text-muted-foreground">{current.subtitle}</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-sm text-red-600 text-center">{error}</p>
        </div>
      )}

      <PinBoxes
        value={current.value}
        onChange={current.onChange}
        autoFocus
        onComplete={current.onComplete}
      />

      <div className="flex gap-3">
        <button
          onClick={() => { if (step === 'current') onBack(); else setStep(steps[stepIdx - 1]); setError("") }}
          className="flex-1 h-12 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          {step === 'current' ? 'Annuler' : 'Retour'}
        </button>
        <button
          onClick={current.onSubmit}
          disabled={current.value.length !== 4 || isLoading}
          className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : step === 'confirm' ? 'Valider' : 'Suivant'}
        </button>
      </div>
    </div>
  )
}
