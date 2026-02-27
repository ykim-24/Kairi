interface HeaderProps {
  repo: string;
  period: string;
  repos: string[];
  onRepoChange: (repo: string) => void;
  onPeriodChange: (period: string) => void;
}

export function Header({
  repo,
  period,
  repos,
  onRepoChange,
  onPeriodChange,
}: HeaderProps) {
  return (
    <header
      style={{
        padding: "16px 32px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <span
        style={{
          color: "var(--muted)",
          fontSize: 14,
          fontFamily: "var(--font-mono)",
        }}
      >
        {">"} review_quality_dashboard
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <select
          value={repo}
          onChange={(e) => onRepoChange(e.target.value)}
        >
          <option value="">all_repos</option>
          {repos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value)}
        >
          <option value="day">daily</option>
          <option value="week">weekly</option>
          <option value="month">monthly</option>
        </select>
      </div>
    </header>
  );
}
