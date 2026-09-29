import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Star } from '../Star';
import { X } from '../X';
import styles from './Button.module.css';

export type ButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
  label: string;
  variant?: 'Primary' | 'Neutral' | 'Subtle';
  size?: 'Medium' | 'Small';
  hasIconStart?: boolean;
  hasIconEnd?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
};

export function Button({
  label,
  variant = 'Primary',
  size = 'Medium',
  hasIconStart = false,
  hasIconEnd = false,
  iconStart,
  iconEnd,
  className,
  type = 'button',
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      data-variant={variant}
      data-size={size}
      className={[styles.button, className].filter(Boolean).join(' ')}
    >
      {hasIconStart && (
        <span className={styles.icon} aria-hidden="true">
          {iconStart ?? <Star />}
        </span>
      )}
      <span>{label}</span>
      {hasIconEnd && (
        <span className={styles.icon} aria-hidden="true">
          {iconEnd ?? <X />}
        </span>
      )}
    </button>
  );
}
