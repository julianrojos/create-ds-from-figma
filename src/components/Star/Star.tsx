import type { ComponentPropsWithoutRef } from 'react';
import styles from './Star.module.css';

export type StarProps = Omit<
  ComponentPropsWithoutRef<'span'>,
  'children' | 'aria-label' | 'aria-hidden' | 'role'
> & {
  label?: string;
};

export function Star({ label, className, ...spanProps }: StarProps) {
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
