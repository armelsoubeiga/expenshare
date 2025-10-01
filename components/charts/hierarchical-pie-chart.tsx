"use client"

import { useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface HierarchicalData {
  id: string
  name: string
  value: number
  color: string
  level: number
  parentId?: string
  parentName?: string // Ajouté pour affichage parent/nom
  children?: HierarchicalData[]
}

interface HierarchicalPieChartProps {
  data: HierarchicalData[]
  onCategoryClick?: (categoryId: string) => void
  currency?: "EUR" | "USD" | "XOF"
}

type HierarchicalTooltipPayload = {
  payload: HierarchicalData
}

type HierarchicalTooltipProps = {
  active?: boolean
  payload?: HierarchicalTooltipPayload[]
}

export function HierarchicalPieChart({ data, onCategoryClick, currency = "EUR" }: HierarchicalPieChartProps) {
  // Ajoute parentName à chaque enfant lors de la navigation
  const addParentName = (children: HierarchicalData[], parentName?: string): HierarchicalData[] => {
    return children.map(child => ({ ...child, parentName }))
  }

  const [currentLevel, setCurrentLevel] = useState<HierarchicalData[]>(addParentName(data))
  const [breadcrumb, setBreadcrumb] = useState<{ name: string; data: HierarchicalData[] }[]>([
    { name: "Toutes les catégories", data: addParentName(data) },
  ])

  const handleSliceClick = (entry: HierarchicalData) => {
    if (entry.children && entry.children.length > 0) {
      // Ajoute parentName aux enfants
      const childrenWithParent = addParentName(entry.children, entry.name)
      setCurrentLevel(childrenWithParent)
      setBreadcrumb((prev) => [...prev, { name: entry.name, data: childrenWithParent }])
    }
    onCategoryClick?.(entry.id)
  }

  const navigateToBreadcrumb = (index: number) => {
    const newBreadcrumb = breadcrumb.slice(0, index + 1)
    setBreadcrumb(newBreadcrumb)
    setCurrentLevel(newBreadcrumb[newBreadcrumb.length - 1].data)
  }

  const goBack = () => {
    if (breadcrumb.length > 1) {
      navigateToBreadcrumb(breadcrumb.length - 2)
    }
  }

  // Affichage label catégorie/sous-catégorie dans tooltip et légende
  const renderTooltipContent = ({ active, payload }: HierarchicalTooltipProps) => {
    if (active && payload && payload.length) {
      const datum = payload[0]?.payload as HierarchicalData | undefined
      if (!datum) {
        return null
      }
      // Affiche parent/nom si parentId existe
      const label = datum.parentName ? `${datum.parentName}/${datum.name}` : datum.name
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            {new Intl.NumberFormat("fr-FR", {
              style: "currency",
              currency,
            }).format(datum.value)}
          </p>
          {datum.children && datum.children.length > 0 && (
            <p className="text-xs text-blue-600 mt-1">Cliquez pour explorer</p>
          )}
        </div>
      )
    }
    return null
  }

  if (!currentLevel || currentLevel.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-dashed border-muted-foreground/30 mx-auto mb-2"></div>
          <p className="text-sm">Aucune donnée pour ce niveau</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        {breadcrumb.length > 1 && (
          <Button variant="outline" size="sm" onClick={goBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Retour
          </Button>
        )}
        <div className="flex items-center gap-1 flex-wrap">
          {breadcrumb.map((crumb, index) => (
            <div key={index} className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateToBreadcrumb(index)}
                className={index === breadcrumb.length - 1 ? "font-semibold" : ""}
              >
                {crumb.name}
              </Button>
              {index < breadcrumb.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>
        <Badge variant="outline" className="ml-auto">
          Niveau {breadcrumb.length}
        </Badge>
      </div>

      {/* Pie Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={currentLevel}
            cx="50%"
            cy="50%"
            outerRadius={120}
            innerRadius={40}
            fill="#8884d8"
            dataKey="value"
            onClick={handleSliceClick}
            className="cursor-pointer"
          >
            {currentLevel.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
                stroke={entry.children && entry.children.length > 0 ? "#fff" : "none"}
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip content={renderTooltipContent} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {currentLevel.map((entry, index) => {
          // Affiche parent/nom si parentName existe
          const label = entry.parentName ? `${entry.parentName}/${entry.name}` : entry.name
          return (
            <div
              key={index}
              className={`flex items-center gap-2 p-2 rounded border ${
                entry.children && entry.children.length > 0 ? "cursor-pointer hover:bg-muted/50" : ""
              }`}
              onClick={() => entry.children && entry.children.length > 0 && handleSliceClick(entry)}
            >
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency,
                  }).format(entry.value)}
                </p>
              </div>
              {entry.children && entry.children.length > 0 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
