import { LineChart, Line, ResponsiveContainer } from "recharts";
import { colors } from "../../styles/theme";

interface Props {
  data: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ data, width = 100, height = 24 }: Props) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={colors.accent}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
