import type { ReactNode } from 'react';

/* ─── dietary + marketing marks ─────────────────────────────────────────────
   Coloured dots on neutral pills, not saturated fills — that keeps the text at
   AA contrast while the mark still reads at a glance. */

export type BadgeKind = 'popular' | 'deal' | 'gf' | 'spicy' | 'soft' | 'liked';

const BADGE_CLASS: Record<BadgeKind, string> = {
  popular: 'bg-gold text-fg rounded-full',
  deal: 'bg-deal text-surface rounded-full',
  gf: 'bg-gf text-surface rounded-sm',
  spicy: 'bg-spicy text-surface rounded-sm',
  soft: 'bg-fg text-surface rounded-full',
  liked: 'bg-fg text-surface rounded-full',
};

export function Badge({
  kind = 'soft',
  children,
  className,
}: {
  kind?: BadgeKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.04em] whitespace-nowrap shadow-[0_1px_2px_color-mix(in_oklch,var(--color-fg)_9%,transparent)] ${BADGE_CLASS[kind]} ${className ?? ''}`}
    >
      {children}
    </span>
  );
}

export function Pill({
  children,
  neutral,
  className,
}: {
  children: ReactNode;
  neutral?: boolean;
  className?: string;
}) {
  return <span className={`pill ${neutral ? 'pill-neutral' : ''} ${className ?? ''}`}>{children}</span>;
}

/* ─── dietary tags on a dish ─────────────────────────────────────────────── */

const DOT_COLOR: Record<string, string> = {
  gf: 'bg-gf',
  vegan: 'bg-gf',
  spicy: 'bg-spicy',
  popular: 'bg-gold',
};

export function DishTag({ tag, label }: { tag: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-[10px] py-[3px] text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
      <i className={`h-[7px] w-[7px] flex-none rounded-full ${DOT_COLOR[tag] ?? 'bg-border'}`} aria-hidden="true" />
      {label}
    </span>
  );
}
