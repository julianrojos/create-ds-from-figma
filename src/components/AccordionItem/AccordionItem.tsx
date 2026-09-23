import { useId, useState } from "react";
import chevronDown from "../../assets/figma/accordion-item/chevron-down.svg";
import chevronUp from "../../assets/figma/accordion-item/chevron-up.svg";
import styles from "./AccordionItem.module.css";

export type AccordionItemProps = {
  title?: string;
  content?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

export function AccordionItem({
  title = "Title",
  content = "Answer the frequently asked question in a simple sentence, a longish paragraph, or even in a list.",
  defaultOpen = false,
  open,
  onOpenChange,
  className
}: AccordionItemProps) {
  const generatedId = useId();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const panelId = `${generatedId}-panel`;
  const buttonId = `${generatedId}-button`;

  function toggle() {
    const nextOpen = !isOpen;
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  return (
    <div
      className={[styles.root, isOpen ? styles.open : styles.closed, className]
        .filter(Boolean)
        .join(" ")}
      data-component="AccordionItem"
      data-state={isOpen ? "open" : "closed"}
    >
      <button
        id={buttonId}
        type="button"
        className={styles.header}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className={styles.title}>{title}</span>
        <span className={styles.icon} aria-hidden="true">
          <img src={isOpen ? chevronUp : chevronDown} alt="" />
        </span>
      </button>

      {isOpen ? (
        <div
          id={panelId}
          className={styles.content}
          role="region"
          aria-labelledby={buttonId}
        >
          <p>{content}</p>
        </div>
      ) : null}
    </div>
  );
}
