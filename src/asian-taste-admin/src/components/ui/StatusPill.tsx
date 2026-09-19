import { StatusPill as SharedStatusPill, type StatusPillProps } from '@shared/ui/StatusPill';

/**
 * The console's status pill.
 *
 * `lens` is pinned to `restaurant` here so every call site reads "Collected"
 * where the storefront reads "Delivered". The shell itself is shared; only the
 * vocabulary is fixed.
 */
export function StatusPill(props: Omit<StatusPillProps, 'lens'>) {
  return <SharedStatusPill {...props} lens="restaurant" />;
}
