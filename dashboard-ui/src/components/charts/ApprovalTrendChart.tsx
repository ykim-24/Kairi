import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
} from "recharts";
import type { TrendPoint } from "../../api/types";
import { colors } from "../../styles/theme";

interface Props {
  data: TrendPoint[];
}

export function ApprovalTrendChart({ data }: Props) {
  return (
    <div className="card">
      <h3
        style={{
          fontSize: 14,
          color: "var(--muted)",
          marginBottom: 12,
        }}
      >
        Approval Rate Over Time
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: colors.muted, fontSize: 12 }} />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            tick={{ fill: colors.muted, fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 0,
              fontFamily: "var(--font-mono)",
              color: colors.text,
            }}
            formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, "Approval"]}
          />
          <defs>
            <linearGradient id="approvalFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.accent} stopOpacity={0.2} />
              <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="approvalRate"
            fill="url(#approvalFill)"
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="approvalRate"
            stroke={colors.accent}
            strokeWidth={2}
            dot={{ r: 4, fill: colors.accent }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
