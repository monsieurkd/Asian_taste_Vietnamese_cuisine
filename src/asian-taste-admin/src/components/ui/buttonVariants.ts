import { cva } from "class-variance-authority"

/**
 * Button styling variants.
 *
 * Deliberately in its own module: a file that exports both a component and a
 * non-component breaks React Fast Refresh (`react-refresh/only-export-components`),
 * so `ui/button.tsx` exports only the component and imports this.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-white hover:bg-primary-dark",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
        outline: "border border-border bg-transparent hover:bg-gray-100",
        ghost: "hover:bg-gray-100",
        danger: "bg-error text-white hover:bg-error/90",
        success: "bg-success text-white hover:bg-success/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-sm",
        lg: "h-12 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
