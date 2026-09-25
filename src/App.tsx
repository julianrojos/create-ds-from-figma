import { Avatar } from './components/Avatar';
import sampleAvatar from './components/Avatar/avatar-sample.png';

const sizes = ['Large', 'Medium', 'Small'] as const;
const shapes = ['Circle', 'Square'] as const;

export default function App() {
  return (
    <main
      aria-label="Avatar variants"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, max-content)',
        gap: 'var(--sds-size-space-1600)',
        padding: 'calc(var(--sds-size-space-400) + var(--sds-size-space-100))',
      }}
    >
      {sizes.flatMap((size) =>
        shapes.flatMap((shape) => [
          <Avatar key={`${size}-${shape}-image`} type="Image" shape={shape} size={size} src={sampleAvatar} alt="" />,
          <Avatar key={`${size}-${shape}-initial`} type="Initial" shape={shape} size={size} initials="F" label="Inicial F" />,
        ]),
      )}
    </main>
  );
}
