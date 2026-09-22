import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  RadarChart as RechartsRadarChart,
  Radar as RechartsRadar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart as RechartsLineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
} from 'recharts'
import { Card, CardContent } from '@components/ui/Card'

const COLORS = [
  '#22c55e',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
]

interface GroupedBarChartProps {
  data: Array<Record<string, any>>
  keys: string[]
  labels: Record<string, string>
  colors?: string[]
  xKey: string
  height?: number
  title?: string
  subtitle?: string
  showLegend?: boolean
  yAxisLabel?: string
}

export function GroupedBarChart({
  data,
  keys,
  labels,
  colors = COLORS,
  xKey,
  height = 300,
  title,
  subtitle,
  showLegend = true,
  yAxisLabel,
}: GroupedBarChartProps) {
  const maxValue = Math.max(...data.flatMap((d) => keys.map((k) => d[k] || 0)))

  return (
    <Card className="h-full">
      {(title || subtitle) && (
        <div className="px-6 py-4 border-b border-dark-700/50">
          {title && <h3 className="text-lg font-semibold text-dark-50">{title}</h3>}
          {subtitle && <p className="text-sm text-dark-400 mt-1">{subtitle}</p>}
        </div>
      )}
      <CardContent className="h-[calc(100%-80px)]">
        <ResponsiveContainer width="100%" height={height}>
          <RechartsBarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 10 }} barCategoryGap={12}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              type="number"
              domain={[0, Math.max(100, maxValue * 1.1)]}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              label={{ value: yAxisLabel || 'Score', position: 'insideTop', offset: -30, fill: '#64748b', fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              width={120}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              }}
              labelStyle={{ color: '#f1f5f9' }}
              itemStyle={{ fontSize: '12px' }}
              formatter={(value: number) => [value.toFixed(1), '']}
            />
            {showLegend && (
              <Legend
                layout="horizontal"
                align="center"
                verticalAlign="bottom"
                iconType="square"
                wrapperStyle={{ paddingTop: '10px', color: '#94a3b8', fontSize: '11px' }}
              />
            )}
            {keys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                name={labels[key] || key}
                fill={colors[index % colors.length]}
                radius={[0, 4, 4, 0]}
                maxBarSize={32}
              >
                {data.map((_, i) => (
                  <Cell key={`cell-${key}-${i}`} fill={colors[index % colors.length]} />
                ))}
              </Bar>
            ))}
          </RechartsBarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

interface RadarChartProps {
  data: Array<Record<string, any>>
  keys: string[]
  labels: Record<string, string>
  colors?: string[]
  nameKey: string
  height?: number
  title?: string
}

export function RadarChart({ data, keys, labels, colors = COLORS, nameKey, height = 300, title }: RadarChartProps) {
  const radarData = data.map((entry) => ({
    [nameKey]: entry[nameKey],
    ...Object.fromEntries(keys.map((k) => [labels[k] || k, entry[k]])),
  }))

  return (
    <Card className="h-full">
      {title && <div className="px-6 py-4 border-b border-dark-700/50"><h3 className="text-lg font-semibold text-dark-50">{title}</h3></div>}
      <CardContent className="h-[calc(100%-60px)]">
        <ResponsiveContainer width="100%" height={height}>
          <RechartsRadarChart data={radarData}>
            <PolarGrid gridType="polygon" stroke="#1e293b" />
            <PolarAngleAxis dataKey={nameKey} tick={{ fill: '#64748b', fontSize: 11 }} />
            <PolarRadiusAxis angle={30} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [value.toFixed(1), '']}
            />
            <Legend
              layout="horizontal"
              align="center"
              verticalAlign="bottom"
              wrapperStyle={{ paddingTop: '10px', color: '#94a3b8', fontSize: '11px' }}
            />
            {keys.map((key, index) => (
              <RechartsRadar
                key={key}
                dataKey={labels[key] || key}
                name={labels[key] || key}
                stroke={colors[index % colors.length]}
                fill={colors[index % colors.length]}
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </RechartsRadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

interface LineChartProps {
  data: Array<Record<string, any>>
  xKey: string
  lines: Array<{ key: string; label: string; color: string }>
  height?: number
  title?: string
  yAxisLabel?: string
}

export function LineChart({ data, xKey, lines, height = 300, title, yAxisLabel }: LineChartProps) {
  return (
    <Card className="h-full">
      {title && <div className="px-6 py-4 border-b border-dark-700/50"><h3 className="text-lg font-semibold text-dark-50">{title}</h3></div>}
      <CardContent className="h-[calc(100%-60px)]">
        <ResponsiveContainer width="100%" height={height}>
          <RechartsLineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey={xKey}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              label={{ value: yAxisLabel, position: 'insideTop', offset: -30, fill: '#64748b', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
              }}
            />
            <Legend
              layout="horizontal"
              align="center"
              verticalAlign="bottom"
              wrapperStyle={{ paddingTop: '10px', color: '#94a3b8', fontSize: '11px' }}
            />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
              />
            ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

interface PieChartProps {
  data: Array<{ name: string; value: number; color?: string }>
  height?: number
  title?: string
}

export function PieChart({ data, height = 300, title }: PieChartProps) {
  return (
    <Card className="h-full">
      {title && <div className="px-6 py-4 border-b border-dark-700/50"><h3 className="text-lg font-semibold text-dark-50">{title}</h3></div>}
      <CardContent className="h-[calc(100%-60px)] flex items-center justify-center">
        <ResponsiveContainer width="100%" height={height}>
          <RechartsPieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [value.toLocaleString(), '']}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ color: '#94a3b8', fontSize: '11px' }}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}