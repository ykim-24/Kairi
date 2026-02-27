import { api } from "../../api/client";
import { useFetch } from "../../hooks/useFetch";
import { Spinner } from "../shared/Spinner";
import { ProgressBar } from "../shared/ProgressBar";

interface Props {
  repo?: string;
}

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

function rateColor(rate: number) {
  if (rate >= 0.7) return "var(--green)";
  if (rate >= 0.4) return "var(--yellow)";
  return "var(--red)";
}

export function ConceptsPage({ repo }: Props) {
  const { data: concepts, loading: cLoad } = useFetch(
    () => api.getConcepts(repo),
    [repo]
  );
  const { data: hotspots, loading: hLoad } = useFetch(
    () => api.getFileHotspots(repo),
    [repo]
  );

  if (cLoad || hLoad) return <Spinner />;

  return (
    <div className="chart-row">
      <div className="card" style={{ overflowX: "auto" }}>
        <h3
          style={{
            fontSize: 14,
            color: "var(--muted)",
            marginBottom: 12,
          }}
        >
          Concept Approval Rates
        </h3>
        <table>
          <thead>
            <tr>
              <th>Concept</th>
              <th>Total</th>
              <th>Rate</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {concepts && concepts.length > 0 ? (
              concepts.slice(0, 15).map((c) => (
                <tr key={c.concept}>
                  <td>{c.concept}</td>
                  <td>{c.total}</td>
                  <td>{pct(c.rate)}</td>
                  <td>
                    <ProgressBar
                      percent={c.rate * 100}
                      color={rateColor(c.rate)}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} style={{ color: "var(--muted)" }}>
                  No concept data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3
          style={{
            fontSize: 14,
            color: "var(--muted)",
            marginBottom: 12,
          }}
        >
          File Hotspots
        </h3>
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Comments</th>
              <th>Top Concepts</th>
            </tr>
          </thead>
          <tbody>
            {hotspots && hotspots.length > 0 ? (
              hotspots.slice(0, 15).map((h) => (
                <tr key={h.file}>
                  <td
                    style={{
                      maxWidth: 300,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h.file}
                  </td>
                  <td>{h.commentCount}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>
                    {h.topConcepts.join(", ")}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} style={{ color: "var(--muted)" }}>
                  No file hotspot data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
