import type { ComponentPropsWithoutRef } from 'react';
import styles from './Tab.module.css';

export type TabProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'type' | 'role' | 'aria-selected'
> & {
  label: string;
  active?: boolean;
};

export function Tab({ label, active = false, className, tabIndex, ...buttonProps }: TabProps) {
  return (
    <button
      {...buttonProps}
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={tabIndex ?? (active ? 0 : -1)}
      data-active={active ? 'On' : 'Off'}
      className={[styles.tab, className].filter(Boolean).join(' ')}
    >
      {label}
    </button>
  );
}
