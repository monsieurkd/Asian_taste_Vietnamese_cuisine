/**
 * Re-export shim.
 *
 * Badge, DishTag and Pill now live in the shared component set. `StatusPill`
 * stays defined here as a thin wrapper that pins the customer vocabulary; see
 * `./StatusPill`.
 */
export { Badge, DishTag, Pill } from '@shared/ui/badge';
export type { BadgeKind } from '@shared/ui/badge';
export { StatusPill } from './StatusPill';
export type { StatusPillProps } from '@shared/ui/StatusPill';
