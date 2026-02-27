interface BadgeProps {
  value: number;
  label: string;
}

function getBadgeColor(value: number) {
  if (value >= 0.7)
    return { bg: "rgba(130,212,160,0.1)", fg: "var(--green)" };
  if (value >= 0.4)
    return { bg: "rgba(212,192,130,0.1)", fg: "var(--yellow)" };
  return { bg: "rgba(212,122,122,0.1)", fg: "var(--red)" };
}

export function Badge({ value, label }: BadgeProps) {
  const { bg, fg } = getBadgeColor(value);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 0,
        fontSize: 12,
        fontWeight: 500,
        background: bg,
        color: fg,
        border: `1px solid ${fg}`,
      }}
    >
      [{label}]
    </span>
  );
}
