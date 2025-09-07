"use client"

// Types communs pour les médias à travers l'application
export interface MediaFile {
  id: string
  type: "image" | "audio" | "file"
  name: string
  size: number
  url: string
  blob?: Blob
}
