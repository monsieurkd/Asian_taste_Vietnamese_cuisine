/**
 * Re-export shim.
 *
 * The order-status vocabulary now lives in the shared set at
 * `src/shared/lib/orderStatus.ts`, alongside the audience-specific presentation
 * helpers the shared `StatusPill` uses. The console keeps its imports unchanged.
 */
export * from '@shared/lib/orderStatus';
