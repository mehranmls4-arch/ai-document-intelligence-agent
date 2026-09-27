export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status.toLowerCase()}`}>{formatLabel(status)}</span>;
}

export function ValidationBadge({ status }: { status: string }) {
  return <span className={`badge validation-${status.toLowerCase()}`}>{formatLabel(status)}</span>;
}

export function Confidence({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="note">—</span>;
  }
  const pct = Math.round(value * 100);
  return (
    <span className={`confidence${pct < 85 ? ' low' : ''}`}>
      <span className="confidence-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
