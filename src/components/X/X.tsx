import type { ComponentPropsWithoutRef } from 'react';
import styles from './X.module.css';

export type XProps = Omit<
  ComponentPropsWithoutRef<'span'>,
  'children' | 'aria-label' | 'aria-hidden' | 'role'
> & {
  label?: string;
};

export function X({ label, className, ...spanProps }: XProps) {
  return (
    <span
      {...spanProps}
      className={[styles.icon, className].filter(Boolean).join(' ')}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
