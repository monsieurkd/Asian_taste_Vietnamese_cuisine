import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/**
 * The design set's panel. House rule: a card carries a heading OR a rule, never
 * both — the border that used to sit under every `.panel-head` produced the
 * "title → line → content" rhythm that reads as generated. Space separates.
 */
export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel ${className ?? ''}`} {...rest}>
      {children}
    </div>
  );
}

export function PanelHead({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel-head ${className ?? ''}`} {...rest}>
      {children}
    </div>
  );
}

export function PanelBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel-body ${className ?? ''}`} {...rest}>
      {children}
    </div>
  );
}

export function PanelFoot({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel-foot ${className ?? ''}`} {...rest}>
      {children}
    </div>
  );
}

/** A `<dl>` grid for label → value. Never stack a `<dt>` above its `<dd>`. */
export function Kv({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={`kv ${className ?? ''}`}>{children}</dl>;
}

export function KvRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

/**
 * Label and value on ONE line. Stacking a short label above the value it names
 * is the loudest "generated UI" tell — receipts, wallets and order screens read
 * label → value in a row.
 */
export function FactLine({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <p className="factline">
      {icon}
      <span className="factline-k">{label}</span>
      <span className="factline-v">{value}</span>
    </p>
  );
}

/** The horizontal receipt strip, as a `<dl>`. */
export function Facts({
  children,
  className,
  label,
  style,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  style?: CSSProperties;
}) {
  return (
    <dl className={`facts ${className ?? ''}`} aria-label={label} style={style}>
      {children}
    </dl>
  );
}

export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** A label/value row inside a panel — the line-item shape used on receipts. */
export function RowLine({
  main,
  sub,
  value,
}: {
  main: ReactNode;
  sub?: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="rowline">
      <div className="rl-main">
        <strong>{main}</strong>
        {sub ? <span>{sub}</span> : null}
      </div>
      <span className="num">{value}</span>
    </div>
  );
}

/** A summary line. `total` switches to the heavier receipt style. */
export function SumRow({
  label,
  value,
  total,
  hidden,
}: {
  label: string;
  value: ReactNode;
  total?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className={`sum-row ${total ? 'total' : ''}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
