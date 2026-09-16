import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANT: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm';
  block?: boolean;
}

/** The staff console's button. Bigger targets than the store — this is a tablet at a pass. */
export function Button({ variant = 'secondary', size, block, className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'btn',
        VARIANT[variant],
        size === 'sm' ? 'min-h-[36px] px-3 py-1.5 text-[13px]' : '',
        block ? 'btn-block' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`panel ${className ?? ''}`}>{children}</div>;
}

export function PanelHead({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`panel-head ${className ?? ''}`}>{children}</div>;
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`panel-body ${className ?? ''}`}>{children}</div>;
}

export function PanelFoot({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`panel-foot ${className ?? ''}`}>{children}</div>;
}

export function Pill({ children, neutral }: { children: ReactNode; neutral?: boolean }) {
  return <span className={`pill ${neutral ? 'pill-neutral' : ''}`}>{children}</span>;
}

/**
 * Label and value on ONE line, as a `<dl>` row.
 * Stacking a short label above its value is the loudest "generated UI" tell.
 */
export function Kv({ children }: { children: ReactNode }) {
  return <dl className="kv">{children}</dl>;
}

export function KvRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

export function SumRow({ label, value, total }: { label: string; value: ReactNode; total?: boolean }) {
  return (
    <div className={`sum-row ${total ? 'total' : ''}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

export function Avatar({ name, lg }: { name: string; lg?: boolean }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <span className={`avatar ${lg ? 'is-lg' : ''}`} aria-hidden="true">
      {initials}
    </span>
  );
}

export function StateBlock({
  icon,
  title,
  body,
  action,
  error,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  error?: boolean;
}) {
  return (
    <div className={`state-block ${error ? 'error' : ''}`}>
      <span className="state-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton sk-line" key={i} style={{ height: 44 }} />
      ))}
    </div>
  );
}
