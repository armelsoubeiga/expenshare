"use client"

import { useEffect, useState } from "react"
import { db } from "@/lib/database"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog as ConfirmDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as ConfirmDialogContent,
  AlertDialogDescription as ConfirmDialogDescription,
  AlertDialogFooter as ConfirmDialogFooter,
  AlertDialogHeader as ConfirmDialogHeader,
  AlertDialogTitle as ConfirmDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Trash2, Shield } from "lucide-react"

interface UserManagementProps {
  isOpen: boolean
  onClose: () => void
}

export function UserManagement({ isOpen, onClose }: UserManagementProps) {
  const [users, setUsers] = useState<any[]>([])
  const [adminId, setAdminId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const init = async () => {
      try {
        setError(null)
        const list = await db.users.toArray()
        setUsers(list)
  const aId = await db.getAdminUserId()
  setAdminId(aId ? String(aId) : null)
  const storedUser = localStorage.getItem("expenshare_current_user") || localStorage.getItem("expenshare_user")
        if (storedUser) setCurrentUserId(String(JSON.parse(storedUser).id))
      } catch (e: any) {
        setError(e?.message || "Erreur de chargement")
      }
    }
    init()
  }, [isOpen])

  const canManage = !!currentUserId && !!adminId && String(currentUserId) === String(adminId)

  const refresh = async () => {
    const list = await db.users.toArray()
    setUsers(list)
  }

  const actuallyDelete = async (userId: string) => {
    if (!canManage) return
    if (String(adminId) === String(userId)) return
    setLoading(true)
    setError(null)
    try {
  await db.deleteUser(String(userId))
  await refresh()
    } catch (e: any) {
      setError(e?.message || "Erreur lors de la suppression")
    } finally {
      setLoading(false)
    }
  }
  const handleDelete = (userId: number | string) => {
    if (!canManage) return
    if (String(adminId) === String(userId)) return
    setConfirmUserId(String(userId))
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Gestion des utilisateurs {canManage ? <Shield className="w-4 h-4 text-green-600" /> : null}
          </DialogTitle>
        </DialogHeader>
        {error && (
          <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        )}
        {!canManage ? (
          <p className="text-sm text-muted-foreground">Seul l'utilisateur admin peut supprimer des utilisateurs.</p>
        ) : null}
        <div className="space-y-2 max-h-[50vh] overflow-auto">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between border rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{u.name}</span>
                {String(adminId) === String(u.id) ? (
                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">admin</span>
                ) : null}
                {currentUserId === u.id ? (
                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">vous</span>
                ) : null}
              </div>
              <div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!canManage || String(adminId) === String(u.id) || loading}
                  onClick={() => handleDelete(String(u.id))}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </div>
      </DialogContent>
      {/* Confirmation dialog */}
      <ConfirmDialog open={!!confirmUserId} onOpenChange={(open) => !open && setConfirmUserId(null)}>
        <ConfirmDialogContent>
          <ConfirmDialogHeader>
            <ConfirmDialogTitle>Confirmation</ConfirmDialogTitle>
            <ConfirmDialogDescription>
              Supprimer cet utilisateur ? Ses projets et opérations seront réassignés à l'admin.
            </ConfirmDialogDescription>
          </ConfirmDialogHeader>
          <ConfirmDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmUserId(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmUserId) {
                  await actuallyDelete(confirmUserId)
                  setConfirmUserId(null)
                }
              }}
            >
              OK
            </AlertDialogAction>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </ConfirmDialog>
    </Dialog>
  )
}
