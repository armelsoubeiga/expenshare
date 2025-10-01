"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"

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

type PieLabelProps = {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  percent?: number
  payload?: ExtendedPieChartDatum
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
  // Quand beaucoup d'éléments, on limite la légende et on active le scroll
  const tooManyLegendItems = (data?.length ?? 0) > 12
  const containerHeight = size + (tooManyLegendItems ? 120 : 80)
  // Affichage label catégorie/sous-catégorie
  const renderCustomizedLabel = ({ cx = 0, cy = 0, midAngle = 0, outerRadius = 0, percent = 0, payload }: PieLabelProps) => {
    if (!payload || percent < 0.08) return null // Don't show labels for slices < 8%

    const RADIAN = Math.PI / 180
    const radius = outerRadius + 20 // Position labels outside the pie
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    // Ajoute parent/category si présent
    const label = payload.parent ? `${payload.parent}/${payload.name}` : payload.name
    return (
      <text
        x={x}
        y={y}
        fill="currentColor"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        fontSize="11"
        fontWeight="500"
        className="fill-foreground"
      >
        {`${label} (${(percent * 100).toFixed(0)}%)`}
      </text>
    )
  }

  const renderTooltipContent = ({ active, payload }: PieTooltipProps) => {
    if (active && payload && payload.length) {
      const datum = payload[0]
      if (!datum?.payload) {
        return null
      }
      // Ajoute parent/category si présent
      const label = datum.payload.parent ? `${datum.payload.parent}/${datum.name}` : datum.name
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            {new Intl.NumberFormat("fr-FR", {
              style: "currency",
              currency,
            }).format(datum.value)}
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
          <div className="w-16 h-16 rounded-full border-4 border-dashed border-muted-foreground/30 mx-auto mb-2"></div>
          <p className="text-sm">Aucune donnée</p>
        </div>
      </div>
    )
  }

  const total = data.reduce((sum, item) => sum + item.value, 0)
  const dataWithTotal: ExtendedPieChartDatum[] = data.map((item) => ({ ...item, total }))

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold text-center mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={containerHeight}>
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Pie
            data={dataWithTotal}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomizedLabel}
            outerRadius={size / 2.5}
            innerRadius={0}
            fill="#8884d8"
            dataKey="value"
            stroke="white"
            strokeWidth={2}
          >
            {dataWithTotal.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={renderTooltipContent} />
          <Legend
            verticalAlign="bottom"
            align="center"
            layout="horizontal"
            height={36}
            wrapperStyle={{
              maxHeight: tooManyLegendItems ? 88 : undefined,
              overflowY: tooManyLegendItems ? 'auto' : undefined,
              paddingTop: 8,
            }}
            formatter={(value: string, entry) => (
              <span style={{ color: entry && typeof entry === "object" ? (entry as { color?: string }).color : undefined }} className="text-xs sm:text-sm font-medium">
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel && centerValue && (
        <div className="text-center mt-2">
          <p className="text-sm text-muted-foreground">{centerLabel}</p>
          <p className="text-lg font-bold">{centerValue}</p>
        </div>
      )}
    </div>
  )
}
