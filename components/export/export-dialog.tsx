"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useDatabase } from "@/hooks/use-database"
import { formatDate } from "@/lib/utils"

// PDF
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

type ExportType = 'csv' | 'pdf'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const { db, isReady } = useDatabase()
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all")
  const [exportCsv, setExportCsv] = useState(true)
  const [exportPdf, setExportPdf] = useState(true)
  const [busy, setBusy] = useState(false)
  const [displayCurrency, setDisplayCurrency] = useState<'EUR'|'CFA'|'USD'>('EUR') // devise utilisateur (fallback)
  const [projectCurrency, setProjectCurrency] = useState<'EUR'|'CFA'|'USD'>('EUR') // devise du projet sélectionné

  useEffect(() => {
    if (!isOpen || !isReady || !db) return
    ;(async () => {
      try {
        const storedUser = localStorage.getItem('expenshare_user')
        let ps: any[] = []
        let dc: 'EUR'|'CFA'|'USD' = 'EUR'
        if (storedUser) {
          const user = JSON.parse(storedUser)
          try {
            const cur = await db.settings.get(`user:${user.id}:currency`)
            if (cur?.value) dc = cur.value
          } catch {}
          // Récup projets autorisés
          try {
            ps = await db.getUserProjects(String(user.id))
          } catch {
            // Fallback: tous
            if (db.projects?.toArray) ps = await db.projects.toArray()
          }
        }
        setDisplayCurrency(dc)
        setProjects(ps || [])
        // Sélectionner un projet par défaut si disponible et aligner la devise projet
        if ((ps || []).length > 0) {
          const first = ps[0]
          setSelectedProjectId(String(first.id))
          if (first?.currency === 'EUR' || first?.currency === 'CFA' || first?.currency === 'USD') {
            setProjectCurrency(first.currency)
          }
        }
      } catch {}
    })()
  }, [isOpen, isReady, db])

  // Met à jour la devise projet et l'état du PDF selon la sélection
  useEffect(() => {
    const all = selectedProjectId === 'all'
    if (all) {
      setExportPdf(false)
    }
    if (!all) {
      const p = projects.find((x) => String(x.id) === String(selectedProjectId))
      const c = p?.currency
      if (c === 'EUR' || c === 'CFA' || c === 'USD') {
        setProjectCurrency(c)
      }
    }
  }, [selectedProjectId, projects])

  const isAll = selectedProjectId === 'all'
  const effectiveCurrency: 'EUR'|'CFA'|'USD' = isAll ? displayCurrency : projectCurrency

  const currencySymbol = useMemo(() => {
    switch (effectiveCurrency) {
      case 'CFA': return 'F CFA'
      case 'USD': return '$'
      default: return '€'
    }
  }, [effectiveCurrency])

  // Supprime les caractères potentiellement non supportés par les polices PDF (ex: emoji) et normalise
  const sanitizeText = (val: any): string => {
    const s = (val == null ? '' : String(val)).normalize('NFC')
    // Garder uniquement les caractères Latin-1 (accents FR inclus) et ponctuation basique
    return s.replace(/[^\x00-\xFF]/g, '')
  }

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(url)
    }, 100)
  }

  const txCurrencyForRow = (t: any): 'EUR'|'CFA'|'USD' => {
    if (!isAll) return effectiveCurrency
    // Si export "tous projets", on utilise la devise du projet de la transaction si disponible
    const c = t.project_currency
    if (c === 'CFA' || c === 'USD' || c === 'EUR') return c
    return 'EUR'
  }

  const txNativeAmount = (t: any): number => {
    const c = txCurrencyForRow(t)
    if (c === 'CFA') return (t.amount_cfa ?? t.amount_eur ?? t.amount) || 0
    if (c === 'USD') return (t.amount_usd ?? t.amount_eur ?? t.amount) || 0
    return (t.amount_eur ?? t.amount) || 0
  }

  const formatAmountPdf = (n: number, cur?: 'EUR'|'CFA'|'USD'): string => {
    const c = cur || effectiveCurrency
    const decimals = c === 'CFA' ? 0 : 2
    const s = n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    // Remplacer les espaces insécables et espacements fins par des espaces normaux
    return s.replace(/[\u202F\u00A0]/g, ' ')
  }

  const exportAsCsv = (transactions: any[]) => {
    const headers = isAll
      ? ['Type','Titre','Catégorie','Sous-catégorie','Montant','Devise','Projet','Utilisateur','Date']
      : ['Type','Titre','Catégorie','Sous-catégorie',`Montant (${currencySymbol})`,'Projet','Utilisateur','Date']
    const rows = transactions.map((t) => {
      const c = txCurrencyForRow(t)
      const sym = c === 'CFA' ? 'F CFA' : c === 'USD' ? '$' : '€'
      const amount = formatAmountPdf(txNativeAmount(t), c)
      const common = [
        t.type === 'expense' ? 'Dépense' : 'Budget',
        t.title || '',
        t.parent_category_name || t.category_name || '',
        t.parent_category_name ? (t.category_name || '') : '',
      ]
      if (isAll) {
        return [
          ...common,
          amount,
          c,
          t.project_name || '',
          t.user_name || '',
          t.created_at ? formatDate(t.created_at) : ''
        ]
      }
      return [
        ...common,
        amount,
        t.project_name || '',
        t.user_name || '',
        t.created_at ? formatDate(t.created_at) : ''
      ]
    })
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
      .join("\r\n")
    download(new Blob([csv], { type: 'text/csv' }), `expenshare-transactions-${new Date().toISOString().slice(0,10)}.csv`)
  }

  const exportAsPdf = (transactions: any[], options?: { project?: any, members?: string[] }) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const margin = 40
    const line = (y: number) => doc.line(margin, y, doc.internal.pageSize.getWidth()-margin, y)

    // Police et couleurs de base
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(20, 20, 20)

    // Header
    doc.setFontSize(20)
    if (options?.project) {
      const p = options.project
      const title = `Rapport du projet: ${sanitizeText(p.name || '')}`
      doc.text(title.trim(), margin, 40)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      const members = sanitizeText((options.members || []).join(', '))
      if (members) doc.text(`Membres: ${members}`, margin, 58)
      doc.text(`Devise: ${projectCurrency}`, margin, 74)
    } else {
      doc.text('Rapport des transactions', margin, 40)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.text(`Devise: ${isAll ? 'Multiple' : effectiveCurrency}`, margin, 58)
    }
    doc.text(`Date: ${new Date().toLocaleString('fr-FR')}`, margin, 90)
    line(102)

    // Cartes (totaux)
    const totals = transactions.reduce((acc, t) => {
      if (t.type === 'expense') acc.exp += txNativeAmount(t)
      else acc.bud += txNativeAmount(t)
      return acc
    }, { exp: 0, bud: 0 })
    const balance = totals.bud - totals.exp

    // Cartes alignées (style site)
  const pageW = doc.internal.pageSize.getWidth()
    const gap = 12
    const cardsY = 115
    const cardH = 68
    const cardW = (pageW - margin * 2 - gap * 2) / 3
    const roundedRect = (x: number, y: number, w: number, h: number, r = 8, color: [number,number,number]) => {
      doc.setFillColor(color[0], color[1], color[2])
      doc.roundedRect(x, y, w, h, r, r, 'F')
    }
    // Fond clair des cartes
    const redBg: [number,number,number] = [255, 235, 238]
    const blueBg: [number,number,number] = [232, 240, 254]
    const greenBg: [number,number,number] = [232, 245, 233]
    const dangerBg: [number,number,number] = [255, 235, 238]

    // Dessiner cartes
    roundedRect(margin, cardsY, cardW, cardH, 8, redBg)
    roundedRect(margin + cardW + gap, cardsY, cardW, cardH, 8, blueBg)
    const balBg = balance >= 0 ? greenBg : dangerBg
    roundedRect(margin + (cardW + gap) * 2, cardsY, cardW, cardH, 8, balBg)

    // Contenus cartes
    const cardPad = 12
    // Dépenses
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(10)
    doc.text('Total Dépenses', margin + cardPad, cardsY + cardPad + 2)
    doc.setFontSize(16)
    doc.setTextColor(239, 68, 68) // rouge
  doc.text(`${formatAmountPdf(totals.exp, projectCurrency)} ${currencySymbol}`, margin + cardPad, cardsY + cardPad + 26)
    // Budgets
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(10)
    doc.text('Total Budgets', margin + cardW + gap + cardPad, cardsY + cardPad + 2)
    doc.setFontSize(16)
    doc.setTextColor(59, 130, 246) // bleu
  doc.text(`${formatAmountPdf(totals.bud, projectCurrency)} ${currencySymbol}`, margin + cardW + gap + cardPad, cardsY + cardPad + 26)
    // Solde
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(10)
    doc.text('Solde', margin + (cardW + gap) * 2 + cardPad, cardsY + cardPad + 2)
    doc.setFontSize(16)
    doc.setTextColor(balance >= 0 ? 16 : 239, balance >= 0 ? 185 : 68, balance >= 0 ? 129 : 68) // vert/rouge
  doc.text(`${formatAmountPdf(balance, projectCurrency)} ${currencySymbol}`, margin + (cardW + gap) * 2 + cardPad, cardsY + cardPad + 26)

    // Répartition par catégorie — barres horizontales fines pour toutes les catégories
    const byCat = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      const k = t.parent_category_name || t.category_name || 'Sans catégorie'
      byCat.set(k, (byCat.get(k) || 0) + txNativeAmount(t))
    }
    let y = cardsY + cardH + 24
    doc.setFontSize(12)
    doc.setTextColor(20,20,20)
    doc.text('Dépenses par catégorie', margin, y)
    y += 12
    const sorted = Array.from(byCat.entries()).sort((a,b)=>b[1]-a[1])
    const totalVal = sorted.reduce((s, [,v]) => s+v, 0) || 1

    // Layout
  const pageW2 = doc.internal.pageSize.getWidth()
  const pageH2 = doc.internal.pageSize.getHeight()
    const labelW = 170
    const valueW = 110
    const barH = 6
    const gapY = 10
  const barX = margin + labelW
  const barW = pageW2 - margin - barX - valueW
    const trackColor: [number,number,number] = [235, 238, 245]
    const fillColor: [number,number,number] = [59, 130, 246]
    const textMuted: [number,number,number] = [90, 90, 90]

    const formatPercent = (p: number): string => `${(p*100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/[\u202F\u00A0]/g,' ')} %`

    doc.setFontSize(10)
    sorted.forEach(([label, value]) => {
      // Saut de page si nécessaire (laisser un peu d'espace avant le tableau suivant)
  if (y + barH + gapY > pageH2 - margin - 120) {
        doc.addPage()
        y = margin
        doc.setFont('helvetica','bold')
        doc.setTextColor(20,20,20)
        doc.setFontSize(12)
        doc.text('Dépenses par catégorie', margin, y)
        y += 12
        doc.setFont('helvetica','normal')
        doc.setFontSize(10)
      }

      const pct = value / totalVal
      const w = Math.max(1, Math.round(barW * pct))
      const labelText = sanitizeText(label)
      const valueText = `${formatAmountPdf(value, projectCurrency)} ${currencySymbol}  •  ${formatPercent(pct)}`

      // Libellé à gauche
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      doc.text(labelText, margin, y + barH)

      // Rail (track)
      doc.setFillColor(trackColor[0], trackColor[1], trackColor[2])
      doc.rect(barX, y, barW, barH, 'F')
      // Remplissage
      doc.setFillColor(fillColor[0], fillColor[1], fillColor[2])
      doc.rect(barX, y, w, barH, 'F')

      // Valeur alignée à droite
      doc.setTextColor(20,20,20)
      doc.text(valueText, barX + barW + valueW - 2, y + barH, { align: 'right' as any })

      y += barH + gapY
    })

    // Table réduite
  const tableStartY = y + 20
    autoTable(doc, {
      startY: tableStartY,
      head: [["Type","Titre","Montant","Utilisateur","Date"]],
      body: transactions.slice(0, 200).map((t) => [
  t.type === 'expense' ? 'Dépense' : 'Budget',
  sanitizeText(t.title || ''),
  `${formatAmountPdf(txNativeAmount(t), txCurrencyForRow(t))} ${isAll ? (txCurrencyForRow(t) === 'CFA' ? 'F CFA' : txCurrencyForRow(t) === 'USD' ? '$' : '€') : currencySymbol}`,
  sanitizeText(t.user_name || ''),
        t.created_at ? formatDate(t.created_at) : ''
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [33, 33, 33] },
      theme: 'striped',
      margin: { left: margin, right: margin },
    })

    const blob = doc.output('blob')
    download(blob as Blob, `expenshare-rapport-${new Date().toISOString().slice(0,10)}.pdf`)
  }

  const handleExport = async () => {
    if (!db) return
    setBusy(true)
    try {
      // Transactions autorisées, complètes avec métadonnées
      let transactions: any[] = []
      if (selectedProjectId === 'all') {
        // On n'a pas d'endpoint "all" direct; on concatène les transactions récentes avec un grand plafond
        transactions = await db.getRecentTransactions(10000)
      } else {
        transactions = await db.getProjectTransactions(Number(selectedProjectId))
      }
      // Filtrer par projet si besoin
      if (selectedProjectId !== 'all') {
        transactions = (transactions || []).filter((t: any) => Number(t.project_id) === Number(selectedProjectId))
      }
      // Ordonner par date desc
      transactions.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      if (exportCsv) exportAsCsv(transactions)
      if (exportPdf) {
        let project: any | undefined
        let members: string[] | undefined
        if (selectedProjectId !== 'all') {
          try {
            project = await db.getProjectById(Number(selectedProjectId))
            // membres
            const mem = await db.project_users.where('project_id').equals(Number(selectedProjectId)).toArray()
            const userIds: string[] = Array.from(new Set<string>((mem || []).map((m: any) => String(m.user_id))))
            let users: any[] = []
            try { users = await db.users.toArray() } catch {}
            const userMap = new Map<string, any>(users.map((u: any) => [String(u.id), u] as [string, any]))
            members = userIds.map((uid: string) => (userMap.get(uid)?.name as string | undefined)).filter((n): n is string => typeof n === 'string' && n.length > 0)
          } catch {}
        }
        exportAsPdf(transactions, { project, members })
      }
      onClose()
    } catch (e) {
      console.error('Export failed', e)
      alert("Erreur lors de l'export")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exporter les données</DialogTitle>
          <DialogDescription>
            Choisissez le projet et le type d'export à générer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Projet</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un projet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous mes projets</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.icon} {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Types d'export</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={exportCsv} onCheckedChange={(v) => setExportCsv(!!v)} />
                CSV
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={exportPdf} disabled={selectedProjectId === 'all'} onCheckedChange={(v) => setExportPdf(!!v)} />
                PDF{selectedProjectId === 'all' ? ' — non disponible pour tous les projets' : ''}
              </label>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {selectedProjectId === 'all'
              ? "CSV: les montants sont dans la devise propre à chaque projet (colonne Devise incluse)."
              : `Montants exportés dans la devise du projet (${currencySymbol}).`}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button onClick={handleExport} disabled={busy}>
            {busy ? 'Génération…' : 'Exporter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
