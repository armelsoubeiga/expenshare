"use client"

import { useCallback, useEffect, useState } from "react"
import { db } from "@/lib/database"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Trash2,
  ShieldCheck,
  ShieldOff,
  Crown,
  Users,
  Activity,
  Loader2,
  TrendingUp,
  FolderOpen,
  Clock,
  ShieldAlert,
} from "lucide-react"
import type { User } from "@/lib/types"

type ManagedUser = Omit<User, "id"> & {
  id: string
  is_admin: boolean
  created_at?: string | Date | null
}

type UserActivity = {
  txCount: number
  budgetCount: number
  totalAmountEur: number
  lastDate: string | null
  projectCount: number
}

type SubTab = "membres" | "activite"

// ── helpers ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500",
  "bg-orange-500", "bg-pink-500", "bg-teal-500", "bg-indigo-500",
]

function avatarColor(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name
    .split(" ")
    .map(w => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?"
}

function relativeDate(raw: string | Date | null | undefined): string | null {
  if (!raw) return null
  try {
    const diff = Date.now() - new Date(raw).getTime()
    const d = Math.floor(diff / 86_400_000)
    if (d <= 0) return "Aujourd'hui"
    if (d === 1) return "Hier"
    if (d < 7) return `Il y a ${d} jours`
    if (d < 30) return `Il y a ${Math.floor(d / 7)} sem.`
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(raw))
  } catch {
    return null
  }
}

function shortDate(raw: string | Date | null | undefined): string | null {
  if (!raw) return null
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(raw))
  } catch {
    return null
  }
}

function fmtEur(n: number) {
  const whole = Number.isInteger(n)
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n)
}

// ── sub-tab pill ────────────────────────────────────────────────────────────

interface SubTabBarProps {
  active: SubTab
  onChange: (t: SubTab) => void
}

