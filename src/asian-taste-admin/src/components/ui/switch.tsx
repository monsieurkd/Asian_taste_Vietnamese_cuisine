import { useState } from "react"
import { cn } from "@/lib/utils"

export interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
}

export function Switch({ checked, defaultChecked, onCheckedChange, disabled, className, id }: SwitchProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked ?? false)
  const isControlled = checked !== undefined
  const isChecked = isControlled ? checked : internalChecked

  const handleClick = () => {
    const next = !isChecked
    if (!isControlled) {
      setInternalChecked(next)
    }
    onCheckedChange?.(next)
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      id={id}
      disabled={disabled}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=checked]:border-primary",
        "data-[state=unchecked]:bg-input data-[state=unchecked]:border-gray-300",
        className
      )}
      onClick={handleClick}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 rounded-full bg-white shadow-lg ring-0 transition-all",
          "data-[state=checked]:translate-x-full",
          "data-[state=unchecked]:translate-x-0"
        )}
        data-state={isChecked ? "checked" : "unchecked"}
      />
      <span
        className={cn(
          "absolute block h-5 w-5 rounded-full bg-white transition-all",
          "data-[state=checked]:translate-x-full rtl:translate-x-full",
          "data-[state=unchecked]:translate-x-0 rtl:translate-x-0"
        )}
        data-state={isChecked ? "checked" : "unchecked"}
      />
    </button>
  )
}
