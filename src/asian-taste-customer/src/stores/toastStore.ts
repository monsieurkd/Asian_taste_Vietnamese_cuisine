/**
 * Re-export shim.
 *
 * The toast slot now lives in the shared component set at `src/shared/ui/toast.ts`,
 * so the storefront and the console share one implementation.
 */
export { showToast, useToastStore } from '@shared/ui/toastStore';
export type { ToastState } from '@shared/ui/toastStore';
