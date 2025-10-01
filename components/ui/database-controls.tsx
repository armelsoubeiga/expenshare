"use client"

import { Button } from "@/components/ui/button"
import { Download, Upload } from "lucide-react"
import { db } from "@/lib/database"
import { useToast } from "@/hooks/use-toast"
import { useRef } from "react"

interface DatabaseControlsProps {
  className?: string
}

export function DatabaseControls({ className }: DatabaseControlsProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDownload = () => {
    try {
      db.downloadDatabase()
      toast({
        title: "Base de données téléchargée",
        description: "Le fichier expenseshare.db a été téléchargé avec succès.",
      })
    } catch (error) {
      console.error("[DatabaseControls] Failed to download database:", error)
      toast({
        title: "Erreur lors du téléchargement",
        description: "Impossible de télécharger la base de données.",
        variant: "destructive",
      })
    }
  }

  const handleUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      await db.uploadDatabase(file)
      toast({
        title: "Base de données importée",
        description: "La base de données a été importée avec succès.",
      })
      // Refresh the page to reflect the changes
      window.location.reload()
    } catch (error) {
      console.error("[DatabaseControls] Failed to upload database:", error)
      toast({
        title: "Erreur lors de l'importation",
        description: "Impossible d'importer la base de données.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className={className}>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Télécharger DB
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleUpload}
          className="flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          Importer DB
        </Button>
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".db,.sqlite,.sqlite3"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
