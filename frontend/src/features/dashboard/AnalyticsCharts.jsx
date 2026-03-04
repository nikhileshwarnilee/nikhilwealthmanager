import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

export default function AnalyticsCharts({ monthlyBar = [], pieData = [], trendData = [] }) {
  return (
    <section className="space-y-3">
      <div className="card-surface p-3">
        <h3 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Monthly Income vs Expense</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyBar}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="income" fill="#16a34a" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expense" fill="#dc2626" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-surface p-3">
        <h3 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Category Spend</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="total_spent" nameKey="category_name" outerRadius={80} label>
                {pieData.map((entry) => (
                  <Cell key={entry.category_id} fill={entry.category_color || '#7c3aed'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-surface p-3">
        <h3 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Spending Trend (30 days)</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="expense" stroke="#dc2626" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
