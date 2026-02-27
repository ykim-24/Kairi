import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";
import { colors } from "../../styles/theme";

interface Props {
  data: { error: number; warning: number; info: number };
}

const SEVERITY_COLORS = [colors.red, colors.yellow, colors.accent];

export function SeverityDoughnut({ data }: Props) {
  const chartData = [
    { name: "Error", value: data.error },
    { name: "Warning", value: data.warning },
    { name: "Info", value: data.info },
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
        Severity Distribution
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
              <Cell key={i} fill={SEVERITY_COLORS[i]} />
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
