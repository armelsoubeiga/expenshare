"use client"

import { useState, useRef, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { ImageIcon, Music, File, Video, MoreVertical, Pencil, Trash2 } from "lucide-react"
import { db } from "@/lib/database"
import type { Transaction, Note } from "@/lib/types"
import { MediaViewer, type MediaItem } from "@/components/ui/media-viewer"

interface TransactionTableProps {
  transactions: Transaction[]
  formatAmount: (tx: Transaction) => string
  showProject?: boolean
  emptyMessage?: string
  /** ID de l'utilisateur courant (pour les droits d'édition) */
  currentUserId?: string | number
  /** IDs des projets dont l'utilisateur courant est propriétaire */
  ownedProjectIds?: Set<number>
  onEdit?: (tx: Transaction) => void
  onDelete?: (tx: Transaction) => void
}

function ActionMenu({
  tx,
  onEdit,
  onDelete,
}: {
  tx: Transaction
  onEdit: (tx: Transaction) => void
  onDelete: (tx: Transaction) => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmDel(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const handleDelete = async () => {
    setDeleting(true)
    onDelete(tx)
    setDeleting(false)
    setOpen(false)
    setConfirmDel(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(v => !v); setConfirmDel(false) }}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Modifier */}
          <button
            onClick={() => { onEdit(tx); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-left"
          >
            <Pencil className="h-4 w-4 text-blue-500" />
            Modifier
          </button>

          <div className="border-t border-border" />

          {/* Supprimer */}
          {!confirmDel ? (
            <button
              onClick={() => setConfirmDel(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 transition-colors text-left"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </button>
          ) : (
            <div className="p-2.5 space-y-2">
              <p className="text-xs text-red-600 font-medium">Supprimer définitivement ?</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setConfirmDel(false)}
                  className="flex-1 h-7 rounded-lg border border-border text-xs hover:bg-muted transition-colors"
                >
                  Non
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 h-7 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? "…" : "Oui"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function TransactionTable({
  transactions,
  formatAmount,
  showProject = true,
  emptyMessage = "Aucune transaction",
  currentUserId,
  ownedProjectIds,
  onEdit,
  onDelete,
}: TransactionTableProps) {
  const [viewerItems, setViewerItems] = useState<MediaItem[] | null>(null)
  const [viewerStart, setViewerStart] = useState(0)

  const canEdit = (tx: Transaction): boolean => {
    if (!currentUserId || (!onEdit && !onDelete)) return false
    const uid = String(currentUserId)
    if (String(tx.user_id) === uid) return true
    if (ownedProjectIds?.has(tx.project_id)) return true
    return false
  }

  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">{emptyMessage}</p>
  }

  const handleMedia = async (tx: Transaction, preferType?: MediaItem["type"]) => {
    if (!tx.id) return
    const notes: Note[] = await db.getNotesByTransaction(tx.id)
    const items: MediaItem[] = []

    // Résolution d'URL : deux formats coexistent dans la base
    // - Nouvelles notes  : content = "/api/media?key=image/uuid.jpg",  file_path = nom fichier
    // - Notes migrées    : content = URL Supabase (morte),             file_path = clé B2 (ex: "image/uuid.jpg")
    const resolveMediaUrl = (n: Note): string => {
      // Format nouveau : content est déjà une URL B2 via le proxy interne
      if (n.content && n.content.startsWith('/api/media')) return n.content
      // Format migré : file_path contient la clé B2 (contient "/" mais pas "http")
      if (n.file_path && n.file_path.includes('/') && !n.file_path.startsWith('http')) {
        return `/api/media?key=${encodeURIComponent(n.file_path)}`
      }
      // Fallback : retourner content tel quel (peut être null/vide)
      return n.content ?? ''
    }

    for (const n of notes) {
      if (n.content_type === "image") items.push({ type: "image", content: resolveMediaUrl(n), title: n.file_path?.split('/').pop() || "Image" })
      else if (n.content_type === "video") items.push({ type: "video", content: resolveMediaUrl(n), title: n.file_path?.split('/').pop() || "Vidéo" })
      else if (n.content_type === "audio") items.push({ type: "audio", content: resolveMediaUrl(n), title: n.file_path?.split('/').pop() || "Audio" })
      else if (n.content_type === "text" && n.file_path) items.push({ type: "document", content: resolveMediaUrl(n), title: n.file_path })
      else if (n.content_type === "text" && !n.file_path && n.content?.trim()) items.push({ type: "text", content: n.content, title: "Note" })
    }
    if (tx.description && !/^data:/.test(String(tx.description)) && String(tx.description).trim()) {
      if (!items.find(i => i.type === "text")) items.push({ type: "text", content: String(tx.description), title: "Note" })
    }
    if (items.length === 0) return

    let start = 0
    if (preferType) { const i = items.findIndex(it => it.type === preferType); if (i !== -1) start = i }
    setViewerStart(start)
    setViewerItems(items)
  }

  const txTitle = (tx: Transaction) =>
    tx.parent_category_name && tx.category_name
      ? `${tx.parent_category_name} / ${tx.category_name}`
      : tx.category_name || tx.title || "—"

  const hasMedia = (tx: Transaction) =>
    tx.has_image || tx.has_audio || tx.has_document || (tx as any).has_video ||
    (tx.description && !/^data:/.test(String(tx.description)) && String(tx.description).trim().length > 0)

  const hasActions = transactions.some(tx => canEdit(tx))

  return (
    <>
      <div className="relative">
        <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-card to-transparent z-10 md:hidden" />
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0" style={{ WebkitOverflowScrolling: "touch" }}>
          <table className="w-full text-sm min-w-[580px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2.5 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap w-[90px]">Type</th>
                <th className="text-left py-2.5 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Titre</th>
                <th className="text-right py-2.5 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">Montant</th>
                {showProject && <th className="text-left py-2.5 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">Projet</th>}
                <th className="text-left py-2.5 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">Utilisateur</th>
                <th className="text-center py-2.5 pr-3 font-medium text-muted-foreground text-xs uppercase tracking-wide w-[70px]">Média</th>
                <th className="text-left py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">Date</th>
                {hasActions && <th className="w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className={`group transition-colors ${
                    tx.type === "expense"
                      ? "hover:bg-red-50/40 dark:hover:bg-red-950/10"
                      : "hover:bg-blue-50/40 dark:hover:bg-blue-950/10"
                  }`}
                >
                  <td className="py-2.5 pr-3">
                    <Badge variant={tx.type === "expense" ? "destructive" : "default"} className="text-xs font-medium">
                      {tx.type === "expense" ? "Dépense" : "Budget"}
                    </Badge>
                  </td>

                  <td className="py-2.5 pr-3 font-medium max-w-[200px]">
                    <span className="truncate block" title={txTitle(tx)}>{txTitle(tx)}</span>
                  </td>

                  <td className="py-2.5 pr-3 text-right font-semibold whitespace-nowrap">
                    <span className={tx.type === "expense" ? "text-red-600" : "text-blue-600"}>
                      {formatAmount(tx)}
                    </span>
                  </td>

                  {showProject && (
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-sm leading-none">{tx.project_icon || "📁"}</span>
                        <span className="text-sm max-w-[100px] truncate">{tx.project_name}</span>
                      </div>
                    </td>
                  )}

                  <td className="py-2.5 pr-3 text-muted-foreground whitespace-nowrap text-xs">
                    {tx.user_name || "—"}
                  </td>

                  <td className="py-2.5 pr-3 text-center">
                    {hasMedia(tx) ? (
                      <div className="inline-flex items-center gap-0.5">
                        {tx.has_image && (
                          <button onClick={() => handleMedia(tx, "image")} className="p-1 rounded hover:bg-muted transition-colors" title="Images">
                            <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
                          </button>
                        )}
                        {(tx as any).has_video && (
                          <button onClick={() => handleMedia(tx, "video")} className="p-1 rounded hover:bg-muted transition-colors" title="Vidéos">
                            <Video className="h-3.5 w-3.5 text-purple-500" />
                          </button>
                        )}
                        {tx.has_audio && (
                          <button onClick={() => handleMedia(tx, "audio")} className="p-1 rounded hover:bg-muted transition-colors" title="Audio">
                            <Music className="h-3.5 w-3.5 text-green-500" />
                          </button>
                        )}
                        {tx.has_document && (
                          <button onClick={() => handleMedia(tx, "document")} className="p-1 rounded hover:bg-muted transition-colors" title="Document">
                            <File className="h-3.5 w-3.5 text-orange-500" />
                          </button>
                        )}
                        {!tx.has_image && !(tx as any).has_video && !tx.has_audio && !tx.has_document && (
                          <button onClick={() => handleMedia(tx)} className="p-1 rounded hover:bg-muted transition-colors" title="Note">
                            <File className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/30 text-xs">—</span>
                    )}
                  </td>

                  <td className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {tx.created_at
                      ? new Date(tx.created_at).toLocaleString("fr-FR", {
                          day: "2-digit", month: "2-digit", year: "2-digit",
                          hour: "2-digit", minute: "2-digit",
                        })
                      : "—"}
                  </td>

                  {/* Actions (edit/delete) — uniquement pour les ayants droit */}
                  {hasActions && (
                    <td className="py-2 pl-1">
                      {canEdit(tx) && onEdit && onDelete && (
                        <ActionMenu tx={tx} onEdit={onEdit} onDelete={onDelete} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewerItems && (
        <MediaViewer items={viewerItems} startIndex={viewerStart} onClose={() => setViewerItems(null)} />
      )}
    </>
  )
}
