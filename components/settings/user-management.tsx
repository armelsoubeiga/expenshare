"use client"

import { useCallback, useEffect, useState } from "react"
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
import type { User } from "@/lib/types"

type ManagedUser = Omit<User, "id"> & {
  id: string
  is_admin?: boolean
}

interface UserManagementProps {
  isOpen: boolean
  onClose: () => void
}

export function UserManagement({ isOpen, onClose }: UserManagementProps) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [adminId, setAdminId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    try {
      setError(null)

      const list = await db.users.toArray()
      const normalizedUsers = list.reduce<ManagedUser[]>((acc, user) => {
        if (!user?.id) {
          return acc
        }

        const adminProperty = (user as unknown as { is_admin?: unknown }).is_admin
        const adminFlag = typeof adminProperty === "boolean" ? adminProperty : undefined

        acc.push({
          ...user,
          id: String(user.id),
          is_admin: adminFlag,
        })

        return acc
      }, [])

      setUsers(normalizedUsers)

      const adminIdentifier = await db.getAdminUserId()
      setAdminId(adminIdentifier ? String(adminIdentifier) : null)

      const storedUser =
        typeof window !== "undefined"
          ? localStorage.getItem("expenshare_current_user") ?? localStorage.getItem("expenshare_user")
          : null

      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser) as { id?: unknown }
          setCurrentUserId(parsed?.id != null ? String(parsed.id) : null)
        } catch {
          setCurrentUserId(null)
        }
      } else {
        setCurrentUserId(null)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur de chargement"
      setError(message)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    void loadUsers()
  }, [isOpen, loadUsers])

  const canManage = Boolean(currentUserId && adminId && currentUserId === adminId)

  const refresh = useCallback(async () => {
    await loadUsers()
  }, [loadUsers])

  const actuallyDelete = useCallback(
    async (userId: string) => {
      if (!canManage) {
        return
      }

      if (adminId && userId === adminId) {
        return
      }

      setLoading(true)
      setError(null)

      try {
        await db.deleteUser(userId)
        await refresh()
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Erreur lors de la suppression"
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [adminId, canManage, refresh],
  )

  const handleDelete = useCallback(
    (userId: string) => {
      if (!canManage) {
        return
      }

      if (adminId && adminId === userId) {
        return
      }

      setConfirmUserId(userId)
    },
    [adminId, canManage],
  )

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Gestion des utilisateurs {canManage ? <Shield className="w-4 h-4 text-green-600" /> : null}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {!canManage ? (
          <p className="text-sm text-muted-foreground">Seul l&rsquo;utilisateur admin peut supprimer des utilisateurs.</p>
        ) : null}
        <div className="space-y-2 max-h-[50vh] overflow-auto">
          {users.map((user) => {
            const isAdminUser = adminId === user.id
            const isCurrentUser = currentUserId === user.id

            return (
              <div key={user.id} className="flex items-center justify-between border rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                  <span className="font-medium">{user.name}</span>
                  {isAdminUser ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">admin</span>
                  ) : null}
                  {isCurrentUser ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">vous</span>
                  ) : null}
              </div>
              <div>
                <Button
                  variant="destructive"
                  size="sm"
                    disabled={!canManage || isAdminUser || loading}
                    onClick={() => handleDelete(user.id)}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Supprimer
                </Button>
              </div>
              </div>
            )
          })}
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
              Supprimer cet utilisateur ? Ses projets et opérations seront réassignés à l&rsquo;admin.
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
