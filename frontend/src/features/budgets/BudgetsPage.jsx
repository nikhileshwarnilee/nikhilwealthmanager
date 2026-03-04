import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import { categoryIconKey } from '../../components/Icon';
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

  const existingByCategory = useMemo(() => {
    const map = new Map();
    for (const item of budgetData.items || []) {
      map.set(String(item.category_id), item);
    }
    return map;
  }, [budgetData.items]);

  const monthOptions = useMemo(() => monthSelectorOptions(8, currentMonthKey()), []);
  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: String(category.id),
        label: category.name,
        icon: categoryIconKey(category)
      })),
    [categories]
  );

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
    <AppShell title="Budgets" subtitle="Monthly budget planning" onRefresh={load}>
      <div className="card-surface p-3">
        <form className="grid gap-2" onSubmit={onSubmit}>
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Category</p>
            <HorizontalSelector
              items={categoryOptions}
              selected={form.category_id}
              onSelect={(selected) => {
                hapticTap();
                const existing = existingByCategory.get(selected);
                setForm({
                  category_id: selected,
                  amount: existing ? String(existing.budget_amount) : ''
                });
              }}
              iconKey={(item) => item.icon}
            />
          </div>

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
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-70"
          >
            {saving ? 'Saving...' : isAllMonths(month) ? 'Select Month to Save' : 'Save Budget'}
          </button>
        </form>
      </div>

      <div className="mt-3 card-surface p-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">Total Budget</p>
        <h3 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
          {formatCurrency(budgetData.total_budget || 0)}
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Spent {formatCurrency(budgetData.total_spent || 0)} ({budgetData.total_utilization_percent || 0}%)
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
          ))
        ) : (budgetData.items || []).length ? (
          (budgetData.items || []).map((item) => {
            const util = Number(item.utilization_percent || 0);
            const barColor =
              util > 100 ? 'bg-danger' : util >= 80 ? 'bg-warning' : util >= 50 ? 'bg-primary' : 'bg-success';
            return (
              <div key={item.id} className="card-surface p-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.category_name}</h4>
                  <div className="space-x-1">
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
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.month}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {formatCurrency(item.spent_amount)} / {formatCurrency(item.budget_amount)}
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className={`h-2 rounded-full ${barColor}`}
                    style={{ width: `${Math.min(100, util)}%` }}
                  />
                </div>
                {item.is_over_budget ? (
                  <p className="mt-1 text-xs font-semibold text-danger">Over budget by {formatCurrency(Math.abs(item.remaining_amount))}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Remaining {formatCurrency(item.remaining_amount)}
                  </p>
                )}
              </div>
            );
          })
        ) : (
          <EmptyState
            title="No budgets set"
            subtitle="Set monthly budgets for expense categories to track utilization."
          />
        )}
      </div>
    </AppShell>
  );
}
