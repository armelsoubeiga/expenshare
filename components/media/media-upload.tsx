"use client"

import type React from "react"
import { useState, useRef, forwardRef, useImperativeHandle, useCallback } from "react"
import { Camera, Mic, Upload, X, Play, Pause, Video, FileText } from "lucide-react"
import { MediaFile } from "@/lib/media-types"
import NextImage from "next/image"

export type MediaUploadHandle = {
  startAudioRecording: () => Promise<void>
  stopAudioRecording: () => void
  getRecordingState: () => boolean
  getRecordingTime: () => number
}

interface MediaUploadProps {
  id?: string
  onMediaAdd: (media: MediaFile) => void
  onMediaRemove: (mediaId: string) => void
  mediaFiles: MediaFile[]
  maxFiles?: number
  acceptedTypes?: string[]
  onRecordingStart?: () => void
  onRecordingStop?: (blob?: Blob) => void
  onRecordingTimeTick?: (seconds: number) => void
  previewOnly?: boolean
}

export const MediaUpload = forwardRef<MediaUploadHandle, MediaUploadProps>(function MediaUpload(
  {
    id,
    onMediaAdd,
    onMediaRemove,
    mediaFiles,
    maxFiles = 10,
    acceptedTypes = ["image/*", "audio/*", "video/*", "application/pdf"],
    onRecordingStart,
    onRecordingStop,
    onRecordingTimeTick,
    previewOnly = false,
  }: MediaUploadProps,
  ref
) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const uploadToB2 = async (base64: string, contentType: string, extension: string): Promise<string> => {
    const resp = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: base64, content_type: contentType, extension }),
    })
    if (!resp.ok) throw new Error(await resp.text())
    const { key } = await resp.json()
    return `/api/media?key=${encodeURIComponent(key)}`
  }

  const fileToBase64 = (file: File | Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const processFiles = async (files: File[]) => {
    setUploading(true)
    for (const file of files) {
      if (mediaFiles.length >= maxFiles) break
      try {
        const base64 = await fileToBase64(file)
        const ext = file.name.split(".").pop() || "bin"
        const mediaType: MediaFile["type"] = file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("video/")
          ? "video"
          : "file"
        const url = await uploadToB2(base64, mediaType, ext)
        onMediaAdd({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
          type: mediaType,
          name: file.name,
          size: file.size,
          url,
          blob: undefined,
        })
      } catch (e: unknown) {
        alert("Erreur upload : " + (e instanceof Error ? e.message : String(e)))
      }
    }
    setUploading(false)
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length) await processFiles(files)
    event.target.value = ""
  }

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" })
        const fileName = `Audio_${new Date().toLocaleTimeString("fr-FR")}.webm`
        try {
          const base64 = await fileToBase64(blob)
          const url = await uploadToB2(base64, "audio", "webm")
          onMediaAdd({ id: Date.now().toString(), type: "audio", name: fileName, size: blob.size, url, blob: undefined })
        } catch (e: unknown) {
          alert("Erreur upload audio : " + (e instanceof Error ? e.message : String(e)))
        }
        stream.getTracks().forEach(t => t.stop())
        try { onRecordingStop?.(blob) } catch {}
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      try { onRecordingStart?.() } catch {}
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const next = prev + 1
          try { onRecordingTimeTick?.(next) } catch {}
          return next
        })
      }, 1000)
    } catch {
      alert("Impossible d'accéder au microphone")
    }
  }, [onMediaAdd, onRecordingStart, onRecordingStop, onRecordingTimeTick])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setRecordingTime(0)
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
    }
  }, [isRecording])

  useImperativeHandle(ref, () => ({
    startAudioRecording: startRecording,
    stopAudioRecording: stopRecording,
    getRecordingState: () => isRecording,
    getRecordingTime: () => recordingTime,
  }), [isRecording, recordingTime, startRecording, stopRecording])

  const playAudio = (media: MediaFile) => {
    if (playingAudio === media.id) {
      audioRef.current?.pause()
      setPlayingAudio(null)
    } else {
      audioRef.current?.pause()
      const audio = new Audio(media.url)
      audioRef.current = audio
      audio.onended = () => setPlayingAudio(null)
      audio.play()
      setPlayingAudio(media.id)
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + ["B", "KB", "MB", "GB"][i]
  }

  const images = mediaFiles.filter(m => m.type === "image")
  const others = mediaFiles.filter(m => m.type !== "image")
  const canAdd = mediaFiles.length < maxFiles && !uploading

  return (
    <div className="space-y-3">
      {!previewOnly && (
        <div className="flex flex-wrap gap-2">
          <input
            id={id}
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedTypes.join(",")}
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={photoInputRef}
            type="file"
            multiple
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canAdd}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Upload className="h-4 w-4" />
            Fichier{uploading ? "…" : ""}
          </button>

          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={!canAdd}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Camera className="h-4 w-4" />
            Photo
          </button>

          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={!canAdd}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Video className="h-4 w-4" />
            Vidéo
          </button>

          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!canAdd && !isRecording}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors ${
              isRecording
                ? "border-red-500 bg-red-50 dark:bg-red-950/20 text-red-600 hover:bg-red-100"
                : "border-border hover:bg-muted disabled:opacity-40"
            }`}
          >
            <Mic className="h-4 w-4" />
            {isRecording ? `Arrêter (${formatTime(recordingTime)})` : "Audio"}
          </button>
        </div>
      )}

      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {images.map(media => (
            <div key={media.id} className="relative aspect-square rounded-xl overflow-hidden bg-muted group">
              <NextImage
                src={media.url}
                alt={media.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 33vw, 150px"
                unoptimized
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onMediaRemove(media.id)}
                  className="p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="absolute bottom-1 left-1 right-1">
                <span className="text-[10px] text-white bg-black/50 rounded px-1">{formatSize(media.size)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-1.5">
          {others.map(media => (
            <div key={media.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/30">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                media.type === "audio" ? "bg-green-100 dark:bg-green-950/30" :
                media.type === "video" ? "bg-purple-100 dark:bg-purple-950/30" :
                "bg-orange-100 dark:bg-orange-950/30"
              }`}>
                {media.type === "audio" && <Mic className="h-4 w-4 text-green-600" />}
                {media.type === "video" && <Video className="h-4 w-4 text-purple-600" />}
                {media.type === "file" && <FileText className="h-4 w-4 text-orange-600" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{media.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(media.size)}</p>
              </div>

              <div className="flex items-center gap-1">
                {media.type === "audio" && (
                  <button
                    type="button"
                    onClick={() => playAudio(media)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {playingAudio === media.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onMediaRemove(media.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mediaFiles.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {mediaFiles.length} / {maxFiles} fichier{mediaFiles.length > 1 ? "s" : ""}
          {mediaFiles.length >= maxFiles && " — limite atteinte"}
        </p>
      )}
    </div>
  )
})
