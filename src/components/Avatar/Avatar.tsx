import styles from './Avatar.module.css';

type BaseProps = {
  size?: 'Large' | 'Medium' | 'Small';
  shape?: 'Circle' | 'Square';
  className?: string;
};

export type AvatarProps = BaseProps & (
  | { type: 'Image'; src: string; alt: string }
  | { type: 'Initial'; initials: string; label: string }
);

export function Avatar(props: AvatarProps) {
  const { type, size = 'Large', shape = 'Circle', className } = props;

  return (
    <span
      className={[styles.avatar, className].filter(Boolean).join(' ')}
      data-type={type}
      data-size={size}
      data-shape={shape}
      role={type === 'Initial' ? 'img' : undefined}
      aria-label={type === 'Initial' ? props.label : undefined}
    >
      {type === 'Image' ? (
        <img className={styles.image} src={props.src} alt={props.alt} />
      ) : (
        <span className={styles.initial} aria-hidden="true">
          {props.initials}
        </span>
      )}
    </span>
  );
}
