/**
 * Re-export shim.
 *
 * The console toast is now the same React toast the storefront uses
 * (`src/shared/ui/toast.ts`), so a WebSocket frame, a mutation callback and a
 * cart action all land in one slot with one lifetime. The name is kept so
 * existing console call sites read unchanged.
 */
export { showToast as showAdminToast } from '@shared/ui/toastStore';
