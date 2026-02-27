import { api } from "../../api/client";
import { useFetch } from "../../hooks/useFetch";
import { Spinner } from "../shared/Spinner";
import { Badge } from "../shared/Badge";
import { Sparkline } from "../charts/Sparkline";

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

export function ReposPage() {
  const { data: repos, loading } = useFetch(() => api.getRepos(), []);

  if (loading) return <Spinner />;
  if (!repos || repos.length === 0) {
    return (
      <div className="card" style={{ color: "var(--muted)" }}>
        No repository data yet
      </div>
    );
  }

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3
        style={{
          fontSize: 14,
          color: "var(--muted)",
          marginBottom: 12,
        }}
      >
        Repository Breakdown
      </h3>
      <table>
        <thead>
          <tr>
            <th>Repo</th>
            <th>Reviews</th>
            <th>Avg Comments</th>
            <th>Approval</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {repos.map((r) => (
            <tr key={r.repo}>
              <td>{r.repo}</td>
              <td>{r.totalReviews}</td>
              <td>{r.avgCommentsPerReview}</td>
              <td>
                <Badge value={r.approvalRate} label={pct(r.approvalRate)} />
              </td>
              <td>
                <Sparkline data={r.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
