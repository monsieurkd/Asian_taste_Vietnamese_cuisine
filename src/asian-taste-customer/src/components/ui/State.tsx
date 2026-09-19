/**
 * Re-export shim.
 *
 * State block and skeletons now live in the shared component set at
 * `src/shared/ui/state.tsx`. Existing imports through this path keep working.
 */
export { StateBlock, SkeletonCard, SkeletonRow, SkeletonRows } from '@shared/ui/state';
