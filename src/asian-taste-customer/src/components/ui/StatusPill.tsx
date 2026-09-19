import { StatusPill as SharedStatusPill, type StatusPillProps } from '@shared/ui/StatusPill';

/**
 * The storefront's status pill.
 *
 * `lens` is pinned to `customer` here so every call site reads "Delivered"
 * where the console reads "Collected". The shell itself is shared; only the
 * vocabulary is fixed.
 */
export function StatusPill(props: Omit<StatusPillProps, 'lens'>) {
  return <SharedStatusPill {...props} lens="customer" />;
}
