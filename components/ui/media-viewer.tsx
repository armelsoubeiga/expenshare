"use client"

import { useState, useEffect, useCallback } from "react"
import { X, ChevronLeft, ChevronRight, Download, ExternalLink, Copy, Check, Volume2, FileText, Film, ImageIcon } from "lucide-react"
import NextImage from "next/image"

export type MediaItem = {
  type: "image" | "audio" | "video" | "text" | "document"
  content: string   // URL or raw text
  title: string
}

interface MediaViewerProps {
  items: MediaItem[]
  startIndex?: number
  onClose: () => void
}

export function MediaViewer({ items, startIndex = 0, onClose }: MediaViewerProps) {
  const [idx, setIdx] = useState(startIndex)
  const [copied, setCopied] = useState(false)

  const current = items[idx]
  const images = items.filter(i => i.type === "image")

  const prev = useCallback(() => setIdx(i => (i - 1 + items.length) % items.length), [items.length])
  const next = useCallback(() => setIdx(i => (i + 1) % items.length), [items.length])

  // Clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft" && items.length > 1) prev()
      if (e.key === "ArrowRight" && items.length > 1) next()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, prev, next, items.length])

  const copyText = () => {
    if (current.type === "text") {
      navigator.clipboard.writeText(current.content).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  const download = () => {
    const a = document.createElement("a")
    a.href = current.content
    a.download = current.title || "fichier"
    a.click()
  }

  if (!current) return null

  return (
    /* Overlay plein écran */
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 bg-black/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          {typeIcon(current.type)}
          <span className="text-white text-sm font-medium truncate max-w-[180px] sm:max-w-xs">
            {current.title || typeLabel(current.type)}
          </span>
          {items.length > 1 && (
            <span className="text-white/50 text-xs flex-shrink-0">
              {idx + 1} / {items.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Copier (texte) */}
          {current.type === "text" && (
            <button onClick={copyText} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
          )}
          {/* Ouvrir dans nouvel onglet (image/vidéo/document) */}
          {(current.type === "image" || current.type === "video" || current.type === "document") && (
            <a href={current.content} target="_blank" rel="noopener noreferrer"
               className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {/* Télécharger */}
          {current.type !== "text" && (
            <button onClick={download} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <Download className="h-4 w-4" />
            </button>
          )}
          {/* Fermer */}
          <button onClick={onClose} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors ml-1">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ─── Contenu principal ─── */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden px-2 py-2">

        {/* Navigation prev */}
        {items.length > 1 && (
          <button
            onClick={prev}
            className="absolute left-2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors hidden sm:flex"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* Image */}
        {current.type === "image" && (
          <div className="relative w-full h-full max-w-4xl mx-auto flex items-center justify-center">
            <NextImage
              src={current.content}
              alt={current.title}
              fill
              className="object-contain"
              sizes="(max-width: 640px) 100vw, 80vw"
              unoptimized
              priority
            />
          </div>
        )}

        {/* Audio */}
        {current.type === "audio" && (
          <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto">
            <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center">
              <Volume2 className="h-10 w-10 text-white/80" />
            </div>
            <p className="text-white/70 text-sm text-center truncate max-w-full px-4">{current.title}</p>
            <audio
              controls
              autoPlay
              src={current.content}
              className="w-full"
              style={{ colorScheme: "dark" }}
            />
          </div>
        )}

        {/* Vidéo */}
        {current.type === "video" && (
          <video
            controls
            autoPlay
            muted
            src={current.content}
            className="max-w-full max-h-full rounded-xl"
            style={{ maxHeight: "calc(100vh - 180px)" }}
          />
        )}

        {/* Texte */}
        {current.type === "text" && (
          <div className="w-full max-w-2xl mx-auto bg-white/5 rounded-2xl p-5 overflow-auto max-h-full">
            <p className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap">{current.content}</p>
          </div>
        )}

        {/* Document */}
        {current.type === "document" && (
          <div className="flex flex-col items-center gap-5 w-full max-w-sm mx-auto">
            <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center">
              <FileText className="h-10 w-10 text-white/80" />
            </div>
            <p className="text-white text-base font-medium text-center">{current.title}</p>
            <div className="flex gap-3">
              <a
                href={current.content} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
              >
                <ExternalLink className="h-4 w-4" /> Ouvrir
              </a>
              <button
                onClick={download}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
              >
                <Download className="h-4 w-4" /> Télécharger
              </button>
            </div>
          </div>
        )}

        {/* Navigation next */}
        {items.length > 1 && (
          <button
            onClick={next}
            className="absolute right-2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors hidden sm:flex"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* ─── Barre de navigation mobile (swipe arrows) ─── */}
      {items.length > 1 && (
        <div className="flex sm:hidden justify-center gap-4 py-2 flex-shrink-0">
          <button onClick={prev} className="px-6 py-2 rounded-full bg-white/10 text-white text-sm">
            ← Préc.
          </button>
          <button onClick={next} className="px-6 py-2 rounded-full bg-white/10 text-white text-sm">
            Suiv. →
          </button>
        </div>
      )}

      {/* ─── Thumbnails (images multiples) ─── */}
      {images.length > 1 && (
        <div className="flex gap-2 justify-center px-4 py-3 overflow-x-auto flex-shrink-0 bg-black/40">
          {items.map((item, i) => (
            item.type === "image" ? (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${
                  i === idx ? "border-white scale-105" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <NextImage
                  src={item.content}
                  alt={item.title}
                  width={48} height={48}
                  className="object-cover w-full h-full"
                  unoptimized
                />
              </button>
            ) : null
          ))}
        </div>
      )}

      {/* ─── Tabs multi-media (icônes en bas si types mixtes) ─── */}
      {items.length > 1 && images.length !== items.length && (
        <div className="flex gap-1.5 justify-center px-4 pb-3 flex-shrink-0 flex-wrap">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all ${
                i === idx
                  ? "bg-white text-black font-semibold"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
              }`}
            >
              {typeIcon(item.type, "h-3 w-3")}
              <span className="max-w-[80px] truncate">{item.title || typeLabel(item.type)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function typeIcon(type: MediaItem["type"], cls = "h-4 w-4") {
  switch (type) {
    case "image": return <ImageIcon className={`${cls} text-blue-400`} />
    case "audio": return <Volume2 className={`${cls} text-green-400`} />
    case "video": return <Film className={`${cls} text-purple-400`} />
    case "document": return <FileText className={`${cls} text-orange-400`} />
    default: return <FileText className={`${cls} text-sky-400`} />
  }
}

function typeLabel(type: MediaItem["type"]) {
  switch (type) {
    case "image": return "Image"
    case "audio": return "Audio"
    case "video": return "Vidéo"
    case "document": return "Document"
    default: return "Note"
  }
}
