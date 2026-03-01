import { useState, useEffect, useCallback } from "react";
import { api } from "../../api/client";
import { Spinner } from "../shared/Spinner";
import { TerminalMarkdown } from "../shared/Markdown";
import type { PendingReview, DiffFile } from "../../api/types";

export function QueuePage() {
  const [gateEnabled, setGateEnabled] = useState(false);
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<number | null>(null);
  const [modalReview, setModalReview] = useState<PendingReview | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [flag, pending] = await Promise.all([
        api.getReviewGateFlag(),
        api.getPendingReviews(),
      ]);
      setGateEnabled(flag.enabled);
      setReviews(pending);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleGate = async (enabled: boolean) => {
    try {
      await api.setReviewGateFlag(enabled);
      setGateEnabled(enabled);
    } catch {
      // revert on failure
    }
  };

  const handleApprove = async (id: number) => {
    setActionInFlight(id);
    try {
      const res = await api.approvePendingReview(id);
      if (res.ok) {
        setReviews((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "approved" } : r))
        );
        if (modalReview?.id === id) setModalReview(null);
      }
    } catch {
      // ignore
    } finally {
      setActionInFlight(null);
    }
  };

  const handleReject = async (id: number) => {
    setActionInFlight(id);
    try {
      const res = await api.rejectPendingReview(id);
      if (res.ok) {
        setReviews((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "rejected" } : r))
        );
        if (modalReview?.id === id) setModalReview(null);
      }
    } catch {
      // ignore
    } finally {
      setActionInFlight(null);
    }
  };

  const handleReprocess = async (id: number) => {
    setActionInFlight(id);
    try {
      const res = await api.reprocessPendingReview(id);
      if (res.ok) {
        // Remove old review from list — new one will appear on next refresh
        setReviews((prev) => prev.filter((r) => r.id !== id));
        if (modalReview?.id === id) setModalReview(null);
        // Poll for the new review to appear
        setTimeout(fetchData, 3000);
        setTimeout(fetchData, 8000);
        setTimeout(fetchData, 15000);
      }
    } catch {
      // ignore
    } finally {
      setActionInFlight(null);
    }
  };

  const pendingReviews = reviews.filter((r) => r.status === "pending");
  const resolvedReviews = reviews.filter((r) => r.status !== "pending");

  const findingsCount = (r: PendingReview) =>
    r.result_json.inlineComments.length;

  if (loading) {
    return <Spinner label="Loading" />;
  }

  return (
    <div>
      {/* Gate toggle */}
      <div className="card" style={{ marginBottom: 16, maxWidth: 600 }}>
        <h3 style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>
          Review Approval Gate
        </h3>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          When enabled, reviews are held for manual approval before posting to
          GitHub.
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
          }}
        >
          <input
            type="checkbox"
            checked={gateEnabled}
            onChange={(e) => toggleGate(e.target.checked)}
            style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
          />
          Enable review gate
        </label>
      </div>

      {/* Pending reviews */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>
          Pending Reviews ({pendingReviews.length})
        </h3>
        {pendingReviews.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            No reviews waiting for approval.
          </p>
        ) : (
          <ReviewTable
            reviews={pendingReviews}
            onRowClick={setModalReview}
            findingsCount={findingsCount}
            actions={(r) => (
              <div style={{ display: "flex", gap: 6 }}>
                <ActionBtn
                  label="REPROCESS"
                  color="var(--yellow, #ffcc00)"
                  disabled={actionInFlight === r.id}
                  onClick={() => handleReprocess(r.id)}
                />
                <ActionBtn
                  label="APPROVE"
                  color="var(--green, #33ff33)"
                  disabled={actionInFlight === r.id}
                  onClick={() => handleApprove(r.id)}
                />
                <ActionBtn
                  label="REJECT"
                  color="var(--red, #ff3333)"
                  disabled={actionInFlight === r.id}
                  onClick={() => handleReject(r.id)}
                />
              </div>
            )}
          />
        )}
      </div>

      {/* Resolved reviews */}
      {resolvedReviews.length > 0 && (
        <div className="card">
          <h3
            style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}
          >
            Resolved ({resolvedReviews.length})
          </h3>
          <ReviewTable
            reviews={resolvedReviews}
            onRowClick={setModalReview}
            findingsCount={findingsCount}
            actions={(r) => (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span
                  style={{
                    color:
                      r.status === "approved" ? "var(--green)" : "var(--red)",
                    fontWeight: 600,
                  }}
                >
                  {r.status}
                </span>
                <ActionBtn
                  label="REPROCESS"
                  color="var(--yellow, #ffcc00)"
                  disabled={actionInFlight === r.id}
                  onClick={() => handleReprocess(r.id)}
                />
              </div>
            )}
          />
        </div>
      )}

      {/* Detail modal */}
      {modalReview && (
        <ReviewModal
          review={modalReview}
          onClose={() => setModalReview(null)}
          onApprove={
            modalReview.status === "pending"
              ? () => handleApprove(modalReview.id)
              : undefined
          }
          onReject={
            modalReview.status === "pending"
              ? () => handleReject(modalReview.id)
              : undefined
          }
          onReprocess={() => handleReprocess(modalReview.id)}
          actionDisabled={actionInFlight === modalReview.id}
        />
      )}
    </div>
  );
}

