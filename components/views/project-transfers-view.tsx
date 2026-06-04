"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, Plus, ArrowRight, ArrowLeft, Trash2, Link2, CheckCircle2 } from "lucide-react"
import { useDatabase } from "@/hooks/use-database"
import type { TursoDatabaseInstance } from "@/lib/database-turso"
import type { ProjectWithId, CurrencyCode } from "@/lib/types"

interface ProjectTransfersViewProps {
  projectId: number
  onBack: () => void
}

const CURRENCIES: CurrencyCode[] = ["EUR", "CFA", "USD"]
const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = { EUR: "€", CFA: "CFA", USD: "$" }

export function ProjectTransfersView({ projectId, onBack }: ProjectTransfersViewProps) {
  const { db } = useDatabase()
  const database = db as TursoDatabaseInstance | null

  const [project, setProject] = useState<ProjectWithId | null>(null)
  const [allProjects, setAllProjects] = useState<ProjectWithId[]>([])
  const [outgoing, setOutgoing] = useState<any[]>([])
  const [incoming, setIncoming] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [projectCurrency, setProjectCurrency] = useState<CurrencyCode>("EUR")
  const [eurToCfa, setEurToCfa] = useState(655.957)
  const [eurToUsd, setEurToUsd] = useState(1.0)

  // Formulaire de nouveau transfert
  const [showForm, setShowForm] = useState(false)
  const [targetProjectId, setTargetProjectId] = useState("")
  const [direction, setDirection] = useState<'out' | 'in'>('out')
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const loadData = useCallback(async () => {
    if (!database) return
    setIsLoading(true)
    try {
      const [proj, storedUser] = [
        await database.getProjectById(projectId),
        localStorage.getItem("expenshare_user"),
      ]
      setProject(proj as ProjectWithId | null)

      const user = storedUser ? JSON.parse(storedUser) : null
      if (user?.id) {
        const projects = await database.getUserProjects(user.id)
        setAllProjects((projects as ProjectWithId[]).filter(p => p.id !== projectId))
      }

      const [transfers, cfaSetting, usdSetting] = await Promise.all([
        database.getProjectBudgetTransfers(projectId),
        database.settings.get(`project:${projectId}:eur_to_cfa`),
        database.settings.get(`project:${projectId}:eur_to_usd`),
      ])
      setOutgoing(transfers.outgoing)
      setIncoming(transfers.incoming)

      if (proj?.currency) setProjectCurrency(proj.currency as CurrencyCode)
      if (cfaSetting?.value && !isNaN(Number(cfaSetting.value))) setEurToCfa(Number(cfaSetting.value))
      if (usdSetting?.value && !isNaN(Number(usdSetting.value))) setEurToUsd(Number(usdSetting.value))
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }, [database, projectId])

  useEffect(() => { loadData() }, [loadData])

  const formatAmt = (eur: number, cfa: number, usd: number) => {
    const cur = projectCurrency === 'CFA' ? 'XOF' : projectCurrency
    const val = projectCurrency === 'CFA' ? cfa : projectCurrency === 'USD' ? usd : eur
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(val)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetProjectId || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Sélectionnez un projet et entrez un montant valide")
      return
    }
    if (!database) { setError("Base de données non disponible"); return }

    setIsSaving(true)
    setError("")
    try {
      const inputAmt = Number(amount)
      const cur = projectCurrency.toUpperCase()
      let eur = 0, cfa = 0, usd = 0
      if (cur === 'EUR') { eur = inputAmt; cfa = Math.round(inputAmt * eurToCfa); usd = Math.round(inputAmt * eurToUsd * 100) / 100 }
      else if (cur === 'CFA' || cur === 'XOF') { cfa = inputAmt; eur = Math.round((inputAmt / eurToCfa) * 100) / 100; usd = Math.round(eur * eurToUsd * 100) / 100 }
      else if (cur === 'USD') { usd = inputAmt; eur = Math.round((inputAmt / eurToUsd) * 100) / 100; cfa = Math.round(eur * eurToCfa) }

      const source = direction === 'out' ? projectId : Number(targetProjectId)
      const target = direction === 'out' ? Number(targetProjectId) : projectId

      await database.createBudgetTransfer({
        source_project_id: source,
        target_project_id: target,
        amount_eur: eur,
        amount_cfa: cfa,
        amount_usd: usd,
        note: note.trim() || undefined,
      })

      setSuccess(true)
      setShowForm(false)
      setAmount(""); setNote(""); setTargetProjectId(""); setDirection('out')
      await loadData()
      setTimeout(() => setSuccess(false), 2000)
      window.dispatchEvent(new CustomEvent('expenshare:project-updated'))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (transferId: number) => {
    if (!database) return
    await database.deleteProjectBudgetTransfer(transferId)
    await loadData()
    window.dispatchEvent(new CustomEvent('expenshare:project-updated'))
  }

  // Totaux
  const totalOut = outgoing.reduce((s, t) => s + Number(projectCurrency === 'CFA' ? t.amount_cfa : projectCurrency === 'USD' ? t.amount_usd : t.amount_eur), 0)
  const totalIn = incoming.reduce((s, t) => s + Number(projectCurrency === 'CFA' ? t.amount_cfa : projectCurrency === 'USD' ? t.amount_usd : t.amount_eur), 0)

  const fmtVal = (v: number) => {
    const cur = projectCurrency === 'CFA' ? 'XOF' : projectCurrency
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const otherProjects = allProjects.filter(p => {
    const alreadyLinked = [...outgoing.map(t => t.target_project_id), ...incoming.map(t => t.source_project_id)]
    return true // allow multiple transfers, not just one per project pair
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* En-tête projet */}
      <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: `${project?.color}20` }}>
          {project?.icon}
        </div>
        <div>
          <p className="font-semibold">{project?.name}</p>
          <p className="text-xs text-muted-foreground">Gestion des transferts de budget</p>
        </div>
      </div>

      {/* Succès */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl">
          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-400">Transfert enregistré avec succès</p>
        </div>
      )}

      {/* Résumé des transferts */}
      {(outgoing.length > 0 || incoming.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowRight className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-medium text-orange-700 dark:text-orange-400">Prêté</span>
            </div>
            <p className="text-lg font-bold text-orange-600">{fmtVal(totalOut)}</p>
            <p className="text-xs text-muted-foreground">{outgoing.length} transfert{outgoing.length > 1 ? 's' : ''}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowLeft className="h-4 w-4 text-green-500" />
              <span className="text-xs font-medium text-green-700 dark:text-green-400">Reçu</span>
            </div>
            <p className="text-lg font-bold text-green-600">{fmtVal(totalIn)}</p>
            <p className="text-xs text-muted-foreground">{incoming.length} transfert{incoming.length > 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Bouton nouveau transfert */}
      {!showForm && (
        <button
          onClick={() => { setShowForm(true); setError("") }}
          disabled={otherProjects.length === 0}
          className="w-full flex items-center justify-center gap-2 h-12 bg-primary text-primary-foreground rounded-2xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          Enregistrer un transfert
        </button>
      )}

      {otherProjects.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center">Vous devez avoir au moins 2 projets pour créer un transfert.</p>
      )}

      {/* Formulaire de transfert */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-5 space-y-4 animate-slide-up">
          <h3 className="font-semibold">Nouveau transfert de budget</h3>

          {/* Direction */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Direction du transfert</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection('out')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  direction === 'out' ? 'bg-orange-500 text-white border-orange-500' : 'bg-card border-border text-muted-foreground hover:border-orange-300'
                }`}
              >
                <ArrowRight className="h-4 w-4" />
                Ce projet prête
              </button>
              <button
                type="button"
                onClick={() => setDirection('in')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  direction === 'in' ? 'bg-green-500 text-white border-green-500' : 'bg-card border-border text-muted-foreground hover:border-green-300'
                }`}
              >
                <ArrowLeft className="h-4 w-4" />
                Ce projet reçoit
              </button>
            </div>
          </div>

          {/* Description dynamique */}
          <div className="p-3 bg-muted rounded-xl">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{project?.icon} {project?.name}</span>
              {direction === 'out'
                ? <><ArrowRight className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" /><span className="text-muted-foreground">prête du budget à</span></>
                : <><ArrowLeft className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /><span className="text-muted-foreground">reçoit du budget de</span></>
              }
              <span className="font-medium text-foreground">
                {targetProjectId
                  ? (() => { const p = allProjects.find(p => String(p.id) === targetProjectId); return p ? `${p.icon} ${p.name}` : '…' })()
                  : '…'
                }
              </span>
            </div>
          </div>

          {/* Projet cible */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {direction === 'out' ? 'Projet bénéficiaire' : 'Projet source'}
            </label>
            <div className="flex flex-col gap-2">
              {otherProjects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTargetProjectId(String(p.id))}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    targetProjectId === String(p.id) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ backgroundColor: `${p.color}20` }}>
                    {p.icon}
                  </div>
                  <span className="text-sm font-medium">{p.name}</span>
                  {targetProjectId === String(p.id) && <div className="ml-auto w-2 h-2 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
          </div>

          {/* Montant */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Montant ({projectCurrency})</label>
            <div className="flex items-baseline gap-2 p-4 bg-muted rounded-xl">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="flex-1 text-3xl font-bold bg-transparent outline-none placeholder:text-muted-foreground/30"
                autoFocus
              />
              <span className="text-lg text-muted-foreground font-medium">{CURRENCY_SYMBOLS[projectCurrency] || projectCurrency}</span>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Note (optionnelle)</label>
            <input
              type="text"
              placeholder="Ex: Remboursement achat matériaux…"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => { setShowForm(false); setError("") }} className="flex-1 h-11 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={isSaving} className="flex-1 h-11 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      {/* Liste des transferts sortants */}
      {outgoing.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-orange-500" />
            Budget prêté à d'autres projets ({outgoing.length})
          </h3>
          <div className="space-y-2">
            {outgoing.map(t => (
              <TransferRow
                key={t.id}
                transfer={t}
                type="out"
                projectIcon={String(t.target_icon || '📁')}
                projectName={String(t.target_name || `Projet #${t.target_project_id}`)}
                projectColor={String(t.target_color || '#3b82f6')}
                amount={formatAmt(Number(t.amount_eur), Number(t.amount_cfa), Number(t.amount_usd))}
                onDelete={() => handleDelete(t.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Liste des transferts entrants */}
      {incoming.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ArrowLeft className="h-4 w-4 text-green-500" />
            Budget reçu d'autres projets ({incoming.length})
          </h3>
          <div className="space-y-2">
            {incoming.map(t => (
              <TransferRow
                key={t.id}
                transfer={t}
                type="in"
                projectIcon={String(t.source_icon || '📁')}
                projectName={String(t.source_name || `Projet #${t.source_project_id}`)}
                projectColor={String(t.source_color || '#3b82f6')}
                amount={formatAmt(Number(t.amount_eur), Number(t.amount_cfa), Number(t.amount_usd))}
                onDelete={() => handleDelete(t.id)}
              />
            ))}
          </div>
        </section>
      )}

      {outgoing.length === 0 && incoming.length === 0 && !showForm && (
        <div className="flex flex-col items-center py-10 gap-3">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center">
            <Link2 className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium">Aucun transfert de budget</p>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Les transferts permettent de relier les budgets de plusieurs projets liés entre eux.
          </p>
        </div>
      )}
    </div>
  )
}

function TransferRow({ transfer, type, projectIcon, projectName, projectColor, amount, onDelete }: {
  transfer: any
  type: 'out' | 'in'
  projectIcon: string
  projectName: string
  projectColor: string
  amount: string
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const date = transfer.created_at ? new Date(transfer.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

  return (
    <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${type === 'out' ? 'bg-orange-100 dark:bg-orange-950/30' : 'bg-green-100 dark:bg-green-950/30'}`}>
        <span className="text-base">{projectIcon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {type === 'out' ? <ArrowRight className="h-3 w-3 text-orange-500 flex-shrink-0" /> : <ArrowLeft className="h-3 w-3 text-green-500 flex-shrink-0" />}
          <p className="text-sm font-medium truncate">{projectName}</p>
        </div>
        {transfer.note && <p className="text-xs text-muted-foreground truncate mt-0.5">{transfer.note}</p>}
        <p className="text-xs text-muted-foreground">{date}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-sm font-bold ${type === 'out' ? 'text-orange-600' : 'text-green-600'}`}>
          {type === 'out' ? '−' : '+'}{amount}
        </span>
        {confirming ? (
          <div className="flex gap-1">
            <button onClick={() => setConfirming(false)} className="text-xs px-2 py-1 rounded-lg bg-muted hover:bg-muted/80">Non</button>
            <button onClick={onDelete} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600">Oui</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-500 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
