import * as React from "react"
import { cn } from "@/lib/utils"

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const DialogContext = React.createContext<{
  open: boolean
  onOpenChange: (open: boolean) => void
}>({
  open: false,
  onOpenChange: () => {},
})

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogContext.Provider value={{ open: open ?? false, onOpenChange: onOpenChange ?? (() => {}) }}>
      {children}
    </DialogContext.Provider>
  )
}

interface DialogContentProps {
  children: React.ReactNode
  className?: string
}

export function DialogContent({ children, className }: DialogContentProps) {
  const { open, onOpenChange } = React.useContext(DialogContext)

  if (!open) return null

  return (
    <div
      className={cn(
        "fixed left-0 right-0 top-0 z-50 flex items-center justify-center",
        "bg-black/50 backdrop-blur-sm"
      )}
      onClick={() => onOpenChange(false)}
    >
      <div
        className={cn(
          "bg-card rounded-lg shadow-lg max-w-md w-full mx-4 p-6",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

interface DialogHeaderProps {
  children: React.ReactNode
  className?: string
}

export function DialogHeader({ children, className }: DialogHeaderProps) {
  return (
    <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}>
      {children}
    </div>
  )
}

interface DialogTitleProps {
  children: React.ReactNode
  className?: string
}

export function DialogTitle({ children, className }: DialogTitleProps) {
  return (
    <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)}>
      {children}
    </h2>
  )
}

interface DialogFooterProps {
  children: React.ReactNode
  className?: string
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4", className)}>
      {children}
    </div>
  )
}
