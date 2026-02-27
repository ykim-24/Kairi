interface StatCardProps {
  title: string;
  value: string;
  color?: string;
  delta?: number;
}

export function StatCard({ title, value, color, delta }: StatCardProps) {
  return (
    <div className="card">
      <h3
        style={{
          fontSize: 13,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {">"} {title}
      </h3>
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color,
          textShadow: color
            ? `0 0 8px ${color}40`
            : "0 0 8px var(--glow-color)",
        }}
      >
        {value}
      </div>
      {delta != null && (
        <div
          style={{
            fontSize: 13,
            marginTop: 4,
            color: delta >= 0 ? "var(--green)" : "var(--red)",
          }}
        >
          {delta >= 0 ? "+" : ""}
          {(delta * 100).toFixed(1)}% vs prev period
        </div>
      )}
    </div>
  );
}
