interface ProgressBarProps {
  percent: number;
  color?: string;
  height?: number;
}

export function ProgressBar({
  percent,
  color = "var(--accent)",
  height = 8,
}: ProgressBarProps) {
  return (
    <div
      style={{
        height,
        borderRadius: 0,
        background: "var(--border)",
        border: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          borderRadius: 0,
          background: color,
          width: `${Math.min(100, Math.max(0, percent))}%`,
          transition: "width 0.3s",
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </div>
  );
}
