import { api } from "../../api/client";
import { useFetch } from "../../hooks/useFetch";
import { StatCard } from "../shared/StatCard";
import { Spinner } from "../shared/Spinner";
import { ApprovalTrendChart } from "../charts/ApprovalTrendChart";
import { ReviewTrendChart } from "../charts/ReviewTrendChart";
import { SeverityDoughnut } from "../charts/SeverityDoughnut";
import { KBHealthDoughnut } from "../charts/KBHealthDoughnut";
import { SourceApprovalBar } from "../charts/SourceApprovalBar";
import { CategoryApprovalBar } from "../charts/CategoryApprovalBar";

interface Props {
  repo?: string;
  period?: string;
}

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

function approvalColor(rate: number) {
  if (rate >= 0.7) return "var(--green)";
  if (rate >= 0.4) return "var(--yellow)";
  return "var(--red)";
}

export function OverviewPage({ repo, period = "week" }: Props) {
  const { data: summary, loading: sLoad } = useFetch(
    () => api.getSummary(repo, period),
    [repo, period]
  );
  const { data: approvalTrend, loading: atLoad } = useFetch(
    () => api.getApprovalTrend(repo, period),
    [repo, period]
  );
  const { data: reviewTrend, loading: rtLoad } = useFetch(
    () => api.getReviewTrend(repo, period),
    [repo, period]
  );
  const { data: kb, loading: kbLoad } = useFetch(
    () => api.getKnowledgeBase(repo),
    [repo]
  );

  if (sLoad || atLoad || rtLoad || kbLoad) return <Spinner />;
  if (!summary) return null;

  return (
    <>
      <div className="grid" style={{ marginBottom: 24 }}>
        <StatCard
          title="Approval Rate"
          value={pct(summary.approvalRate)}
          color={approvalColor(summary.approvalRate)}
          delta={summary.approvalRateDelta}
        />
        <StatCard title="Total Reviews" value={String(summary.totalReviews)} />
        <StatCard
          title="Avg Comments / Review"
          value={summary.avgCommentsPerReview.toFixed(1)}
        />
        <StatCard
          title="Avg Review Time"
          value={`${(summary.avgDurationMs / 1000).toFixed(1)}s`}
        />
        <StatCard
          title="LLM Parse Success"
          value={pct(summary.llmParseSuccessRate)}
          color="var(--green)"
        />
        <StatCard
          title="Avg Tokens / Review"
          value={Math.round(summary.avgTokensPerReview).toLocaleString()}
        />
        <StatCard
          title="Patterns Recalled / Review"
          value={summary.avgPatternsRecalled.toFixed(1)}
        />
        <StatCard
          title="Total Feedback"
          value={String(summary.totalFeedback)}
        />
      </div>

      <div className="chart-row">
        {approvalTrend && <ApprovalTrendChart data={approvalTrend} />}
        {reviewTrend && <ReviewTrendChart data={reviewTrend} />}
      </div>
      <div className="chart-row">
        <SourceApprovalBar data={summary.approvalRateBySource} />
        <CategoryApprovalBar data={summary.approvalRateByCategory} />
      </div>
      <div className="chart-row">
        <SeverityDoughnut data={summary.severityDistribution} />
        {kb && <KBHealthDoughnut data={kb} />}
      </div>
    </>
  );
}
