"use client"

import type React from "react"

import { useState, useRef, forwardRef, useImperativeHandle } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Camera, Mic, Upload, X, Play, Pause, Download } from "lucide-react"
import { MediaFile } from "@/lib/media-types"

export type MediaUploadHandle = {
  startAudioRecording: () => Promise<void>
  stopAudioRecording: () => void
  getRecordingState: () => boolean
  getRecordingTime: () => number
}

interface MediaUploadProps {
  // Permettre de cliquer l'input file depuis l'extérieur (ex: via document.getElementById(id).click())
  id?: string
  onMediaAdd: (media: MediaFile) => void
  onMediaRemove: (mediaId: string) => void
  mediaFiles: MediaFile[]
  maxFiles?: number
  acceptedTypes?: string[]
  onRecordingStart?: () => void
  onRecordingStop?: (blob?: Blob) => void
  onRecordingTimeTick?: (seconds: number) => void
}

export const MediaUpload = forwardRef<MediaUploadHandle, MediaUploadProps>(function MediaUpload(
  {
    id,
    onMediaAdd,
    onMediaRemove,
    mediaFiles,
    maxFiles = 5,
    acceptedTypes = ["image/*", "audio/*"],
    onRecordingStart,
    onRecordingStop,
    onRecordingTimeTick,
  }: MediaUploadProps,
  ref
) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])

    files.forEach((file) => {
      if (mediaFiles.length >= maxFiles) return

      const mediaFile: MediaFile = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("audio/")
          ? "audio"
          : "file",
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
        blob: file,
      }

      onMediaAdd(mediaFile)
    })

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" })
        const mediaFile: MediaFile = {
          id: Date.now().toString(),
          type: "audio",
          name: `Enregistrement_${new Date().toLocaleTimeString("fr-FR")}.webm`,
          size: blob.size,
          url: URL.createObjectURL(blob),
          blob,
        }

        onMediaAdd(mediaFile)
        stream.getTracks().forEach((track) => track.stop())
        try { onRecordingStop && onRecordingStop(blob) } catch {}
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      try { onRecordingStart && onRecordingStart() } catch {}

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1
          try { onRecordingTimeTick && onRecordingTimeTick(next) } catch {}
          return next
        })
      }, 1000)
    } catch (error) {
      console.error("Error starting recording:", error)
      alert("Impossible d'accéder au microphone")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setRecordingTime(0)

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
    }
  }

  useImperativeHandle(ref, () => ({
    startAudioRecording: startRecording,
    stopAudioRecording: stopRecording,
    getRecordingState: () => isRecording,
    getRecordingTime: () => recordingTime,
  }), [isRecording, recordingTime])

  const playAudio = (mediaFile: MediaFile) => {
    if (playingAudio === mediaFile.id) {
      audioRef.current?.pause()
      setPlayingAudio(null)
    } else {
      if (audioRef.current) {
        audioRef.current.pause()
      }

      const audio = new Audio(mediaFile.url)
      audioRef.current = audio

      audio.onended = () => setPlayingAudio(null)
      audio.play()
      setPlayingAudio(mediaFile.id)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="space-y-4">
      {/* Upload Controls */}
      <div className="flex gap-2 flex-wrap">
        <input
          id={id}
          ref={fileInputRef}
          type="file"
          multiple
          accept={Array.isArray(acceptedTypes) ? acceptedTypes.join(",") : acceptedTypes}
          onChange={handleFileSelect}
          className="hidden"
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={mediaFiles.length >= maxFiles}
        >
          <Upload className="h-4 w-4 mr-1" />
          Fichier
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={mediaFiles.length >= maxFiles}
        >
          <Camera className="h-4 w-4 mr-1" />
          Photo
        </Button>

        <Button
          type="button"
          variant={isRecording ? "destructive" : "outline"}
          size="sm"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={mediaFiles.length >= maxFiles && !isRecording}
        >
          <Mic className="h-4 w-4 mr-1" />
          {isRecording ? `Arrêter (${formatTime(recordingTime)})` : "Audio"}
        </Button>
      </div>

      {/* Media Files List */}
      {mediaFiles.length > 0 && (
        <div className="space-y-2">
          {mediaFiles.map((media) => (
            <Card key={media.id} className="p-3">
              <div className="flex items-center gap-3">
                {media.type === "image" ? (
                  <div className="relative w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                    <img
                      src={media.url || "/placeholder.svg"}
                      alt={media.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <Mic className="h-6 w-6 text-blue-600" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{media.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {media.type === "image" ? "Image" : "Audio"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatFileSize(media.size)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {media.type === "audio" && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => playAudio(media)}>
                      {playingAudio === media.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const link = document.createElement("a")
                      link.href = media.url
                      link.download = media.name
                      link.click()
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>

                  <Button type="button" variant="ghost" size="sm" onClick={() => onMediaRemove(media.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {mediaFiles.length >= maxFiles && (
        <p className="text-xs text-muted-foreground">Limite de {maxFiles} fichiers atteinte</p>
      )}
    </div>
  )
})
