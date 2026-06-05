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
import { Trash2, Shield, ShieldCheck, ShieldOff, Crown } from "lucide-react"
import type { User } from "@/lib/types"

type ManagedUser = Omit<User, "id"> & {
  id: string
  is_admin: boolean
}

interface UserManagementProps {
  isOpen: boolean
  onClose: () => void
}

export function UserManagement({ isOpen, onClose }: UserManagementProps) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [superAdminId, setSuperAdminId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [promoteUserId, setPromoteUserId] = useState<string | null>(null)
  const [revokeUserId, setRevokeUserId] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    try {
      setError(null)
      const list = await db.users.toArray()
      const normalized = list.reduce<ManagedUser[]>((acc, user) => {
        if (!user?.id) return acc
        acc.push({
          ...user,
          id: String(user.id),
          is_admin: !!(user as unknown as { is_admin?: unknown }).is_admin,
        })
        return acc
      }, [])
      setUsers(normalized)

      const sid = await db.getAdminUserId()
      setSuperAdminId(sid ? String(sid) : null)

      const stored =
        typeof window !== "undefined"
          ? localStorage.getItem("expenshare_current_user") ?? localStorage.getItem("expenshare_user")
          : null
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { id?: unknown }
          setCurrentUserId(parsed?.id != null ? String(parsed.id) : null)
        } catch {
          setCurrentUserId(null)
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de chargement")
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    void loadUsers()
  }, [isOpen, loadUsers])

  // Un admin (pas seulement super admin) peut gérer les utilisateurs
  const currentUserIsAdmin = users.some(u => u.id === currentUserId && u.is_admin)
  const canManage = Boolean(currentUserId && currentUserIsAdmin)

  const refresh = useCallback(async () => { await loadUsers() }, [loadUsers])

  const handlePromoteAdmin = useCallback(async (userId: string) => {
    if (!canManage) return
    setLoading(true)
    setError(null)
    try {
      await db.promoteToAdmin(userId)
      await refresh()
      setPromoteUserId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la promotion")
    } finally {
      setLoading(false)
    }
  }, [canManage, refresh])

  const handleRevokeAdmin = useCallback(async (userId: string) => {
    if (!canManage) return
    setLoading(true)
    setError(null)
    try {
      await db.revokeAdmin(userId)
      await refresh()
      setRevokeUserId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la révocation")
    } finally {
      setLoading(false)
    }
  }, [canManage, refresh])

  const handleDelete = useCallback((userId: string) => {
    if (!canManage) return
    if (userId === superAdminId) return
    setConfirmDeleteId(userId)
  }, [canManage, superAdminId])

  const actuallyDelete = useCallback(async (userId: string) => {
    if (!canManage || userId === superAdminId) return
    setLoading(true)
    setError(null)
    try {
      await db.deleteUser(userId)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression")
    } finally {
      setLoading(false)
      setConfirmDeleteId(null)
    }
  }, [canManage, superAdminId, refresh])

  const userName = (userId: string) => users.find(u => u.id === userId)?.name ?? userId

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Gestion des utilisateurs
            {canManage && <Shield className="w-4 h-4 text-green-600" />}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!canManage && (
          <p className="text-sm text-muted-foreground">Seul un administrateur peut gérer les utilisateurs.</p>
        )}

        <div className="space-y-2 max-h-[50vh] overflow-auto">
          {users.map((user) => {
            const isSuperAdmin = superAdminId === user.id
            const isCurrentUser = currentUserId === user.id

            return (
              <div key={user.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{user.name}</span>
                  {isSuperAdmin && (
                    <span className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 flex-shrink-0">
                      <Crown className="w-3 h-3" /> Super Admin
                    </span>
                  )}
                  {!isSuperAdmin && user.is_admin && (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 flex-shrink-0">
                      Admin
                    </span>
                  )}
                  {isCurrentUser && (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">vous</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {canManage && !user.is_admin && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => setPromoteUserId(user.id)}
                      title="Nommer administrateur"
                      className="text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950/20"
                    >
                      <ShieldCheck className="w-4 h-4 mr-1" /> Admin
                    </Button>
                  )}
                  {canManage && user.is_admin && !isSuperAdmin && !isCurrentUser && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => setRevokeUserId(user.id)}
                      title="Retirer les droits admin"
                      className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                    >
                      <ShieldOff className="w-4 h-4 mr-1" /> Retirer
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!canManage || isSuperAdmin || loading}
                    onClick={() => handleDelete(user.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </div>
      </DialogContent>

      {/* Confirmation — nommer admin */}
      <ConfirmDialog open={!!promoteUserId} onOpenChange={(open) => !open && setPromoteUserId(null)}>
        <ConfirmDialogContent>
          <ConfirmDialogHeader>
            <ConfirmDialogTitle>Nommer administrateur</ConfirmDialogTitle>
            <ConfirmDialogDescription>
              <strong>{promoteUserId ? userName(promoteUserId) : ""}</strong> obtiendra les droits d&apos;administration (gestion des utilisateurs, accès à tous les projets).
              <br /><br />
              Vous conservez vos droits — ce n&apos;est pas un transfert.
            </ConfirmDialogDescription>
          </ConfirmDialogHeader>
          <ConfirmDialogFooter>
            <AlertDialogCancel onClick={() => setPromoteUserId(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (promoteUserId) await handlePromoteAdmin(promoteUserId) }}
            >
              Confirmer
            </AlertDialogAction>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </ConfirmDialog>

      {/* Confirmation — retirer admin */}
      <ConfirmDialog open={!!revokeUserId} onOpenChange={(open) => !open && setRevokeUserId(null)}>
        <ConfirmDialogContent>
          <ConfirmDialogHeader>
            <ConfirmDialogTitle>Retirer les droits admin</ConfirmDialogTitle>
            <ConfirmDialogDescription>
              <strong>{revokeUserId ? userName(revokeUserId) : ""}</strong> perdra ses droits d&apos;administration et redeviendra un utilisateur standard.
            </ConfirmDialogDescription>
          </ConfirmDialogHeader>
          <ConfirmDialogFooter>
            <AlertDialogCancel onClick={() => setRevokeUserId(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600"
              onClick={async () => { if (revokeUserId) await handleRevokeAdmin(revokeUserId) }}
            >
              Retirer
            </AlertDialogAction>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </ConfirmDialog>

      {/* Confirmation — supprimer utilisateur */}
      <ConfirmDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <ConfirmDialogContent>
          <ConfirmDialogHeader>
            <ConfirmDialogTitle>Supprimer l&apos;utilisateur</ConfirmDialogTitle>
            <ConfirmDialogDescription>
              Supprimer <strong>{confirmDeleteId ? userName(confirmDeleteId) : ""}</strong> ? Ses projets et opérations seront réassignés à l&apos;administrateur.
            </ConfirmDialogDescription>
          </ConfirmDialogHeader>
          <ConfirmDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteId(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (confirmDeleteId) await actuallyDelete(confirmDeleteId) }}
            >
              Supprimer
            </AlertDialogAction>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </ConfirmDialog>
    </Dialog>
  )
}
