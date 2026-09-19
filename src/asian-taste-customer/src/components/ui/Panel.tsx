/**
 * Re-export shim.
 *
 * The panel family now lives in the shared component set at
 * `src/shared/ui/panel.tsx`, so the storefront and the console cannot drift
 * apart. Existing imports through this path keep working unchanged.
 */
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
