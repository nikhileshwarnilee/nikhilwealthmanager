import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon, { ICON_NAMES, categoryIconKey } from '../../components/Icon';
import { useToast } from '../../app/ToastContext';
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  reorderCategories,
  seedDefaultCategories,
  uploadCategoryIcon,
  updateCategory
} from '../../services/categoryService';
import { normalizeApiError } from '../../services/http';
import { hapticTap } from '../../utils/haptics';

const blankForm = {
  id: null,
  name: '',
  type: 'expense',
  color: '#7c3aed',
  icon: ''
};

function mapCategoryToForm(category) {
  return {
    id: category.id,
    name: category.name || '',
    type: category.type || 'expense',
    color: category.color || '#7c3aed',
    icon: category.icon || ''
  };
}

const categoryTypeOptions = [
  { value: 'expense', label: 'Expense', icon: 'expense' },
  { value: 'income', label: 'Income', icon: 'income' }
];

function parseDeleteDetails(error) {
  return error?.response?.data?.data?.errors || null;
}

function reorderTypeItems(items, sourceId, targetId) {
  const fromIndex = items.findIndex((item) => String(item.id) === String(sourceId));
  const toIndex = items.findIndex((item) => String(item.id) === String(targetId));
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function replaceTypeOrder(allCategories, type, reorderedTypeItems) {
  const queue = [...reorderedTypeItems];
  return allCategories.map((item) => {
    if (item.type !== type) return item;
    return queue.shift() || item;
  });
}

function iconLabel(name) {
  return String(name)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function CategoriesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [categories, setCategories] = useState([]);
  const iconFileInputRef = useRef(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [requiresReallocation, setRequiresReallocation] = useState(false);
  const [replacementOptions, setReplacementOptions] = useState([]);
  const [replacementCategoryId, setReplacementCategoryId] = useState('');
  const [transactionsToMove, setTransactionsToMove] = useState(0);
  const [draggingCategory, setDraggingCategory] = useState(null);
  const [reorderingType, setReorderingType] = useState('');

  const editingCategoryId = id ? String(id) : '';
  const isEditRoute = editingCategoryId !== '';
  const isCreateRoute = location.pathname.endsWith('/new');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchCategories();
      setCategories(response.categories || []);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isCreateRoute) {
      setForm(blankForm);
      return;
    }
    if (!isEditRoute) return;

    const matched = categories.find((item) => String(item.id) === editingCategoryId);
    if (matched) {
      setForm(mapCategoryToForm(matched));
      return;
    }

    if (!loading) {
      pushToast({ type: 'warning', message: 'Category not found.' });
      navigate('/categories', { replace: true });
    }
  }, [categories, editingCategoryId, isCreateRoute, isEditRoute, loading, navigate, pushToast]);

  const fallbackReplacementOptions = useMemo(() => {
    if (!deleteTarget) return [];
    return categories.filter(
      (item) => String(item.id) !== String(deleteTarget.id) && item.type === deleteTarget.type
    );
  }, [categories, deleteTarget]);

  const effectiveReplacementOptions = replacementOptions.length
    ? replacementOptions
    : fallbackReplacementOptions;

  const groupedCategories = useMemo(
    () => ({
      expense: categories.filter((item) => item.type === 'expense'),
      income: categories.filter((item) => item.type === 'income')
    }),
    [categories]
  );
  const categoryIconOptions = useMemo(
    () =>
      ICON_NAMES.map((name) => ({
        value: name,
        label: iconLabel(name)
      })),
    []
  );

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      pushToast({ type: 'warning', message: 'Category name required.' });
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await updateCategory({
          id: form.id,
          name: form.name.trim(),
          icon: form.icon,
          color: form.color
        });
        pushToast({ type: 'success', message: 'Category updated.' });
      } else {
        await createCategory({
          name: form.name.trim(),
          type: form.type,
          color: form.color,
          icon: form.icon
        });
        pushToast({ type: 'success', message: 'Category created.' });
      }
      setForm(blankForm);
      await load();
      if (isCreateRoute || isEditRoute) {
        navigate('/categories', { replace: true });
      }
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const resetDeleteFlow = () => {
    setDeleteTarget(null);
    setRequiresReallocation(false);
    setReplacementOptions([]);
    setReplacementCategoryId('');
    setTransactionsToMove(0);
    setDeleting(false);
  };

  const requestDelete = (category) => {
    setDeleteTarget(category);
    setRequiresReallocation(false);
    setReplacementOptions([]);
    setReplacementCategoryId('');
    setTransactionsToMove(0);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const options =
        requiresReallocation && replacementCategoryId
          ? { replacement_category_id: Number(replacementCategoryId) }
          : {};
      await deleteCategory(deleteTarget.id, options);
      pushToast({ type: 'success', message: 'Category deleted.' });
      resetDeleteFlow();
      await load();
      if (isEditRoute && String(deleteTarget.id) === editingCategoryId) {
        navigate('/categories', { replace: true });
      }
    } catch (error) {
      const details = parseDeleteDetails(error);
      if (error?.response?.status === 409 && details?.requires_reallocation) {
        setRequiresReallocation(true);
        setReplacementOptions(details.categories || []);
        setTransactionsToMove(Number(details.transaction_count || 0));
        const first = (details.categories || [])[0];
        setReplacementCategoryId(first ? String(first.id) : '');
        setDeleting(false);
        return;
      }
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      setDeleting(false);
    }
  };

  const onSeed = async () => {
    try {
      await seedDefaultCategories();
      pushToast({ type: 'success', message: 'Default categories added.' });
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    }
  };

  const onPickCustomIcon = () => {
    iconFileInputRef.current?.click();
  };

  const onCustomIconSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadingIcon(true);
    try {
      const response = await uploadCategoryIcon(file);
      setForm((prev) => ({
        ...prev,
        icon: response.icon_path || prev.icon
      }));
      pushToast({ type: 'success', message: 'Category icon uploaded.' });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleDropOnCategory = async (targetCategory) => {
    if (!draggingCategory) return;
    if (draggingCategory.type !== targetCategory.type) return;
    if (String(draggingCategory.id) === String(targetCategory.id)) return;

    const type = targetCategory.type;
    const currentTypeItems = groupedCategories[type] || [];
    const reorderedTypeItems = reorderTypeItems(currentTypeItems, draggingCategory.id, targetCategory.id);
    const nextCategories = replaceTypeOrder(categories, type, reorderedTypeItems);

    setCategories(nextCategories);
    setDraggingCategory(null);
    setReorderingType(type);

    try {
      await reorderCategories(
        type,
        reorderedTypeItems.map((item) => item.id)
      );
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      await load();
    } finally {
      setReorderingType('');
    }
  };

  return (
    <AppShell title="Categories" subtitle="Income and expense types" onRefresh={load} showFab={false}>
      <form className="card-surface space-y-2 p-3" onSubmit={onSubmit}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {form.id ? 'Edit Category' : 'Add Category'}
          </h3>
          {(isCreateRoute || isEditRoute) ? (
            <button
              type="button"
              className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              onClick={() => navigate('/categories', { replace: true })}
            >
              Back to list
            </button>
          ) : null}
        </div>

        <input
          type="text"
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          placeholder="Category name"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        />

        {!form.id ? (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</p>
            <HorizontalSelector
              items={categoryTypeOptions}
              selected={form.type}
              onSelect={(value) => {
                hapticTap();
                setForm((prev) => ({ ...prev, type: value }));
              }}
              iconKey={(item) => item.icon}
            />
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Category type is locked on edit ({form.type}).
          </p>
        )}

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Color</p>
          <input
            type="color"
            className="h-9 w-14 rounded-lg border border-slate-200 bg-white px-1 py-1 dark:border-slate-700 dark:bg-slate-900"
            value={form.color}
            onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
          />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{form.color}</span>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Icon</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                onClick={onPickCustomIcon}
                disabled={uploadingIcon}
              >
                {uploadingIcon ? 'Uploading...' : 'Upload'}
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                onClick={() => setForm((prev) => ({ ...prev, icon: '' }))}
              >
                Clear
              </button>
            </div>
          </div>
          <input
            ref={iconFileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif"
            className="hidden"
            onChange={onCustomIconSelected}
          />
          <div className="mb-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Current</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: form.color || '#7c3aed' }}
              >
                <Icon name={categoryIconKey(form)} size={16} />
              </span>
              <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                {form.icon || 'No icon selected'}
              </p>
            </div>
          </div>
          <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1 scroll-hidden sm:grid-cols-6">
            {categoryIconOptions.map((item) => {
              const active = form.icon === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`rounded-xl border p-2 text-center transition-all ${
                    active
                      ? 'border-primary bg-primary/12 text-primary shadow-card'
                      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                  onClick={() => setForm((prev) => ({ ...prev, icon: item.value }))}
                  title={item.label}
                >
                  <span
                    className="mx-auto mb-1 inline-flex h-7 w-7 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: form.color || '#7c3aed' }}
                  >
                    <Icon name={item.value} size={14} />
                  </span>
                  <p className="truncate text-[10px] font-semibold">{item.label}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-70"
          >
            {saving ? 'Saving...' : form.id ? 'Update' : 'Create'}
          </button>
          {form.id ? (
            <button
              type="button"
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              onClick={() => {
                setForm(blankForm);
                if (isEditRoute) navigate('/categories', { replace: true });
              }}
            >
              Cancel
            </button>
          ) : null}
          {!form.id ? (
            <button
              type="button"
              className="rounded-xl bg-warning px-4 py-2 text-sm font-semibold text-white"
              onClick={onSeed}
            >
              Seed defaults
            </button>
          ) : null}
        </div>
      </form>

      <div className="mt-3 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-16 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
          ))
        ) : categories.length ? (
          <>
            <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Drag and drop categories to set preference order. This order is used in Add Transaction.
            </p>

            {[
              { key: 'expense', title: 'Expense Categories' },
              { key: 'income', title: 'Income Categories' }
            ].map((section) => {
              const typeItems = groupedCategories[section.key] || [];
              return (
                <section key={section.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {section.title}
                    </h4>
                    {reorderingType === section.key ? (
                      <span className="text-[11px] text-primary">Saving order...</span>
                    ) : null}
                  </div>

                  {typeItems.length ? (
                    typeItems.map((category) => (
                      <div
                        key={category.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', String(category.id));
                          setDraggingCategory({ id: category.id, type: category.type });
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleDropOnCategory(category);
                        }}
                        onDragEnd={() => setDraggingCategory(null)}
                        className={`card-surface flex items-center justify-between rounded-2xl p-3 ${
                          draggingCategory && String(draggingCategory.id) === String(category.id)
                            ? 'opacity-60'
                            : ''
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            <Icon name="transactions" size={14} />
                          </span>
                          <span
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white"
                            style={{ backgroundColor: category.color || '#7c3aed' }}
                          >
                            <Icon name={categoryIconKey(category)} size={16} />
                          </span>
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{category.name}</h4>
                            <p className="text-[11px] uppercase text-slate-500 dark:text-slate-400">{category.type}</p>
                          </div>
                        </div>
                        <div className="space-x-1">
                          <button
                            type="button"
                            className="rounded-lg bg-primary px-2 py-1 text-[11px] font-semibold text-white"
                            onClick={() => navigate(`/categories/${category.id}`)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            onClick={() => navigate(`/categories/${category.id}/edit`)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-danger px-2 py-1 text-[11px] font-semibold text-white"
                            onClick={() => requestDelete(category)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState title={`No ${section.key} categories`} subtitle="Create categories to continue." />
                  )}
                </section>
              );
            })}
          </>
        ) : (
          <EmptyState
            title="No categories found"
            subtitle="Create income and expense categories for better analytics."
          />
        )}
      </div>

      <BottomSheet open={Boolean(deleteTarget)} onClose={resetDeleteFlow} title="Delete Category">
        <div className="space-y-3">
          {!requiresReallocation ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Delete <strong>{deleteTarget?.name}</strong>?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                If transactions use this category, replacement will be required.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                This category has {transactionsToMove} transaction(s). Select a replacement category.
              </p>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={replacementCategoryId}
                onChange={(event) => setReplacementCategoryId(event.target.value)}
              >
                <option value="">Select replacement category</option>
                {effectiveReplacementOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              onClick={resetDeleteFlow}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting || (requiresReallocation && !replacementCategoryId)}
              className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              onClick={submitDelete}
            >
              {deleting ? 'Processing...' : 'Delete Category'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </AppShell>
  );
}