/* ─── Helpers ─── */

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Extract ~3 lines of context around a target line from a unified diff patch. */
function extractCodeContext(
  diff: DiffFile[] | null,
  path: string,
  targetLine: number,
  contextLines = 3
): string | null {
  if (!diff) return null;
  const file = diff.find((f) => f.filename === path);
  if (!file?.patch) return null;

  const lines = file.patch.split("\n");
  let currentNewLine = 0;
  const collected: string[] = [];
  let foundTarget = false;

  for (const line of lines) {
    // Parse hunk header to get starting line number
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      currentNewLine = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    if (line.startsWith("-")) continue; // deleted lines don't count toward new line numbers

    currentNewLine++;

    if (Math.abs(currentNewLine - targetLine) <= contextLines) {
      collected.push(line.startsWith("+") ? line.slice(1) : line.startsWith(" ") ? line.slice(1) : line);
      if (currentNewLine === targetLine) foundTarget = true;
    }
  }

  return foundTarget && collected.length > 0 ? collected.join("\n") : null;
}

const severityColor = (s: string) =>
  s === "error"
    ? { bg: "rgba(212,122,122,0.12)", fg: "var(--red, #d47a7a)" }
    : s === "warning"
      ? { bg: "rgba(212,192,130,0.12)", fg: "var(--yellow, #d4c082)" }
      : { bg: "rgba(212,130,158,0.08)", fg: "var(--accent)" };

/* ─── Shared table ─── */

