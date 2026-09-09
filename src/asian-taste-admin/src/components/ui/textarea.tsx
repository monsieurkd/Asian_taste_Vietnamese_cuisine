import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps {
  value?: string
  defaultValue?: string
  rows?: number
  id?: string
  placeholder?: string
  className?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      rows={props.rows || 3}
      {...props}
    />
  )
}
