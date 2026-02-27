import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";
import { colors } from "../../styles/theme";
import type { KnowledgeBaseStats } from "../../api/types";

interface Props {
  data: KnowledgeBaseStats;
}

const KB_COLORS = [colors.green, colors.red, colors.muted];

export function KBHealthDoughnut({ data }: Props) {
  const chartData = [
    { name: "Approved", value: data.approved },
    { name: "Rejected", value: data.rejected },
    { name: "Pending", value: data.pending },
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
        Knowledge Base Health
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            dataKey="value"
            paddingAngle={2}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={KB_COLORS[i]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 0,
              fontFamily: "var(--font-mono)",
              color: colors.text,
            }}
          />
          <Legend wrapperStyle={{ color: colors.muted, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
