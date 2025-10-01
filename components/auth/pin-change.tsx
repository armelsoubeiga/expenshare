"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"

interface PinChangeProps {
  isOpen: boolean
  onClose: () => void
}

export function PinChange({ isOpen, onClose }: PinChangeProps) {
  const { db, isReady } = useDatabase()
  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Réinitialiser l'état
      setCurrentPin("")
      setNewPin("")
      setConfirmPin("")
      setError("")
      setSuccess("")
      setIsLoading(false)
      setUserId(null)
      
      // Récupérer l'ID utilisateur
      const storedUser = localStorage.getItem("expenshare_user")
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser) as { id?: string | number }
          if (typeof userData.id === "string") {
            setUserId(userData.id)
          } else if (typeof userData.id === "number") {
            setUserId(String(userData.id))
          } else {
            setUserId(null)
          }
        } catch (parseError) {
          console.warn("[PinChange] Impossible de parser l'utilisateur stocké:", parseError)
          setUserId(null)
        }
      }
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    setError("")
    setSuccess("")
    
    // Validation des champs
    if (!currentPin || !newPin || !confirmPin) {
      setError("Tous les champs sont obligatoires")
      return
    }
    
    if (newPin !== confirmPin) {
      setError("Les nouveaux PIN ne correspondent pas")
      return
    }
    
    if (newPin.length < 4) {
      setError("Le PIN doit contenir au moins 4 caractères")
      return
    }
    
    if (!db || !isReady || !userId) {
      setError("Erreur d'initialisation")
      return
    }
    
    setIsLoading(true)
    
    try {
      // Vérifier le PIN actuel
      const user = await db.users.get(userId)
      
      if (!user) {
        setError("Utilisateur non trouvé")
        setIsLoading(false)
        return
      }

      const hashedCurrentPin = btoa(`${currentPin}salt_${user.name}`)

      if (hashedCurrentPin !== user.pin_hash) {
        setError("PIN actuel incorrect")
        setIsLoading(false)
        return
      }
      
      const hashedNewPin = btoa(`${newPin}salt_${user.name}`)

      await db.users.updatePinHash(userId, hashedNewPin)
      
      // Mettre à jour le stockage local
      try {
        const storedUserRaw = localStorage.getItem("expenshare_user")
        const storedUser = storedUserRaw ? (JSON.parse(storedUserRaw) as Record<string, unknown>) : {}
        const updatedUser = {
          ...storedUser,
          id: storedUser.id ?? userId,
          name: storedUser.name ?? user.name,
          pin_hash: hashedNewPin,
        }
        localStorage.setItem("expenshare_user", JSON.stringify(updatedUser))
      } catch (storageError) {
        console.warn("[PinChange] Impossible de mettre à jour expenshare_user:", storageError)
        localStorage.setItem(
          "expenshare_user",
          JSON.stringify({
            id: userId,
            name: user.name,
            pin_hash: hashedNewPin,
          }),
        )
      }
      
      setSuccess("PIN mis à jour avec succès")
      
      // Fermer le dialogue après 1.5 secondes
      setTimeout(() => {
        onClose()
      }, 1500)
      
    } catch (error) {
      console.error("Erreur lors du changement de PIN:", error)
      setError("Une erreur est survenue lors de la mise à jour du PIN")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Changer le PIN
          </DialogTitle>
          <DialogDescription>
            Modifiez votre code PIN de connexion
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="current-pin" className="text-sm font-medium">
              PIN actuel
            </label>
            <Input
              id="current-pin"
              type="password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="Entrez votre PIN actuel"
              disabled={isLoading}
              className="text-center"
              maxLength={6}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="new-pin" className="text-sm font-medium">
              Nouveau PIN
            </label>
            <Input
              id="new-pin"
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="Entrez votre nouveau PIN"
              disabled={isLoading}
              className="text-center"
              maxLength={6}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="confirm-pin" className="text-sm font-medium">
              Confirmer le nouveau PIN
            </label>
            <Input
              id="confirm-pin"
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Confirmez votre nouveau PIN"
              disabled={isLoading}
              className="text-center"
              maxLength={6}
            />
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="sm:w-1/2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading} className="sm:w-1/2">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mise à jour...
                </>
              ) : (
                "Mettre à jour"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