function SubTabBar({ active, onChange }: SubTabBarProps) {
  const tabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "membres", label: "Membres", icon: <Users className="w-4 h-4" /> },
    { id: "activite", label: "Activité", icon: <Activity className="w-4 h-4" /> },
  ]
  return (
    <div className="border-b border-border mb-6">
      <div className="flex">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              active === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Avatar circle ───────────────────────────────────────────────────────────

function UserAvatar({ user }: { user: ManagedUser }) {
  return (
    <div
      className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${avatarColor(user.id)}`}
    >
      {initials(user.name)}
    </div>
  )
}

// ── main component ──────────────────────────────────────────────────────────

export function UserManagementPage() {
  const [subTab, setSubTab] = useState<SubTab>("membres")
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [superAdminId, setSuperAdminId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [promoteUserId, setPromoteUserId] = useState<string | null>(null)
  const [revokeUserId, setRevokeUserId] = useState<string | null>(null)

  const [activityMap, setActivityMap] = useState<Map<string, UserActivity>>(new Map())
  const [activityLoading, setActivityLoading] = useState(false)

  // ── loaders ───────────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await db.users.toArray()
      const normalized = list.reduce<ManagedUser[]>((acc, user) => {
        if (!user?.id) return acc
        acc.push({
          ...user,
          id: String(user.id),
          is_admin: !!((user as unknown as Record<string, unknown>).is_admin),
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
    } finally {
      setLoading(false)
    }
  }, [])

  const loadActivity = useCallback(async () => {
    setActivityLoading(true)
    try {
      const dbAny = db as unknown as { getUserActivityStats?: () => Promise<{ userId: string; txCount: number; budgetCount: number; totalAmountEur: number; lastDate: string | null; projectCount: number }[]> }
      const stats = typeof dbAny.getUserActivityStats === "function"
        ? await dbAny.getUserActivityStats()
        : []
      const map = new Map<string, UserActivity>()
      for (const s of stats) {
        map.set(s.userId, {
          txCount: s.txCount,
          budgetCount: s.budgetCount,
          totalAmountEur: s.totalAmountEur,
          lastDate: s.lastDate,
          projectCount: s.projectCount,
        })
      }
      setActivityMap(map)
    } catch {
      // silently fail — activity is bonus info
    } finally {
      setActivityLoading(false)
    }
  }, [])

  useEffect(() => { void loadUsers() }, [loadUsers])

  useEffect(() => {
    if (subTab === "activite") void loadActivity()
  }, [subTab, loadActivity])

  // ── derived ────────────────────────────────────────────────────────────────

  const canManage = users.some(u => u.id === currentUserId && u.is_admin)
  const adminCount = users.filter(u => u.is_admin).length
  const nonAdminCount = users.length - adminCount

  // ── actions ────────────────────────────────────────────────────────────────

  const handlePromoteAdmin = useCallback(async (userId: string) => {
    setLoading(true); setError(null)
    try {
      await db.promoteToAdmin(userId)
      await loadUsers()
      setPromoteUserId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la promotion")
    } finally { setLoading(false) }
  }, [loadUsers])

  const handleRevokeAdmin = useCallback(async (userId: string) => {
    setLoading(true); setError(null)
    try {
      await db.revokeAdmin(userId)
      await loadUsers()
      setRevokeUserId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la révocation")
    } finally { setLoading(false) }
  }, [loadUsers])

  const actuallyDelete = useCallback(async (userId: string) => {
    if (!canManage || userId === superAdminId || userId === currentUserId) return
    setLoading(true); setError(null)
    try {
      await db.deleteUser(userId)
      await loadUsers()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression")
    } finally { setLoading(false); setConfirmDeleteId(null) }
  }, [canManage, superAdminId, currentUserId, loadUsers])

  const userName = (userId: string) => users.find(u => u.id === userId)?.name ?? userId

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Stats summary */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-card border border-border rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{users.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Membres</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{adminCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Admins</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{nonAdminCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Membres</p>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!canManage && !loading && (
          <Alert className="mb-4">
            <ShieldAlert className="w-4 h-4" />
            <AlertDescription>Seul un administrateur peut gérer les membres.</AlertDescription>
          </Alert>
        )}

        <SubTabBar active={subTab} onChange={setSubTab} />

        {/* ── Onglet Membres ── */}
        {subTab === "membres" && (
          loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {users.map(user => {
                const isSuperAdmin = superAdminId === user.id
                const isCurrentUser = currentUserId === user.id
                const canDelete = canManage && !isSuperAdmin && !isCurrentUser
                const joinedDate = shortDate(user.created_at)

                return (
                  <div
                    key={user.id}
                    className={`bg-card border rounded-2xl overflow-hidden transition-shadow hover:shadow-sm ${
                      isCurrentUser ? "border-primary/30 ring-1 ring-primary/20" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-4">
                      <UserAvatar user={user} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{user.name}</span>
                          {isSuperAdmin && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium flex-shrink-0">
                              <Crown className="w-3 h-3" /> Super Admin
                            </span>
                          )}
                          {!isSuperAdmin && user.is_admin && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 font-medium flex-shrink-0">
                              <ShieldCheck className="w-3 h-3" /> Admin
                            </span>
                          )}
                          {isCurrentUser && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex-shrink-0">vous</span>
                          )}
                        </div>
                        {joinedDate && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Membre depuis {joinedDate}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {canManage && !user.is_admin && (
                          <button
                            disabled={loading}
                            onClick={() => setPromoteUserId(user.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400 transition-colors disabled:opacity-50"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Nommer admin
                          </button>
                        )}
                        {canManage && user.is_admin && !isSuperAdmin && !isCurrentUser && (
                          <button
                            disabled={loading}
                            onClick={() => setRevokeUserId(user.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/20 dark:border-orange-800 dark:text-orange-400 transition-colors disabled:opacity-50"
                          >
                            <ShieldOff className="w-3.5 h-3.5" /> Retirer
                          </button>
                        )}
                        <button
                          disabled={!canDelete || loading}
                          onClick={() => canDelete && setConfirmDeleteId(user.id)}
                          title={
                            isCurrentUser
                              ? "Vous ne pouvez pas vous supprimer vous-même"
                              : isSuperAdmin
                              ? "Le super administrateur ne peut pas être supprimé"
                              : "Supprimer cet utilisateur"
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-red-500 hover:bg-red-600 text-white disabled:bg-muted disabled:text-muted-foreground"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {users.length === 0 && (
                <div className="text-center py-16 text-sm text-muted-foreground bg-card border border-border rounded-2xl">
                  Aucun membre trouvé
                </div>
              )}
            </div>
          )
        )}

        {/* ── Onglet Activité ── */}
        {subTab === "activite" && (
          activityLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {[...users]
                .sort((a, b) => {
                  const da = activityMap.get(a.id)?.lastDate ?? ""
                  const db2 = activityMap.get(b.id)?.lastDate ?? ""
                  return db2.localeCompare(da)
                })
                .map(user => {
                  const act = activityMap.get(user.id)
                  const isSuperAdmin = superAdminId === user.id
                  const isCurrentUser = currentUserId === user.id
                  const totalTx = (act?.txCount ?? 0) + (act?.budgetCount ?? 0)
                  const hasActivity = totalTx > 0

                  return (
                    <div
                      key={user.id}
                      className={`bg-card border rounded-2xl p-4 transition-shadow hover:shadow-sm ${
                        isCurrentUser ? "border-primary/30 ring-1 ring-primary/20" : "border-border"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <UserAvatar user={user} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="font-semibold text-sm">{user.name}</span>
                            {isSuperAdmin && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium">
                                <Crown className="w-3 h-3" /> Super Admin
                              </span>
                            )}
                            {!isSuperAdmin && user.is_admin && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 font-medium">
                                <ShieldCheck className="w-3 h-3" /> Admin
                              </span>
                            )}
                            {isCurrentUser && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">vous</span>
                            )}
                          </div>

                          {hasActivity ? (
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                                <div className="flex items-center justify-center gap-1 mb-0.5">
                                  <TrendingUp className="w-3 h-3 text-red-500" />
                                </div>
                                <p className="text-sm font-bold">{act?.txCount ?? 0}</p>
                                <p className="text-xs text-muted-foreground">Dépenses</p>
                              </div>
                              <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                                <div className="flex items-center justify-center gap-1 mb-0.5">
                                  <FolderOpen className="w-3 h-3 text-blue-500" />
                                </div>
                                <p className="text-sm font-bold">{act?.projectCount ?? 0}</p>
                                <p className="text-xs text-muted-foreground">Projets</p>
                              </div>
                              <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                                <div className="flex items-center justify-center gap-1 mb-0.5">
                                  <Activity className="w-3 h-3 text-emerald-500" />
                                </div>
                                <p className="text-xs font-bold leading-tight">{fmtEur(act?.totalAmountEur ?? 0)}</p>
                                <p className="text-xs text-muted-foreground">Total</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">Aucune activité enregistrée</p>
                          )}

                          {act?.lastDate && (
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Dernière activité : {relativeDate(act.lastDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

              {users.length === 0 && (
                <div className="text-center py-16 text-sm text-muted-foreground bg-card border border-border rounded-2xl">
                  Aucun membre
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* ── Confirm : nommer admin ── */}
      <AlertDialog open={!!promoteUserId} onOpenChange={open => !open && setPromoteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nommer administrateur</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{promoteUserId ? userName(promoteUserId) : ""}</strong> obtiendra les droits d&apos;administration.
              <br /><br />
              Vous conservez vos propres droits — ce n&apos;est pas un transfert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPromoteUserId(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (promoteUserId) await handlePromoteAdmin(promoteUserId) }}>
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm : retirer admin ── */}
      <AlertDialog open={!!revokeUserId} onOpenChange={open => !open && setRevokeUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer les droits admin</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{revokeUserId ? userName(revokeUserId) : ""}</strong> perdra ses droits d&apos;administration et redeviendra un membre standard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRevokeUserId(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600"
              onClick={async () => { if (revokeUserId) await handleRevokeAdmin(revokeUserId) }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm : supprimer utilisateur ── */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={open => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le membre</AlertDialogTitle>
            <AlertDialogDescription>
              Supprimer <strong>{confirmDeleteId ? userName(confirmDeleteId) : ""}</strong> ? Ses données resteront dans les projets mais il ne pourra plus se connecter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteId(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={async () => { if (confirmDeleteId) await actuallyDelete(confirmDeleteId) }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── Legacy modal wrapper (kept for compatibility during transition) ──────────
// Not used anymore — sidebar/header navigate directly to user-management page
export function UserManagement(_props: { isOpen?: boolean; onClose?: () => void }) {
  return null
}
