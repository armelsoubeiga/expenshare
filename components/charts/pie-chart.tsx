"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

interface PieChartDatum {
  name: string
  value: number
  color: string
  parent?: string
}

interface ExtendedPieChartDatum extends PieChartDatum {
  total: number
}

interface CustomPieChartProps {
  data: PieChartDatum[]
  title: string
  centerLabel?: string
  centerValue?: string
  size?: number
  currency?: "EUR" | "USD" | "XOF"
}

type PieTooltipPayload = {
  name: string
  value: number
  payload: ExtendedPieChartDatum
}

type PieTooltipProps = {
  active?: boolean
  payload?: PieTooltipPayload[]
}

export function CustomPieChart({ data, title, centerLabel, centerValue, size = 200, currency = "EUR" }: CustomPieChartProps) {
  const renderTooltipContent = ({ active, payload }: PieTooltipProps) => {
    if (active && payload && payload.length) {
      const datum = payload[0]
      if (!datum?.payload) return null
      const label = datum.payload.parent ? `${datum.payload.parent}/${datum.name}` : datum.name
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg max-w-[200px]">
          <p className="font-medium text-sm leading-tight">{label}</p>
          <p className="text-sm text-muted-foreground">
            {new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(datum.value)}
          </p>
          <p className="text-xs text-muted-foreground">
            {((datum.value / datum.payload.total) * 100).toFixed(1)}% du total
          </p>
        </div>
      )
    }
    return null
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-dashed border-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm">Aucune donnée</p>
        </div>
      </div>
    )
  }

  const total = data.reduce((sum, item) => sum + item.value, 0)
  const dataWithTotal: ExtendedPieChartDatum[] = data.map(item => ({ ...item, total }))
  const radius = Math.max(60, size / 2.5)

  return (
    <div className="w-full">
      <h3 className="text-base font-semibold text-center mb-3">{title}</h3>

      {/* Pie — pas de labels externes (overlapping sur mobile) */}
      <ResponsiveContainer width="100%" height={radius * 2 + 24}>
        <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Pie
            data={dataWithTotal}
            cx="50%"
            cy="50%"
            outerRadius={radius}
            innerRadius={0}
            dataKey="value"
            stroke="white"
            strokeWidth={2}
          >
            {dataWithTotal.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={renderTooltipContent} />
        </PieChart>
      </ResponsiveContainer>

      {/* Légende manuelle : grille responsive, texte tronqué */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 max-h-48 overflow-y-auto pr-1">
        {dataWithTotal.map((entry, idx) => {
          const pct = total > 0 ? ((entry.value / total) * 100).toFixed(0) : '0'
          const label = entry.parent ? `${entry.parent}/${entry.name}` : entry.name
          return (
            <div key={idx} className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-xs text-muted-foreground truncate flex-1" title={label}>{label}</span>
              <span className="text-xs font-medium flex-shrink-0">{pct}%</span>
            </div>
          )
        })}
      </div>

      {centerLabel && centerValue && (
        <div className="text-center mt-2">
          <p className="text-sm text-muted-foreground">{centerLabel}</p>
          <p className="text-lg font-bold">{centerValue}</p>
        </div>
      )}
    </div>
  )
}