function ReviewTable({
  reviews,
  onRowClick,
  findingsCount,
  actions,
}: {
  reviews: PendingReview[];
  onRowClick: (r: PendingReview) => void;
  findingsCount: (r: PendingReview) => number;
  actions: (r: PendingReview) => React.ReactNode;
}) {
  return (
    <table
      style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
    >
      <thead>
        <tr
          style={{
            borderBottom: "1px solid var(--border)",
            color: "var(--muted)",
            textAlign: "left",
          }}
        >
          <th style={{ padding: "8px 12px" }}>Repo</th>
          <th style={{ padding: "8px 12px" }}>PR</th>
          <th style={{ padding: "8px 12px" }}>Findings</th>
          <th style={{ padding: "8px 12px" }}>Created</th>
          <th style={{ padding: "8px 12px" }}></th>
        </tr>
      </thead>
      <tbody>
        {reviews.map((r) => (
          <tr
            key={r.id}
            style={{
              borderBottom: "1px solid var(--border)",
              cursor: "pointer",
            }}
            onClick={() => onRowClick(r)}
          >
            <td style={{ padding: "8px 12px" }}>{r.repo}</td>
            <td style={{ padding: "8px 12px" }}>#{r.pull_number}</td>
            <td style={{ padding: "8px 12px" }}>{findingsCount(r)}</td>
            <td style={{ padding: "8px 12px" }}>{timeAgo(r.created_at)}</td>
            <td
              style={{ padding: "8px 12px" }}
              onClick={(e) => e.stopPropagation()}
            >
              {actions(r)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Action button ─── */

function ActionBtn({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        color,
        border: `1px solid ${color}`,
        borderRadius: 0,
        padding: "4px 10px",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      [{label}]
    </button>
  );
}

/* ─── Modal ─── */

function ReviewModal({
  review,
  onClose,
  onApprove,
  onReject,
  onReprocess,
  actionDisabled,
}: {
  review: PendingReview;
  onClose: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onReprocess?: () => void;
  actionDisabled: boolean;
}) {
  const [tab, setTab] = useState<"review" | "diff">("review");
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // Eagerly load diff on mount so Review tab can show code context
  useEffect(() => {
    let cancelled = false;
    setDiffLoading(true);
    api
      .getPendingReviewDiff(review.id)
      .then((res) => {
        if (!cancelled && res.ok) setDiff(res.diff);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [review.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface, #1a1200)",
          borderRadius: 0,
          border: "1px solid var(--border)",
          width: "min(90vw, 900px)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px 0",
          }}
        >
          <h3 style={{ fontSize: 15, margin: 0 }}>
            {review.repo} #{review.pull_number}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 0,
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 14,
              fontFamily: "var(--font-mono)",
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            [x]
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid var(--border)",
            padding: "0 20px",
            marginTop: 12,
          }}
        >
          <TabBtn
            active={tab === "review"}
            label="Review"
            onClick={() => setTab("review")}
          />
          <TabBtn
            active={tab === "diff"}
            label="Files Changed"
            onClick={() => setTab("diff")}
          />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {tab === "review" ? (
            <ReviewTab review={review} diff={diff} />
          ) : (
            <DiffTab diff={diff} loading={diffLoading} />
          )}
        </div>

        {/* Footer with actions */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "12px 20px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          {onReprocess && (
            <ActionBtn
              label="REPROCESS"
              color="var(--yellow, #ffcc00)"
              disabled={actionDisabled}
              onClick={onReprocess}
            />
          )}
          {onReject && (
            <ActionBtn
              label="REJECT"
              color="var(--red, #ff3333)"
              disabled={actionDisabled}
              onClick={onReject}
            />
          )}
          {onApprove && (
            <ActionBtn
              label="APPROVE & POST"
              color="var(--green, #33ff33)"
              disabled={actionDisabled}
              onClick={onApprove}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        borderBottom: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        color: active ? "var(--text)" : "var(--muted)",
        padding: "8px 16px",
        fontSize: 13,
        fontFamily: "var(--font-mono)",
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

/* ─── Review tab ─── */

function ReviewTab({
  review,
  diff,
}: {
  review: PendingReview;
  diff: DiffFile[] | null;
}) {
  return (
    <div>
      {/* Summary body rendered as markdown */}
      <div
        style={{
          background: "var(--bg, #0a0a0a)",
          borderRadius: 0,
          padding: 16,
          border: "1px solid var(--border)",
          marginBottom: 16,
        }}
      >
        <TerminalMarkdown>{review.result_json.bodyMarkdown}</TerminalMarkdown>
      </div>

      {/* Inline comments with code context */}
      {review.result_json.inlineComments.length > 0 && (
        <>
          <h4
            style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}
          >
            Inline Comments ({review.result_json.inlineComments.length})
          </h4>
          {review.result_json.inlineComments.map((c, i) => {
            const sc = severityColor(c.severity);
            const codeCtx = extractCodeContext(diff, c.path, c.line);
            return (
              <div
                key={i}
                style={{
                  background: "var(--bg, #0a0a0a)",
                  borderRadius: 0,
                  border: "1px solid var(--border)",
                  marginBottom: 10,
                  overflow: "hidden",
                }}
              >
                {/* File header */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--border)",
                    background: "rgba(212,130,158,0.04)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--accent)",
                    }}
                  >
                    {c.path}:{c.line}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "1px 6px",
                      borderRadius: 0,
                      background: sc.bg,
                      color: sc.fg,
                      border: `1px solid ${sc.fg}`,
                    }}
                  >
                    {c.severity}
                  </span>
                </div>

                {/* Code context */}
                {codeCtx && (
                  <pre
                    style={{
                      margin: 0,
                      padding: "8px 12px",
                      fontSize: 12,
                      lineHeight: 1.5,
                      fontFamily: "var(--font-mono)",
                      borderBottom: "1px solid var(--border)",
                      background: "rgba(0,0,0,0.15)",
                      overflow: "auto",
                    }}
                  >
                    {codeCtx.split("\n").map((line, j) => (
                      <div key={j} style={{ minHeight: 18 }}>
                        <span style={{ color: "var(--muted)", userSelect: "none", display: "inline-block", width: 35, textAlign: "right", marginRight: 12 }}>
                          {c.line - Math.floor((codeCtx.split("\n").length - 1) / 2) + j}
                        </span>
                        {line}
                      </div>
                    ))}
                  </pre>
                )}

                {/* Comment body as markdown */}
                <div style={{ padding: "10px 12px" }}>
                  <TerminalMarkdown>{c.body}</TerminalMarkdown>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ─── Diff tab ─── */

function DiffTab({
  diff,
  loading,
}: {
  diff: DiffFile[] | null;
  loading: boolean;
}) {
  if (loading) {
    return <Spinner label="Loading diff" />;
  }

  if (!diff || diff.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 13 }}>
        No files changed.
      </div>
    );
  }

  return (
    <div>
      {diff.map((f) => (
        <div key={f.filename} style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {f.filename}
            </span>
            <span style={{ fontSize: 12, color: "var(--green, #33ff33)" }}>
              +{f.additions}
            </span>
            <span style={{ fontSize: 12, color: "var(--red, #ff3333)" }}>
              -{f.deletions}
            </span>
          </div>
          {f.patch ? (
            <pre
              style={{
                background: "var(--bg, #0a0a0a)",
                borderRadius: 0,
                padding: 12,
                fontSize: 12,
                lineHeight: 1.5,
                overflow: "auto",
                border: "1px solid var(--border)",
                margin: 0,
              }}
            >
              {f.patch.split("\n").map((line, i) => (
                <div
                  key={i}
                  style={{
                    background: line.startsWith("+")
                      ? "rgba(130,212,160,0.08)"
                      : line.startsWith("-")
                        ? "rgba(212,122,122,0.08)"
                        : line.startsWith("@@")
                          ? "rgba(212,130,158,0.06)"
                          : undefined,
                    color: line.startsWith("@@")
                      ? "var(--accent)"
                      : undefined,
                    paddingLeft: 4,
                  }}
                >
                  {line}
                </div>
              ))}
            </pre>
          ) : (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Binary file or no patch available
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
