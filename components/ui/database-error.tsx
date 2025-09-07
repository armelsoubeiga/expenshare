"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface Props {
  error: string
}

export function DatabaseError({ error }: Props) {
  const clearAndReload = () => {
    try {
      localStorage.removeItem("expenseshare.db")
      localStorage.removeItem("expenseshare-db-url")
    } catch {}
    window.location.reload()
  }

  return (
    <div className="p-4 space-y-4">
      <Alert variant="destructive">
        <AlertTitle>Erreur d'initialisation de la base de données</AlertTitle>
        <AlertDescription className="space-y-2">
          <div>{error}</div>
          <p>Causes possibles :</p>
          <ul className="list-disc pl-5">
            <li>Problème de connexion internet (fichiers WASM)</li>
            <li>Navigateur incompatible avec WebAssembly</li>
            <li>Erreur dans les données du localStorage</li>
          </ul>
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()} className="flex-1">Recharger la page</Button>
        <Button variant="outline" onClick={clearAndReload} className="flex-1">Vider le cache et recharger</Button>
      </div>
    </div>
  )
}
