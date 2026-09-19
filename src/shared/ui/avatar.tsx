export function Avatar({ name, lg }: { name: string; lg?: boolean }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <span className={`avatar ${lg ? 'is-lg' : ''}`} aria-hidden="true">
      {initials}
    </span>
  );
}
