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
import { colors } from "../../styles/theme";

interface Props {
  data: { rule: number; llm: number };
}

export function SourceApprovalBar({ data }: Props) {
  const chartData = [
    { name: "Rule Engine", rate: data.rule },
    { name: "LLM", rate: data.llm },
  ];

  return (
    <div className="card">
      <h3
        style={{
          fontSize: 14,
          color: "var(--muted)",
          marginBottom: 12,
        }}
      >
        Approval by Source (Rule vs LLM)
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            tick={{ fill: colors.muted, fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: colors.muted, fontSize: 12 }}
            width={100}
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
          <Bar dataKey="rate" radius={[0, 6, 6, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={i === 0 ? colors.accent : colors.purple} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
