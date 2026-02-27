import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface ShellProps {
  repo: string;
  period: string;
  repos: string[];
  onRepoChange: (repo: string) => void;
  onPeriodChange: (period: string) => void;
  children: ReactNode;
}

export function Shell({
  repo,
  period,
  repos,
  onRepoChange,
  onPeriodChange,
  children,
}: ShellProps) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Header
          repo={repo}
          period={period}
          repos={repos}
          onRepoChange={onRepoChange}
          onPeriodChange={onPeriodChange}
        />
        <main style={{ padding: "24px 32px" }}>{children}</main>
      </div>
    </div>
  );
}
