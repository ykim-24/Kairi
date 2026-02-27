import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ReviewTrendPoint } from "../../api/types";
import { colors } from "../../styles/theme";

interface Props {
  data: ReviewTrendPoint[];
}

export function ReviewTrendChart({ data }: Props) {
  return (
    <div className="card">
      <h3
        style={{
          fontSize: 14,
          color: "var(--muted)",
          marginBottom: 12,
        }}
      >
        Reviews & Comments Over Time
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: colors.muted, fontSize: 12 }} />
          <YAxis
            yAxisId="left"
            tick={{ fill: colors.muted, fontSize: 12 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
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
          />
          <Legend
            wrapperStyle={{ color: colors.muted, fontSize: 12 }}
          />
          <Bar
            yAxisId="left"
            dataKey="reviews"
            fill={colors.accent}
            radius={[4, 4, 0, 0]}
            name="Reviews"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avgComments"
            stroke={colors.purple}
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Avg Comments"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
