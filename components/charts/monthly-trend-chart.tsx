"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatCurrency } from '@/lib/utils'

type MonthlyDataPoint = {
  month: string
  amount: number
}

interface MonthlyTrendChartProps {
  expensesByMonth: MonthlyDataPoint[]
  budgetsByMonth: MonthlyDataPoint[]
}

export function MonthlyTrendChart({ expensesByMonth, budgetsByMonth }: MonthlyTrendChartProps) {
  const [activeData, setActiveData] = useState<'both' | 'expenses' | 'budgets'>('both')
  
  // Conversion des mois numériques en noms de mois abrégés français
  const getMonthName = (monthKey: string): string => {
  const [, month] = monthKey.split('-')
    const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]
    return monthNames[parseInt(month) - 1]
  }

  // Trouver la valeur maximale pour dimensionner le graphique
  const getMaxValue = (): number => {
  const maxExpense = Math.max(...expensesByMonth.map(item => item.amount), 0)
  const maxBudget = Math.max(...budgetsByMonth.map(item => item.amount), 0)
  return Math.max(maxExpense, maxBudget) * 1.2 // Ajouter 20% pour la marge
  }

  const sortedExpenses = [...expensesByMonth].sort((a, b) => a.month.localeCompare(b.month))
  const sortedBudgets = [...budgetsByMonth].sort((a, b) => a.month.localeCompare(b.month))
  const months = Array.from(new Set([...sortedExpenses.map(e => e.month), ...sortedBudgets.map(b => b.month)]))
    .sort((a, b) => a.localeCompare(b))
    .slice(-6) // Afficher seulement les 6 derniers mois

  const maxValue = getMaxValue()

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Évolution Mensuelle</CardTitle>
            <CardDescription>Dépenses et budgets au cours du temps</CardDescription>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={activeData === 'both' ? "default" : "outline"}
              className="h-7 text-xs px-2"
              onClick={() => setActiveData('both')}
            >
              Les deux
            </Button>
            <Button
              size="sm"
              variant={activeData === 'expenses' ? "default" : "outline"}
              className="h-7 text-xs px-2"
              onClick={() => setActiveData('expenses')}
            >
              Dépenses
            </Button>
            <Button
              size="sm" 
              variant={activeData === 'budgets' ? "default" : "outline"}
              className="h-7 text-xs px-2"
              onClick={() => setActiveData('budgets')}
            >
              Budgets
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="relative w-full h-60">
          {/* Axe Y et ligne horizontale */}
          <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-muted-foreground">
            <div className="text-right pr-2">{formatCurrency(maxValue).split('€')[0]}€</div>
            <div className="text-right pr-2">{formatCurrency(maxValue / 2).split('€')[0]}€</div>
            <div className="text-right pr-2">0€</div>
          </div>
          
          {/* Grille */}
          <div className="absolute left-12 right-0 top-0 bottom-0 border-l">
            <div className="absolute top-0 left-0 right-0 border-b border-dashed border-muted" style={{ height: '1px' }} />
            <div className="absolute top-1/2 left-0 right-0 border-b border-dashed border-muted" style={{ height: '1px' }} />
            <div className="absolute bottom-0 left-0 right-0 border-b" style={{ height: '1px' }} />
            
            {/* Mois (axe X) */}
            <div className="absolute bottom-[-20px] left-0 right-0 flex justify-between">
              {months.map((month) => (
                <div key={month} className="text-xs text-muted-foreground text-center" style={{ width: `${100 / months.length}%` }}>
                  {getMonthName(month)}
                </div>
              ))}
            </div>
            
            {/* Graphiques */}
            <div className="absolute top-0 bottom-0 left-0 right-0 flex items-end">
              {months.map((month) => {
                const expense = sortedExpenses.find(e => e.month === month)?.amount || 0
                const budget = sortedBudgets.find(b => b.month === month)?.amount || 0
                const expenseHeight = (expense / maxValue) * 100
                const budgetHeight = (budget / maxValue) * 100
                
                return (
                  <div
                    key={month}
                    className="flex items-end justify-center h-full"
                    style={{ width: `${100 / months.length}%` }}
                  >
                    {(activeData === 'both' || activeData === 'expenses') && (
                      <div 
                        className="w-3 bg-red-500 rounded-t mx-0.5 relative group"
                        style={{ height: `${expenseHeight}%` }}
                      >
                        <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 bg-card border shadow-sm rounded px-2 py-1 text-xs whitespace-nowrap z-10">
                          <span className="font-medium">{formatCurrency(expense)}</span>
                        </div>
                      </div>
                    )}
                    {(activeData === 'both' || activeData === 'budgets') && (
                      <div 
                        className="w-3 bg-blue-500 rounded-t mx-0.5 relative group"
                        style={{ height: `${budgetHeight}%` }}
                      >
                        <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 bg-card border shadow-sm rounded px-2 py-1 text-xs whitespace-nowrap z-10">
                          <span className="font-medium">{formatCurrency(budget)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0 pb-2 flex justify-between">
        <div className="flex items-center text-xs text-muted-foreground gap-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500"></div>
            <span>Dépenses</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-500"></div>
            <span>Budgets</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
