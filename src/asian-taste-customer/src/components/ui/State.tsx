import type { ReactNode } from 'react';

interface StateProps {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}

/**
 * The shared empty/error block. Every one carries exactly one way forward — a
 * dead end is the failure mode this primitive exists to prevent.
 */
export function StateBlock({ icon, title, body, action, error }: StateProps & { error?: boolean }) {
  return (
    <div className={`state-block ${error ? 'error' : ''}`}>
      <span className="state-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

/** Skeletons mirror the real content's shape so the layout never jumps. */
export function SkeletonCard() {
  return (
    <div className="dish-card" aria-hidden="true">
      <div className="skeleton sk-img" />
      <div className="skeleton sk-line sk-title" />
      <div className="skeleton sk-line" />
      <div className="skeleton sk-line w-4/5" />
      <div className="dish-foot">
        <div className="skeleton sk-line h-[18px] w-16" />
        <div className="skeleton sk-line h-11 w-[88px] rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="item-row" aria-hidden="true">
      <div className="item-main">
        <div className="skeleton sk-line sk-title" />
        <div className="skeleton sk-line" />
        <div className="skeleton sk-line w-2/3" />
      </div>
      <div className="item-thumb skeleton" />
    </div>
  );
}
