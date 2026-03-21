import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon, { categoryIconKey } from '../../components/Icon';
import { useToast } from '../../app/ToastContext';
import { normalizeApiError } from '../../services/http';
import { budgetVsActual, deleteBudget, setBudget } from '../../services/budgetService';
import { fetchCategories } from '../../services/categoryService';
import { currentMonthKey, formatCurrency, isAllMonths, monthSelectorOptions } from '../../utils/format';
import { hapticTap } from '../../utils/haptics';

export default function BudgetsPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [month, setMonth] = useState(currentMonthKey());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [budgetData, setBudgetData] = useState({ items: [] });
  const [form, setForm] = useState({ category_id: '', amount: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, budgetRes] = await Promise.all([
        fetchCategories({ type: 'expense' }),
        budgetVsActual(month)
      ]);
      setCategories(catRes.categories || []);
      setBudgetData(budgetRes);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [month, pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  const budgetItems = budgetData.items || [];
  const existingByCategory = useMemo(() => {
    const map = new Map();
    for (const item of budgetItems) {
      map.set(String(item.category_id), item);
    }
    return map;
  }, [budgetItems]);

  const monthOptions = useMemo(() => monthSelectorOptions(8, currentMonthKey()), []);
  const selectedBudget = form.category_id ? existingByCategory.get(String(form.category_id)) : null;

  const onSubmit = async (event) => {
    event.preventDefault();
    if (isAllMonths(month)) {
      pushToast({ type: 'warning', message: 'Select a specific month to set a budget.' });
      return;
    }
    if (!form.category_id || !form.amount || Number(form.amount) <= 0) {
      pushToast({ type: 'warning', message: 'Select category and enter a valid amount.' });
      return;
    }
    setSaving(true);
    try {
      await setBudget({
        category_id: Number(form.category_id),
        month,
        amount: Number(form.amount)
      });
      pushToast({ type: 'success', message: 'Budget saved.' });
      setForm({ category_id: '', amount: '' });
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (item) => {
    if (!window.confirm('Delete this budget?')) return;
    try {
      await deleteBudget(item.id);
      pushToast({ type: 'success', message: 'Budget deleted.' });
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    }
  };

  return (
    <AppShell
      title="Budgets"
      subtitle="Monthly budget planning"
      onRefresh={load}
      showFab={false}
      contentScrollable={false}
      contentClassName="overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <section className="card-surface shrink-0 rounded-2xl p-3">
          <form className="space-y-3" onSubmit={onSubmit}>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Month</p>
              <HorizontalSelector
                items={monthOptions}
                selected={month}
                onSelect={(value) => {
                  hapticTap();
                  setMonth(value);
                }}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Category
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Pick a category the same way you select it while adding a transaction.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {categories.length} categories
                </span>
              </div>

              {categories.length ? (
                <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1 scroll-hidden sm:grid-cols-3">
                  {categories.map((category) => {
                    const idValue = String(category.id);
                    const active = form.category_id === idValue;
                    const existing = existingByCategory.get(idValue);
                    return (
                      <button
                        key={idValue}
                        type="button"
                        className={`rounded-2xl border p-3 text-left transition ${
                          active
                            ? 'border-primary bg-primary/10 shadow-card'
                            : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                        }`}
                        onClick={() => {
                          hapticTap();
                          setForm({
                            category_id: idValue,
                            amount: existing ? String(existing.budget_amount) : ''
                          });
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white"
                            style={{ backgroundColor: category.color || '#7c3aed' }}
                          >
                            <Icon name={categoryIconKey(category)} size={18} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {category.name}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              {existing ? `Budget ${formatCurrency(existing.budget_amount)}` : 'No budget yet'}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                  No expense categories found yet. Create one from Categories first.
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Budget Amount
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={form.amount}
                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                />
              </label>

              <button
                type="submit"
                disabled={saving || isAllMonths(month)}
                className="rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-70"
              >
                {saving ? 'Saving...' : isAllMonths(month) ? 'Select Month' : 'Save Budget'}
              </button>
            </div>

            {selectedBudget ? (
              <p className="rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                Existing budget for this category: {formatCurrency(selectedBudget.budget_amount)}. Saving again will update it.
              </p>
            ) : null}
          </form>
        </section>

        <section className="grid shrink-0 grid-cols-2 gap-2">
          <div className="card-surface rounded-2xl p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Budget</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
              {formatCurrency(budgetData.total_budget || 0)}
            </p>
          </div>
          <div className="card-surface rounded-2xl p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Spent</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
              {formatCurrency(budgetData.total_spent || 0)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {budgetData.total_utilization_percent || 0}% used
            </p>
          </div>
        </section>

        <section className="card-surface flex min-h-0 flex-1 flex-col rounded-2xl p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Saved Budgets</p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Review existing budgets, open details, or remove old entries.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {budgetItems.length} items
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 scroll-hidden">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="h-24 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
                ))}
              </div>
            ) : budgetItems.length ? (
              <div className="space-y-2">
                {budgetItems.map((item) => {
                  const util = Number(item.utilization_percent || 0);
                  const barColor =
                    util > 100 ? 'bg-danger' : util >= 80 ? 'bg-warning' : util >= 50 ? 'bg-primary' : 'bg-success';

                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{item.category_name}</p>
                          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.month}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            className="rounded-lg bg-primary px-2 py-1 text-[11px] font-semibold text-white"
                            onClick={() => navigate(`/budgets/${item.id}`)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-danger px-2 py-1 text-[11px] font-semibold text-white"
                            onClick={() => onDelete(item)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Budget</p>
                          <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(item.budget_amount)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Spent</p>
                          <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(item.spent_amount)}</p>
                        </div>
                      </div>

                      <div className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className={`h-2 rounded-full ${barColor}`}
                          style={{ width: `${Math.min(100, util)}%` }}
                        />
                      </div>

                      {item.is_over_budget ? (
                        <p className="mt-2 text-xs font-semibold text-danger">
                          Over budget by {formatCurrency(Math.abs(item.remaining_amount))}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                          Remaining {formatCurrency(item.remaining_amount)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No budgets set"
                subtitle="Set monthly budgets for expense categories to track utilization."
              />
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
