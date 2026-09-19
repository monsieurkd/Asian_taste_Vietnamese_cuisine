import type { ButtonHTMLAttributes } from 'react';

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

/** The button. Bigger targets than a phone — this is a tablet at a pass. */
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
