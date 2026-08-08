"use client";

import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis } from "recharts";

interface Point {
  x: string | number;
  y: number;
}

interface Props {
  data: Point[];
  color: string;
  height?: number;
}

/** Minimal trend chart — no axes, gridlines, or tooltip, just a smoothed
 *  shaded line. Apple Health's own "Highlights" trend-chart language:
 *  calm and glanceable, not a full analytics chart. */
export function Sparkline({ data, color, height = 90 }: Props) {
  // A single point can't interpolate a line — nothing meaningful to draw.
  if (data.length < 2) return null;

  const gradId = `spark-${color.replace("#", "")}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="x" hide />
        <YAxis hide domain={["auto", "auto"]} />
        <Area
          type="monotone"
          dataKey="y"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
