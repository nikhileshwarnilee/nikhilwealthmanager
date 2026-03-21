import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AppShell from '../../components/AppShell';
import CollapsibleIntervalSection from '../../components/CollapsibleIntervalSection';
import EmptyState from '../../components/EmptyState';
import Icon, { assetIconKey } from '../../components/Icon';
import ReportExportSheet from '../../components/ReportExportSheet';
import { useToast } from '../../app/ToastContext';
import { useRouteState } from '../../hooks/useRouteState';
import { fetchAssetReport, fetchAssets } from '../../services/assetService';
import { normalizeApiError } from '../../services/http';
import { formatCurrency } from '../../utils/format';
import {
  buildReportDefinition,
  exportReportDefinition,
  formatReportDateRange,
  reportDateRangeFromInterval,
  validateReportDateRange
} from '../../utils/reportExport';
import { createDefaultIntervalState, intervalDisplayLabel, intervalSummaryParams, shiftIntervalState } from '../../utils/intervals';

const chartColors = ['#0ea5e9', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#14b8a6', '#f97316', '#e11d48'];

export default function AssetsWealthPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useRouteState('assets-interval', () => createDefaultIntervalState());
  const [searchOpen, setSearchOpen] = useRouteState('assets-search-open', false);
  const [searchTerm, setSearchTerm] = useRouteState('assets-search-term', '');
  const [summary, setSummary] = useState(null);
  const [assets, setAssets] = useState([]);
  const [report, setReport] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);
  const summaryParams = useMemo(() => intervalSummaryParams(interval), [interval]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsResult, reportResult] = await Promise.allSettled([
        fetchAssets(),
        fetchAssetReport(summaryParams)
      ]);

      if (assetsResult.status === 'fulfilled') {
        setAssets(assetsResult.value.assets || []);
        setSummary(assetsResult.value.summary || null);
      } else {
        setAssets([]);
        setSummary(null);
        pushToast({ type: 'danger', message: normalizeApiError(assetsResult.reason) });
      }

      if (reportResult.status === 'fulfilled') {
        setReport(reportResult.value || null);
      } else {
        setReport(null);
        pushToast({ type: 'warning', message: 'Asset charts are temporarily unavailable.' });
      }
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast, summaryParams]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredAssets = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((asset) =>
      [asset.name, asset.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [assets, searchTerm]);

  const allocationRows = useMemo(() => {
    const rows = report?.asset_allocation || [];
    return rows.map((row, index) => ({
      ...row,
      current_value: Number(row.current_value || 0),
      allocation_percent: Number(row.allocation_percent || 0),
      color: chartColors[index % chartColors.length]
    }));
  }, [report]);

  const investedVsCurrentRows = useMemo(() => {
    return (report?.invested_vs_current || []).map((row) => ({
      ...row,
      invested_amount: Number(row.invested_amount || 0),
      current_value: Number(row.current_value || 0),
      label: String(row.asset_name || '').slice(0, 10)
    }));
  }, [report]);

  const growthRows = useMemo(() => {
    return (report?.growth_over_time || []).map((row) => ({
      ...row,
      cumulative_net_invested: Number(row.cumulative_net_invested || 0)
    }));
  }, [report]);
  const defaultExportRange = useMemo(() => reportDateRangeFromInterval(interval), [interval]);

  const onSwipePrevInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, -1));
  }, []);
  const onSwipeNextInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, 1));
  }, []);
  const onGenerateReport = useCallback(
    async ({ format, fromDate, toDate }) => {
      try {
        const range = validateReportDateRange({ fromDate, toDate });
        const reportData = await fetchAssetReport({
          date_from: range.fromDate,
          date_to: range.toDate
        });

        const definition = buildReportDefinition({
          title: 'Assets / Wealth Report',
          subtitle: 'Portfolio snapshot, allocation, and growth analysis',
          fileName: 'assets-wealth-report',
          dateRangeLabel: formatReportDateRange(range.fromDate, range.toDate),
          meta: [
            { label: 'View Interval', value: intervalLabel },
            { label: 'Search', value: searchTerm.trim() || 'None' },
            {
              label: 'Report Note',
              value: 'Portfolio snapshot uses current holdings while trend tables follow the selected date range.'
            }
          ],
          summary: [
            { label: 'Invested', value: formatCurrency(reportData?.totals?.total_invested || 0) },
            { label: 'Current Value', value: formatCurrency(reportData?.totals?.total_current_value || 0) },
            { label: 'Gain / Loss', value: formatCurrency(reportData?.totals?.total_gain_loss || 0) },
            { label: 'Assets', value: String(reportData?.totals?.asset_count || 0) }
          ],
          tables: [
            {
              name: 'Portfolio Snapshot',
              columns: [
                { key: 'name', label: 'Asset' },
                { key: 'invested_amount', label: 'Invested' },
                { key: 'current_value', label: 'Current Value' },
                { key: 'gain_loss', label: 'Gain / Loss' },
                { key: 'gain_loss_percent', label: 'Gain / Loss %' },
                { key: 'notes', label: 'Notes' }
              ],
              rows: filteredAssets.map((asset) => ({
                name: asset.name || '-',
                invested_amount: formatCurrency(asset.invested_amount || 0),
                current_value: formatCurrency(asset.current_value || 0),
                gain_loss: formatCurrency(asset.gain_loss || 0),
                gain_loss_percent: `${Number(asset.gain_loss_percent || 0)}%`,
                notes: asset.notes || ''
              }))
            },
            {
              name: 'Allocation Breakdown',
              columns: [
                { key: 'asset_name', label: 'Asset' },
                { key: 'current_value', label: 'Current Value' },
                { key: 'allocation_percent', label: 'Allocation' }
              ],
              rows: (reportData?.asset_allocation || []).map((row) => ({
                asset_name: row.asset_name || '-',
                current_value: formatCurrency(row.current_value || 0),
                allocation_percent: `${Number(row.allocation_percent || 0)}%`
              }))
            },
            {
              name: 'Invested vs Current',
              columns: [
                { key: 'asset_name', label: 'Asset' },
                { key: 'invested_amount', label: 'Invested' },
                { key: 'current_value', label: 'Current Value' }
              ],
              rows: (reportData?.invested_vs_current || []).map((row) => ({
                asset_name: row.asset_name || '-',
                invested_amount: formatCurrency(row.invested_amount || 0),
                current_value: formatCurrency(row.current_value || 0)
              }))
            },
            {
              name: 'Gain Loss by Asset',
              columns: [
                { key: 'asset_name', label: 'Asset' },
                { key: 'gain_loss', label: 'Gain / Loss' },
                { key: 'gain_loss_percent', label: 'Gain / Loss %' }
              ],
              rows: (reportData?.gain_loss_by_type || []).map((row) => ({
                asset_name: row.asset_name || '-',
                gain_loss: formatCurrency(row.gain_loss || 0),
                gain_loss_percent: `${Number(row.gain_loss_percent || 0)}%`
              }))
            },
            {
              name: 'Growth Over Time',
              columns: [
                { key: 'label', label: 'Date' },
                { key: 'invested_in', label: 'Invested In' },
                { key: 'redeemed_out', label: 'Redeemed Out' },
                { key: 'net_invested', label: 'Net Invested' },
                { key: 'cumulative_net_invested', label: 'Cumulative Net' }
              ],
              rows: (reportData?.growth_over_time || []).map((row) => ({
                label: row.label || '-',
                invested_in: formatCurrency(row.invested_in || 0),
                redeemed_out: formatCurrency(row.redeemed_out || 0),
                net_invested: formatCurrency(row.net_invested || 0),
                cumulative_net_invested: formatCurrency(row.cumulative_net_invested || 0)
              }))
            },
            {
              name: 'Value Updates',
              columns: [
                { key: 'label', label: 'Date' },
                { key: 'reported_value', label: 'Reported Value' },
                { key: 'updates_count', label: 'Updates' }
              ],
              rows: (reportData?.value_updates_over_time || []).map((row) => ({
                label: row.label || '-',
                reported_value: formatCurrency(row.reported_value || 0),
                updates_count: String(row.updates_count || 0)
              }))
            }
          ]
        });

        await exportReportDefinition(format, definition);
        pushToast({ type: 'success', message: `${format.toUpperCase()} report generated.` });
      } catch (error) {
        pushToast({ type: 'danger', message: error?.message || normalizeApiError(error) });
      }
    },
    [filteredAssets, intervalLabel, pushToast, searchTerm]
  );

  return (
    <AppShell
      title="Assets / Wealth"
      subtitle={`Interval: ${intervalLabel}`}
      onRefresh={load}
      showFab={false}
      onExport={() => setExportOpen(true)}
      searchEnabled
      searchOpen={searchOpen}
      searchValue={searchTerm}
      onToggleSearch={() => setSearchOpen((prev) => !prev)}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search assets"
      intervalSwipeEnabled={interval.mode !== 'all_time'}
      onIntervalSwipePrev={onSwipePrevInterval}
      onIntervalSwipeNext={onSwipeNextInterval}
    >
      <section className="card-surface rounded-xl p-2">
        <CollapsibleIntervalSection value={interval} onChange={setInterval} />
      </section>

      {loading ? (
        <div className="mt-2 space-y-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
          ))}
        </div>
      ) : (
        <>
          <section className="mt-2 grid grid-cols-3 gap-2">
            <div className="card-surface rounded-xl p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Invested</p>
              <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                {formatCurrency(summary?.total_invested || 0)}
              </p>
            </div>
            <div className="card-surface rounded-xl p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Current</p>
              <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                {formatCurrency(summary?.total_current_value || 0)}
              </p>
            </div>
            <div className="card-surface rounded-xl p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Gain / Loss</p>
              <p
                className={`mt-1 text-sm font-bold ${
                  Number(summary?.total_gain_loss || 0) >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {formatCurrency(summary?.total_gain_loss || 0)}
              </p>
            </div>
          </section>

          <section className="mt-2 card-surface rounded-xl p-2">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Asset Allocation</h3>
              <Link to="/assets/types" className="text-[11px] font-semibold text-primary">
                Manage Types
              </Link>
            </div>
            {allocationRows.length ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={allocationRows} dataKey="current_value" nameKey="asset_name" innerRadius={38} outerRadius={66}>
                      {allocationRows.map((row) => (
                        <Cell key={row.asset_type_id} fill={row.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No allocation yet" subtitle="Add asset transactions to see allocation." />
            )}
          </section>

          <section className="mt-2 card-surface rounded-xl p-2">
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invested vs Current</h3>
            {investedVsCurrentRows.length ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={investedVsCurrentRows}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Bar dataKey="invested_amount" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="current_value" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No comparison data" subtitle="Create assets and add investments." />
            )}
          </section>

          <section className="mt-2 card-surface rounded-xl p-2">
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Asset Growth Over Time</h3>
            {growthRows.length ? (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growthRows}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Line type="monotone" dataKey="cumulative_net_invested" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No growth points yet" subtitle="Add asset transactions to build growth history." />
            )}
          </section>

          <section className="mt-2 card-surface rounded-xl p-2">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Assets</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{filteredAssets.length} items</p>
            </div>
            {filteredAssets.length ? (
              <div className="space-y-1.5">
                {filteredAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-2 text-left dark:border-slate-700 dark:bg-slate-900"
                    onClick={() => navigate(`/assets/${asset.id}`)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: asset.color || '#7c3aed' }}
                      >
                        <Icon name={assetIconKey(asset)} size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{asset.name}</p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          Invested {formatCurrency(asset.invested_amount)} | Current {formatCurrency(asset.current_value)}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`text-xs font-semibold ${
                        Number(asset.gain_loss || 0) >= 0 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {formatCurrency(asset.gain_loss || 0)}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="No assets match search" subtitle="Try another search term." />
            )}
          </section>
        </>
      )}

      <ReportExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Assets / Wealth Report"
        subtitle="Generate a PDF, Excel, or CSV wealth report"
        defaultRange={defaultExportRange}
        onGenerate={onGenerateReport}
      />
    </AppShell>
  );
}
