import { useState } from "react";
import { useSync } from "../../hooks/useSync";
import { ProgressBar } from "../shared/ProgressBar";
import { api } from "../../api/client";

export function SyncPage() {
  const { enabled, repos, progress, syncing, toggleEnabled, startSync } =
    useSync();
  const [selectedValue, setSelectedValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clearRepo, setClearRepo] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);

  const handleSync = async () => {
    if (!selectedValue) return;
    setError(null);
    try {
      const parsed = JSON.parse(selectedValue);
      const res = await startSync(parsed.repo, parsed.installationId);
      if (!res.ok) {
        setError(res.error ?? "Sync rejected");
      }
    } catch {
      setError("Failed to start sync");
    }
  };

  const handleClear = async () => {
    if (!clearRepo) return;
    const parsed = JSON.parse(clearRepo);
    const confirmed = window.confirm(
      `Clear all learning data for ${parsed.repo}? This cannot be undone.`
    );
    if (!confirmed) return;

    setClearing(true);
    setClearResult(null);
    try {
      const res = await api.clearLearning(parsed.repo);
      if (res.ok) {
        setClearResult(
          `Cleared learning data for ${res.repo} (${res.graphDeleted} graph entries removed)`
        );
      }
    } catch {
      setClearResult("Failed to clear learning data");
    } finally {
      setClearing(false);
    }
  };

  const pctDone =
    progress && progress.totalPRs > 0
      ? (progress.processedPRs / progress.totalPRs) * 100
      : 0;

  const barColor =
    progress?.status === "done"
      ? "var(--green)"
      : progress?.status === "error"
        ? "var(--red)"
        : "var(--accent)";

  return (
    <>
    <div className="card" style={{ maxWidth: 600 }}>
      <h3
        style={{
          fontSize: 14,
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        Knowledge Base Sync
      </h3>
      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          marginBottom: 16,
        }}
      >
        Backfill your knowledge graph from historical PR comments.
      </p>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          fontSize: 13,
          color: "var(--muted)",
          userSelect: "none",
          marginBottom: 16,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggleEnabled(e.target.checked)}
          style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
        />
        Enable sync
      </label>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <select
          value={selectedValue}
          onChange={(e) => setSelectedValue(e.target.value)}
          disabled={!enabled}
          style={{ flex: 1, minWidth: 200 }}
        >
          <option value="">
            {repos.length === 0 ? "Loading repos..." : "Select a repo"}
          </option>
          {repos.map((r) => (
            <option
              key={r.full_name}
              value={JSON.stringify({
                repo: r.full_name,
                installationId: r.installationId,
              })}
            >
              {r.full_name}
            </option>
          ))}
        </select>
        <button
          onClick={handleSync}
          disabled={!enabled || !selectedValue || syncing}
          style={{
            background: enabled ? "var(--accent)" : "var(--border)",
            color: enabled ? "var(--bg)" : "var(--muted)",
            border: "none",
            borderRadius: 0,
            padding: "8px 16px",
            fontSize: 14,
            fontFamily: "var(--font-mono)",
            whiteSpace: "nowrap",
          }}
        >
          {syncing ? "Syncing..." : "Sync History"}
        </button>
      </div>

      {(progress || error) && (
        <div>
          {progress && progress.status !== "idle" && (
            <>
              <ProgressBar
                percent={progress.status === "done" ? 100 : pctDone}
                color={barColor}
                height={12}
              />
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "var(--muted)",
                }}
              >
                {progress.status === "running" &&
                  `Syncing ${progress.repo}: ${progress.processedPRs}/${progress.totalPRs} PRs processed, ${progress.commentsIngested} comments ingested`}
                {progress.status === "done" &&
                  `Sync complete: ${progress.totalPRs} PRs, ${progress.commentsIngested} comments ingested`}
                {progress.status === "error" &&
                  `Sync error: ${progress.error ?? "Unknown error"}`}
              </div>
            </>
          )}
          {error && (
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--red)" }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>

    {/* Clear learning section */}
    <div className="card" style={{ maxWidth: 600, marginTop: 16 }}>
      <h3
        style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}
      >
        Clear Learning Data
      </h3>
      <p
        style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}
      >
        Remove all learned patterns for a repo from both the vector store and
        graph database.
      </p>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <select
          value={clearRepo}
          onChange={(e) => {
            setClearRepo(e.target.value);
            setClearResult(null);
          }}
          style={{ flex: 1, minWidth: 200 }}
        >
          <option value="">
            {repos.length === 0 ? "Loading repos..." : "Select a repo"}
          </option>
          {repos.map((r) => (
            <option
              key={r.full_name}
              value={JSON.stringify({ repo: r.full_name })}
            >
              {r.full_name}
            </option>
          ))}
        </select>
        <button
          onClick={handleClear}
          disabled={!clearRepo || clearing}
          style={{
            background: clearRepo ? "var(--red, #ff3333)" : "var(--border)",
            color: clearRepo ? "var(--bg)" : "var(--muted)",
            border: "none",
            borderRadius: 0,
            padding: "8px 16px",
            fontSize: 14,
            fontFamily: "var(--font-mono)",
            whiteSpace: "nowrap",
            cursor: !clearRepo || clearing ? "not-allowed" : "pointer",
            opacity: clearing ? 0.5 : 1,
          }}
        >
          {clearing ? "Clearing..." : "Clear"}
        </button>
      </div>
      {clearResult && (
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: clearResult.startsWith("Failed")
              ? "var(--red)"
              : "var(--green, #33ff33)",
          }}
        >
          {clearResult}
        </div>
      )}
    </div>
    </>
  );
}
