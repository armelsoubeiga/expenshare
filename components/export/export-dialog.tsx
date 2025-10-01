"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useDatabase } from "@/hooks/use-database"
import { formatDate } from "@/lib/utils"
import type { CurrencyCode, ProjectUser, User } from "@/lib/types"

// PDF
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

type ExportProject = {
  id: number
  name: string
  icon: string
  currency: CurrencyCode
  role?: string | null
}

type ExportProjectDetails = ExportProject & {
  description?: string | null
  color?: string | null
}

type ExportTransaction = {
  id: number
  project_id: number
  user_id: string | number
  category_id: number | null
  type: "expense" | "budget"
  amount: number
  amount_eur?: number
  amount_cfa?: number
  amount_usd?: number
  title: string
  description?: string | null
  created_at: string | null
  project_name?: string | null
  project_icon?: string | null
  project_color?: string | null
  project_currency?: CurrencyCode | null
  user_name?: string | null
  category_name?: string | null
  parent_category_name?: string | null
  has_text?: boolean
  has_document?: boolean
  has_image?: boolean
  has_audio?: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isCurrencyCode = (value: unknown): value is CurrencyCode =>
  value === "EUR" || value === "CFA" || value === "USD"

const parseCurrency = (value: unknown, fallback: CurrencyCode = "EUR"): CurrencyCode =>
  isCurrencyCode(value) ? value : fallback

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

const toOptionalString = (value: unknown): string | null =>
  typeof value === "string" ? value : null

const normalizeProject = (raw: unknown, fallbackCurrency: CurrencyCode): ExportProject | null => {
  if (!isRecord(raw)) {
    return null
  }
  const id = toFiniteNumber(raw.id)
  if (id == null) {
    return null
  }
  const name = typeof raw.name === "string" ? raw.name : `Projet ${id}`
  const icon = typeof raw.icon === "string" ? raw.icon : ""
  const currency = parseCurrency(raw.currency, fallbackCurrency)
  const role = typeof raw.role === "string" ? raw.role : undefined
  return { id, name, icon, currency, role }
}

const normalizeProjectList = (input: unknown, fallbackCurrency: CurrencyCode): ExportProject[] => {
  if (!Array.isArray(input)) {
    return []
  }
  return input
    .map((item) => normalizeProject(item, fallbackCurrency))
    .filter((project): project is ExportProject => project !== null)
}

const normalizeProjectDetails = (raw: unknown, fallbackCurrency: CurrencyCode): ExportProjectDetails | null => {
  if (!isRecord(raw)) {
    return null
  }
  const id = toFiniteNumber(raw.id)
  if (id == null) {
    return null
  }
  const name = typeof raw.name === "string" ? raw.name : `Projet ${id}`
  const icon = typeof raw.icon === "string" ? raw.icon : ""
  const currency = parseCurrency(raw.currency, fallbackCurrency)
  const description = typeof raw.description === "string" ? raw.description : null
  const color = typeof raw.color === "string" ? raw.color : null
  return { id, name, icon, currency, description, color }
}

const toExportTransaction = (raw: unknown): ExportTransaction | null => {
  if (!isRecord(raw)) {
    return null
  }
  const id = toFiniteNumber(raw.id)
  const projectId = toFiniteNumber(raw.project_id)
  const userIdValue = raw.user_id
  const type = raw.type === "expense" || raw.type === "budget" ? raw.type : null
  const amount = toFiniteNumber(raw.amount)
  if (id == null || projectId == null || type == null || amount == null) {
    return null
  }
  if (typeof userIdValue !== "string" && typeof userIdValue !== "number") {
    return null
  }
  const categoryIdNumber = toFiniteNumber(raw.category_id)
  const createdAt =
    typeof raw.created_at === "string"
      ? raw.created_at
      : raw.created_at instanceof Date
      ? raw.created_at.toISOString()
      : null

  return {
    id,
    project_id: projectId,
    user_id: userIdValue,
    category_id: categoryIdNumber ?? null,
    type,
    amount,
    amount_eur: toFiniteNumber(raw.amount_eur),
    amount_cfa: toFiniteNumber(raw.amount_cfa),
    amount_usd: toFiniteNumber(raw.amount_usd),
    title: typeof raw.title === "string" ? raw.title : "",
    description: toOptionalString(raw.description),
    created_at: createdAt,
    project_name: toOptionalString(raw.project_name),
    project_icon: toOptionalString(raw.project_icon),
    project_color: toOptionalString(raw.project_color),
    project_currency: isCurrencyCode(raw.project_currency) ? raw.project_currency : null,
    user_name: toOptionalString(raw.user_name),
    category_name: toOptionalString(raw.category_name),
    parent_category_name: toOptionalString(raw.parent_category_name),
    has_text: raw.has_text === true,
    has_document: raw.has_document === true,
    has_image: raw.has_image === true,
    has_audio: raw.has_audio === true,
  }
}

const normalizeTransactions = (input: unknown): ExportTransaction[] => {
  if (!Array.isArray(input)) {
    return []
  }
  return input
    .map(toExportTransaction)
    .filter((tx): tx is ExportTransaction => tx !== null)
}

const toTimestamp = (value: string | null): number => (value ? new Date(value).getTime() : 0)

export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const { db, isReady } = useDatabase()
  const [projects, setProjects] = useState<ExportProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all")
  const [exportCsv, setExportCsv] = useState(true)
  const [exportPdf, setExportPdf] = useState(true)
  const [busy, setBusy] = useState(false)
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("EUR")
  const [projectCurrency, setProjectCurrency] = useState<CurrencyCode>("EUR")

  useEffect(() => {
    if (!isOpen || !isReady || !db) return
    void (async () => {
      try {
        const storedUser = localStorage.getItem("expenshare_user")
        let loadedProjects: ExportProject[] = []
        let detectedCurrency: CurrencyCode = "EUR"
        let userId: string | number | null = null

        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser) as { id?: string | number }
            if (typeof parsed?.id === "string" || typeof parsed?.id === "number") {
              userId = parsed.id
            }
          } catch {
            userId = null
          }
        }

        if (userId != null) {
          try {
            const setting = await db.settings.get(`user:${userId}:currency`)
            const value = isRecord(setting) ? setting.value : null
            if (isCurrencyCode(value)) {
              detectedCurrency = value
            }
          } catch {
            // ignore missing setting
          }

          try {
            const rawProjects = await db.getUserProjects(userId)
            loadedProjects = normalizeProjectList(rawProjects, detectedCurrency)
          } catch {
            loadedProjects = []
          }
        }

        if (!loadedProjects.length && db.projects?.toArray) {
          try {
            const rawFallback = await db.projects.toArray()
            loadedProjects = normalizeProjectList(rawFallback, detectedCurrency)
          } catch {
            loadedProjects = []
          }
        }

        setDisplayCurrency(detectedCurrency)
        setProjects(loadedProjects)

        if (loadedProjects.length > 0) {
          const firstProject = loadedProjects[0]
          setSelectedProjectId(String(firstProject.id))
          setProjectCurrency(firstProject.currency)
        } else {
          setSelectedProjectId("all")
          setProjectCurrency(detectedCurrency)
        }
      } catch {
        // silently ignore initialization errors
      }
    })()
  }, [db, isOpen, isReady])

  useEffect(() => {
    const allProjects = selectedProjectId === "all"
    if (allProjects) {
      setExportPdf(false)
      setProjectCurrency(displayCurrency)
      return
    }

    const project = projects.find((item) => String(item.id) === selectedProjectId)
    if (project) {
      setProjectCurrency(project.currency)
    }
  }, [displayCurrency, projects, selectedProjectId])

  const isAll = selectedProjectId === "all"
  const effectiveCurrency: CurrencyCode = isAll ? displayCurrency : projectCurrency

  const currencySymbol = useMemo(() => {
    switch (effectiveCurrency) {
      case "CFA":
        return "F CFA"
      case "USD":
        return "$"
      default:
        return "€"
    }
  }, [effectiveCurrency])

  const sanitizeText = (val: unknown): string => {
    const raw = val == null ? "" : String(val)
    return raw.normalize("NFC").replace(/[^\x00-\xFF]/g, "")
  }

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    setTimeout(() => {
      anchor.remove()
      URL.revokeObjectURL(url)
    }, 100)
  }

  const txCurrencyForRow = (transaction: ExportTransaction): CurrencyCode => {
    if (!isAll) {
      return effectiveCurrency
    }
    return parseCurrency(transaction.project_currency, "EUR")
  }

  const txNativeAmount = (transaction: ExportTransaction): number => {
    const currency = txCurrencyForRow(transaction)
    if (currency === "CFA") {
      return transaction.amount_cfa ?? transaction.amount_eur ?? transaction.amount
    }
    if (currency === "USD") {
      return transaction.amount_usd ?? transaction.amount_eur ?? transaction.amount
    }
    return transaction.amount_eur ?? transaction.amount
  }

  const formatAmountPdf = (amount: number, currency?: CurrencyCode): string => {
    const code = currency ?? effectiveCurrency
    const decimals = code === "CFA" ? 0 : 2
    const formatted = amount.toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    return formatted.replace(/[\u202F\u00A0]/g, " ")
  }

  const exportAsCsv = (transactions: ExportTransaction[]) => {
    const headers = isAll
      ? ["Type", "Titre", "Catégorie", "Sous-catégorie", "Montant", "Devise", "Projet", "Utilisateur", "Date"]
      : ["Type", "Titre", "Catégorie", "Sous-catégorie", `Montant (${currencySymbol})`, "Projet", "Utilisateur", "Date"]

    const rows = transactions.map((transaction) => {
      const currency = txCurrencyForRow(transaction)
      const amount = formatAmountPdf(txNativeAmount(transaction), currency)
      const baseCells = [
        transaction.type === "expense" ? "Dépense" : "Budget",
        transaction.title,
        transaction.parent_category_name ?? transaction.category_name ?? "",
        transaction.parent_category_name ? transaction.category_name ?? "" : "",
      ]

      if (isAll) {
        return [
          ...baseCells,
          amount,
          currency,
          transaction.project_name ?? "",
          transaction.user_name ?? "",
          transaction.created_at ? formatDate(transaction.created_at) : "",
        ]
      }

      return [
        ...baseCells,
        amount,
        transaction.project_name ?? "",
        transaction.user_name ?? "",
        transaction.created_at ? formatDate(transaction.created_at) : "",
      ]
    })

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\r\n")

    download(new Blob([csv], { type: "text/csv" }), `expenshare-transactions-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const exportAsPdf = (transactions: ExportTransaction[], options?: { project?: ExportProjectDetails; members?: string[] }) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" })
    const margin = 40
    const drawSeparator = (y: number) => doc.line(margin, y, doc.internal.pageSize.getWidth() - margin, y)

    doc.setFont("helvetica", "bold")
    doc.setTextColor(20, 20, 20)

    doc.setFontSize(20)
    if (options?.project) {
      const project = options.project
      const title = `Rapport du projet: ${sanitizeText(project.name)}`
      doc.text(title.trim(), margin, 40)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(11)
      const members = sanitizeText((options.members ?? []).join(", "))
      if (members) {
        doc.text(`Membres: ${members}`, margin, 58)
      }
      doc.text(`Devise: ${projectCurrency}`, margin, 74)
    } else {
      doc.text("Rapport des transactions", margin, 40)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(11)
      doc.text(`Devise: ${isAll ? "Multiple" : effectiveCurrency}`, margin, 58)
    }
    doc.text(`Date: ${new Date().toLocaleString("fr-FR")}`, margin, 90)
    drawSeparator(102)

    const totals = transactions.reduce(
      (acc, transaction) => {
        if (transaction.type === "expense") {
          acc.exp += txNativeAmount(transaction)
        } else {
          acc.bud += txNativeAmount(transaction)
        }
        return acc
      },
      { exp: 0, bud: 0 },
    )
    const balance = totals.bud - totals.exp

    const pageWidth = doc.internal.pageSize.getWidth()
    const gap = 12
    const cardsY = 115
    const cardHeight = 68
    const cardWidth = (pageWidth - margin * 2 - gap * 2) / 3
    const roundedRect = (x: number, y: number, width: number, height: number, radius: number, color: [number, number, number]) => {
      doc.setFillColor(color[0], color[1], color[2])
      doc.roundedRect(x, y, width, height, radius, radius, "F")
    }

    const redBg: [number, number, number] = [255, 235, 238]
    const blueBg: [number, number, number] = [232, 240, 254]
    const greenBg: [number, number, number] = [232, 245, 233]
    const dangerBg: [number, number, number] = [255, 235, 238]

    roundedRect(margin, cardsY, cardWidth, cardHeight, 8, redBg)
    roundedRect(margin + cardWidth + gap, cardsY, cardWidth, cardHeight, 8, blueBg)
    const balanceBg = balance >= 0 ? greenBg : dangerBg
    roundedRect(margin + (cardWidth + gap) * 2, cardsY, cardWidth, cardHeight, 8, balanceBg)

    const cardPadding = 12
    doc.setFont("helvetica", "bold")
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(10)
    doc.text("Total Dépenses", margin + cardPadding, cardsY + cardPadding + 2)
    doc.setFontSize(16)
    doc.setTextColor(239, 68, 68)
    doc.text(`${formatAmountPdf(totals.exp, projectCurrency)} ${currencySymbol}`, margin + cardPadding, cardsY + cardPadding + 26)

    doc.setTextColor(100, 100, 100)
    doc.setFontSize(10)
    doc.text("Total Budgets", margin + cardWidth + gap + cardPadding, cardsY + cardPadding + 2)
    doc.setFontSize(16)
    doc.setTextColor(59, 130, 246)
    doc.text(`${formatAmountPdf(totals.bud, projectCurrency)} ${currencySymbol}`, margin + cardWidth + gap + cardPadding, cardsY + cardPadding + 26)

    doc.setTextColor(100, 100, 100)
    doc.setFontSize(10)
    doc.text("Solde", margin + (cardWidth + gap) * 2 + cardPadding, cardsY + cardPadding + 2)
    doc.setFontSize(16)
    doc.setTextColor(balance >= 0 ? 16 : 239, balance >= 0 ? 185 : 68, balance >= 0 ? 129 : 68)
    doc.text(`${formatAmountPdf(balance, projectCurrency)} ${currencySymbol}`, margin + (cardWidth + gap) * 2 + cardPadding, cardsY + cardPadding + 26)

    const expensesByCategory = new Map<string, number>()
    transactions.forEach((transaction) => {
      if (transaction.type !== "expense") {
        return
      }
      const key = transaction.parent_category_name ?? transaction.category_name ?? "Sans catégorie"
      expensesByCategory.set(key, (expensesByCategory.get(key) ?? 0) + txNativeAmount(transaction))
    })

    let chartY = cardsY + cardHeight + 24
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    doc.text("Dépenses par catégorie", margin, chartY)
    chartY += 12

    const pageHeight = doc.internal.pageSize.getHeight()
    const labelWidth = 170
    const valueWidth = 110
    const barHeight = 6
    const barGap = 10
    const barX = margin + labelWidth
    const barWidth = pageWidth - margin - barX - valueWidth
    const trackColor: [number, number, number] = [235, 238, 245]
    const fillColor: [number, number, number] = [59, 130, 246]
    const textMuted: [number, number, number] = [90, 90, 90]

    const sortedCategories = Array.from(expensesByCategory.entries()).sort((a, b) => b[1] - a[1])
    const totalValue = sortedCategories.reduce((sum, [, value]) => sum + value, 0) || 1

    const formatPercent = (fraction: number): string =>
      `${(fraction * 100)
        .toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        .replace(/[\u202F\u00A0]/g, " ")} %`

    doc.setFontSize(10)
    sortedCategories.forEach(([label, value]) => {
      if (chartY + barHeight + barGap > pageHeight - margin - 120) {
        doc.addPage()
        chartY = margin
        doc.setFont("helvetica", "bold")
        doc.setTextColor(20, 20, 20)
        doc.setFontSize(12)
        doc.text("Dépenses par catégorie", margin, chartY)
        chartY += 12
        doc.setFont("helvetica", "normal")
        doc.setFontSize(10)
      }

      const ratio = value / totalValue
      const width = Math.max(1, Math.round(barWidth * ratio))
      const labelText = sanitizeText(label)
      const valueText = `${formatAmountPdf(value, projectCurrency)} ${currencySymbol}  •  ${formatPercent(ratio)}`

      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      doc.text(labelText, margin, chartY + barHeight)

      doc.setFillColor(trackColor[0], trackColor[1], trackColor[2])
      doc.rect(barX, chartY, barWidth, barHeight, "F")
      doc.setFillColor(fillColor[0], fillColor[1], fillColor[2])
      doc.rect(barX, chartY, width, barHeight, "F")

      doc.setTextColor(20, 20, 20)
      doc.text(valueText, barX + barWidth + valueWidth - 2, chartY + barHeight, { align: "right" })

      chartY += barHeight + barGap
    })

    const tableStartY = chartY + 20
    autoTable(doc, {
      startY: tableStartY,
      head: [["Type", "Titre", "Montant", "Utilisateur", "Date"]],
      body: transactions.slice(0, 200).map((transaction) => [
        transaction.type === "expense" ? "Dépense" : "Budget",
        sanitizeText(transaction.title),
        `${formatAmountPdf(txNativeAmount(transaction), txCurrencyForRow(transaction))} ${
          isAll
            ? txCurrencyForRow(transaction) === "CFA"
              ? "F CFA"
              : txCurrencyForRow(transaction) === "USD"
              ? "$"
              : "€"
            : currencySymbol
        }`,
        sanitizeText(transaction.user_name ?? ""),
        transaction.created_at ? formatDate(transaction.created_at) : "",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [33, 33, 33] },
      theme: "striped",
      margin: { left: margin, right: margin },
    })

    const blob = doc.output("blob") as Blob
    download(blob, `expenshare-rapport-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const handleExport = async () => {
    if (!db) return
    setBusy(true)
    try {
      let rawTransactions: unknown
      if (selectedProjectId === "all") {
        rawTransactions = await db.getRecentTransactions(10000)
      } else {
        rawTransactions = await db.getProjectTransactions(Number(selectedProjectId))
      }

      let transactions = normalizeTransactions(rawTransactions)

      if (!isAll) {
        const targetId = Number(selectedProjectId)
        transactions = transactions.filter((transaction) => transaction.project_id === targetId)
      }

      transactions.sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at))

      if (exportCsv) {
        exportAsCsv(transactions)
      }

      if (exportPdf) {
        let projectDetails: ExportProjectDetails | null = null
        let members: string[] | undefined

        if (!isAll) {
          try {
            const rawProject = await db.getProjectById(Number(selectedProjectId))
            projectDetails = normalizeProjectDetails(rawProject, projectCurrency)

            const memberQuery = db.project_users?.where?.("project_id")
            const memberResult = memberQuery ? await memberQuery.equals(Number(selectedProjectId)).toArray() : []
            const memberRows: ProjectUser[] = Array.isArray(memberResult)
              ? memberResult.filter((row): row is ProjectUser =>
                  typeof row?.project_id === "number" &&
                  (typeof row?.user_id === "string" || typeof row?.user_id === "number") &&
                  typeof row?.role === "string",
                )
              : []

            const userIds = Array.from(new Set(memberRows.map((row) => String(row.user_id))))

            let userList: User[] = []
            try {
              const usersRaw = await db.users?.toArray?.()
              userList = Array.isArray(usersRaw)
                ? usersRaw.filter((user): user is User => typeof user?.id === "string" && typeof user?.name === "string")
                : []
            } catch {
              userList = []
            }

            const userMap = new Map<string, User>(userList.map((user) => [String(user.id), user]))
            const memberNames = userIds
              .map((uid) => {
                const name = userMap.get(uid)?.name?.trim()
                return name && name.length > 0 ? name : null
              })
              .filter((name): name is string => name !== null)

            members = memberNames.length > 0 ? memberNames : undefined
          } catch {
            projectDetails = projectDetails ?? null
          }
        }

        exportAsPdf(transactions, {
          project: projectDetails ?? undefined,
          members,
        })
      }

      onClose()
    } catch (error) {
      console.error("Export failed", error)
      alert("Erreur lors de l’export")
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
            Choisissez le projet et le type d’export à générer.
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
                {projects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.icon} {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Types d’export</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={exportCsv} onCheckedChange={(value) => setExportCsv(!!value)} />
                CSV
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={exportPdf} disabled={selectedProjectId === "all"} onCheckedChange={(value) => setExportPdf(!!value)} />
                PDF{selectedProjectId === "all" ? " — non disponible pour tous les projets" : ""}
              </label>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {selectedProjectId === "all"
              ? "CSV: les montants sont dans la devise propre à chaque projet (colonne Devise incluse)."
              : `Montants exportés dans la devise du projet (${currencySymbol}).`}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={handleExport} disabled={busy}>
            {busy ? "Génération…" : "Exporter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
