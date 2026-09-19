/**
 * Re-export shim.
 *
 * Every primitive the console used to define here now lives in the shared
 * component set under `src/shared/ui/`, so the console and the storefront draw
 * from one implementation. Existing imports through this path keep working.
 */
export { Button } from '@shared/ui/button';
export {
  Panel,
  PanelHead,
  PanelBody,
  PanelFoot,
  Kv,
  KvRow,
  FactLine,
  Facts,
  Fact,
  RowLine,
  SumRow,
} from '@shared/ui/panel';
export { Pill, Badge, DishTag } from '@shared/ui/badge';
export type { BadgeKind } from '@shared/ui/badge';
export { Avatar } from '@shared/ui/avatar';
export { StateBlock, SkeletonRows, SkeletonCard, SkeletonRow } from '@shared/ui/state';
