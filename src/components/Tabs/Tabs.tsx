import { useId, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent } from 'react';
import { Tab } from '../Tab';
import styles from './Tabs.module.css';

export type TabsItem = {
  id: string;
  label: string;
  /** DOM id of the tab button. Set it when a panel needs `aria-labelledby`; defaults to a per-instance unique id. */
  tabId?: string;
  panelId?: string;
};

export type TabsProps = Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'role' | 'aria-label'> & {
  label: string;
  items: readonly TabsItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

export function Tabs({
  label,
  items,
  value,
  defaultValue,
  onValueChange,
  className,
  ...divProps
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? items[0]?.id);
  const tabListRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const selectedValue = items.find((item) => item.id === (value ?? internalValue))?.id ?? items[0]?.id;

  function select(nextValue: string) {
    if (nextValue === selectedValue) return;
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % items.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextItem = items[nextIndex];
    select(nextItem.id);
    tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  }

  return (
    <div
      {...divProps}
      ref={tabListRef}
      role="tablist"
      aria-label={label}
      className={[styles.tabs, className].filter(Boolean).join(' ')}
    >
      {items.map((item, index) => (
        <Tab
          key={item.id}
          id={item.tabId ?? `${baseId}-tab-${index}`}
          label={item.label}
          active={item.id === selectedValue}
          aria-controls={item.panelId}
          onClick={() => select(item.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        />
      ))}
    </div>
  );
}
