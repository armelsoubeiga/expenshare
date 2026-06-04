"use client"

import { useRef, useEffect } from "react"

interface PinBoxesProps {
  value: string
  onChange: (v: string) => void
  showPin?: boolean
  autoFocus?: boolean
  onComplete?: () => void
}

export function PinBoxes({ value, onChange, showPin = false, autoFocus = false, onComplete }: PinBoxesProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null])

  // Focus le premier champ si autoFocus
  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRefs.current[0]?.focus(), 50)
    }
  }, [autoFocus])

  // Focus la bonne case selon la valeur actuelle
  const focusCorrectBox = (currentValue: string) => {
    const idx = Math.min(currentValue.length, 3)
    inputRefs.current[idx]?.focus()
  }

  return (
    <div className="flex gap-3 justify-center">
      {[0, 1, 2, 3].map(i => (
        <input
          key={i}
          ref={el => { inputRefs.current[i] = el }}
          type={showPin ? "text" : "password"}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={value[i] || ""}
          autoComplete="off"
          onChange={e => {
            const digit = e.target.value.replace(/\D/g, "").slice(-1)
            const arr = value.padEnd(4, " ").split("")
            arr[i] = digit
            const newVal = arr.join("").replace(/ /g, "").slice(0, 4)
            onChange(newVal)
            if (digit && i < 3) {
              inputRefs.current[i + 1]?.focus()
            }
            if (digit && i === 3 && newVal.length === 4) {
              onComplete?.()
            }
          }}
          onKeyDown={e => {
            if (e.key === "Backspace") {
              if (value[i]) {
                // Effacer la case courante
                const arr = value.split("")
                arr[i] = ""
                onChange(arr.join(""))
              } else if (i > 0) {
                // Aller à la case précédente
                inputRefs.current[i - 1]?.focus()
                const arr = value.split("")
                arr[i - 1] = ""
                onChange(arr.join(""))
              }
            }
            if (e.key === "ArrowLeft" && i > 0) inputRefs.current[i - 1]?.focus()
            if (e.key === "ArrowRight" && i < 3) inputRefs.current[i + 1]?.focus()
          }}
          onFocus={e => e.target.select()}
          onPaste={e => {
            e.preventDefault()
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4)
            onChange(pasted)
            const nextIdx = Math.min(pasted.length, 3)
            inputRefs.current[nextIdx]?.focus()
          }}
          className="w-14 h-14 text-center text-2xl font-bold rounded-2xl border-2 bg-card transition-all outline-none
            border-border focus:border-primary focus:ring-4 focus:ring-primary/15
            caret-transparent select-none"
        />
      ))}
    </div>
  )
}
