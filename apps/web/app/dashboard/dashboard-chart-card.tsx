'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ChartDataPoint } from '@shelfcure/api-client';

interface Props {
  data: ChartDataPoint[];
}

const FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function labelDay(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function DashboardChartCard({ data }: Props) {
  const chartData = useMemo(
    () => data.map((p) => ({ ...p, label: labelDay(p.day) })),
    [data],
  );

  const totalSales = data.reduce((s, p) => s + Number(p.sales), 0);
  const totalPurchases = data.reduce((s, p) => s + Number(p.purchases), 0);

  return (
    <div className="h-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            14-Day Activity
          </div>
          <div className="mt-0.5 flex items-baseline gap-3">
            <span className="font-mono text-lg font-bold text-emerald-700">
              {FORMAT.format(totalSales)}
            </span>
            <span className="text-[10px] text-zinc-400">sales</span>
            <span className="font-mono text-lg font-bold text-blue-700">
              {FORMAT.format(totalPurchases)}
            </span>
            <span className="text-[10px] text-zinc-400">purchases</span>
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
          No data yet — start recording sales to see your chart.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPurchases" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.20} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradReturns" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.20} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />

            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v: number) => FORMAT.format(v)}
              tick={{ fontSize: 9, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
              width={64}
            />

            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 10,
                border: '1px solid #e4e4e7',
                background: '#fff',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}
              formatter={(value, name) => [
                FORMAT.format(Number(value)),
                String(name).charAt(0).toUpperCase() + String(name).slice(1),
              ]}
              labelStyle={{ fontWeight: 600, marginBottom: 4, color: '#18181b' }}
            />

            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value: string) => value.charAt(0).toUpperCase() + value.slice(1)}
            />

            <Area
              type="monotone"
              dataKey="sales"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradSales)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Area
              type="monotone"
              dataKey="purchases"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#gradPurchases)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Area
              type="monotone"
              dataKey="returns"
              stroke="#f59e0b"
              strokeWidth={1.5}
              fill="url(#gradReturns)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
