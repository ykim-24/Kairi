import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { colors, chartColors } from "../../styles/theme";

interface Props {
  data: Record<string, number>;
}

export function CategoryApprovalBar({ data }: Props) {
  const chartData = Object.entries(data).map(([name, rate]) => ({
    name,
    rate,
  }));

  return (
    <div className="card">
      <h3
        style={{
          fontSize: 14,
          color: "var(--muted)",
          marginBottom: 12,
        }}
      >
        Approval by Category
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData}>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            tick={{ fill: colors.muted, fontSize: 12 }}
          />
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
          <Bar dataKey="rate" radius={[6, 6, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={chartColors[i % chartColors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
