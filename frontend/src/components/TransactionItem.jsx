import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '../app/AuthContext';
import Icon, { assetIconKey, categoryIconKey } from './Icon';
import { formatCurrency, formatDate } from '../utils/format';
import { hapticTap } from '../utils/haptics';
import { isModuleEnabled } from '../utils/modules';
import { shouldShowUserAttribution } from '../utils/userAttribution';

const SWIPE_WIDTH = 120;

function TransactionItem({ txn, currency = 'INR', onEdit, onDelete, onView }) {
  const { settings } = useAuth();
  const businessesEnabled = isModuleEnabled(settings, 'businesses');
  const showUserAttribution = shouldShowUserAttribution(settings);
  const isAssetOpeningEntry =
    txn.type === 'asset' &&
    Boolean(txn.to_asset_type_id) &&
    !txn.from_account_id &&
    !txn.to_account_id &&
    !txn.from_asset_type_id;

  const [offset, setOffset] = useState(0);
  const [locked, setLocked] = useState(false);
  const startX = useRef(0);
  const moved = useRef(false);
  const dragging = useRef(false);

  const amountTone =
    txn.type === 'income'
      ? 'text-success'
      : txn.type === 'expense'
        ? 'text-danger'
        : txn.type === 'asset'
          ? txn.to_asset_type_id
            ? 'text-primary'
            : 'text-warning'
        : txn.type === 'opening_adjustment'
          ? Number(txn.amount || 0) >= 0
            ? 'text-success'
            : 'text-danger'
        : 'text-warning';

  const noteText = String(txn.note || '').trim();
  const hasNote = noteText.length > 0;
  const businessText = String(txn.business_name || txn.business?.name || '').trim();
  const hasBusiness = businessesEnabled && businessText.length > 0;
  const enteredByText = String(txn.created_by_name || txn.created_by?.name || '').trim();
  const hasEnteredBy = showUserAttribution && enteredByText.length > 0;
  const title =
    txn.type === 'opening_adjustment'
      ? 'Opening adjustment'
      : txn.type === 'asset'
        ? isAssetOpeningEntry
          ? `Opening in ${txn.to_asset_type_name || 'Asset'}`
          : txn.to_asset_type_name
          ? `Invest in ${txn.to_asset_type_name}`
          : txn.from_asset_type_name
            ? `Redeem ${txn.from_asset_type_name}`
            : 'Asset movement'
      : txn.category_name || `${txn.type[0].toUpperCase()}${txn.type.slice(1)}`;
  const accountText =
    txn.type === 'income'
      ? `To ${txn.to_account_name || '-'}`
      : txn.type === 'expense'
        ? `From ${txn.from_account_name || '-'}`
      : txn.type === 'asset'
          ? isAssetOpeningEntry
            ? `Added to ${txn.to_asset_type_name || '-'}`
            : txn.to_asset_type_name
            ? `${txn.from_account_name || '-'} to ${txn.to_asset_type_name}`
            : `${txn.from_asset_type_name || '-'} to ${txn.to_account_name || '-'}`
        : txn.type === 'opening_adjustment'
          ? `Account ${txn.to_account_name || txn.from_account_name || '-'}`
        : `${txn.from_account_name || '-'} to ${txn.to_account_name || '-'}`;

  const iconName = useMemo(() => {
    if (txn.type === 'opening_adjustment') return 'accounts';
    if (txn.type === 'asset') {
      return assetIconKey({
        icon: txn.to_asset_type_icon || txn.from_asset_type_icon,
        name: txn.to_asset_type_name || txn.from_asset_type_name
      });
    }
    return categoryIconKey(txn);
  }, [txn]);
  const categoryColor = useMemo(() => {
    const raw = String(txn.category_color || txn.category?.color || '').trim();
    if (!raw) return '';
    return raw;
  }, [txn]);
  const useCategoryColor = Boolean(categoryColor) && txn.type !== 'transfer' && txn.type !== 'opening_adjustment' && txn.type !== 'asset';

  const onPointerDown = useCallback(
    (event) => {
      if (!onEdit && !onDelete) return;
      dragging.current = true;
      moved.current = false;
      startX.current = event.clientX;
    },
    [onDelete, onEdit]
  );

  const onPointerMove = useCallback((event) => {
    if (!dragging.current) return;
    const delta = event.clientX - startX.current;
    if (Math.abs(delta) > 6) {
      moved.current = true;
    }
    const next = Math.max(-SWIPE_WIDTH, Math.min(0, locked ? -SWIPE_WIDTH + delta : delta));
    setOffset(next);
  }, [locked]);

  const onPointerEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;

    if (offset < -55) {
      setOffset(-SWIPE_WIDTH);
      setLocked(true);
      hapticTap(8);
    } else {
      setOffset(0);
      setLocked(false);
    }
  }, [offset]);

  const closeSwipe = () => {
    setOffset(0);
    setLocked(false);
  };

  const openView = useCallback(() => {
    if (!onView) return;
    if (moved.current) {
      moved.current = false;
      return;
    }
    onView(txn);
  }, [onView, txn]);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {(onEdit || onDelete) && (
        <div className="absolute inset-y-0 right-0 flex w-[120px] items-stretch">
          {onEdit ? (
            <button
              type="button"
              className="flex-1 bg-slate-800 text-xs font-bold text-white"
              onClick={() => {
                closeSwipe();
                onEdit(txn);
              }}
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="flex-1 bg-danger text-xs font-bold text-white"
              onClick={() => {
                closeSwipe();
                onDelete(txn);
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        className={`card-surface relative touch-pan-y select-none p-3 transition-transform duration-200 ${
          onView ? 'cursor-pointer' : ''
        }`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onClick={openView}
        onKeyDown={(event) => {
          if (!onView) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openView();
          }
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              useCategoryColor ? 'text-white' : 'bg-primary/10 text-primary'
            }`}
            style={useCategoryColor ? { backgroundColor: categoryColor } : undefined}
          >
            <Icon name={iconName} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{title}</p>
            {hasNote ? (
              <p className="truncate text-xs text-slate-600 dark:text-slate-300">{noteText}</p>
            ) : null}
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{accountText}</p>
            {hasBusiness ? (
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                Business: {businessText}
              </p>
            ) : null}
            {hasEnteredBy ? (
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                Entered by: {enteredByText}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className={`text-sm font-extrabold ${amountTone}`}>{formatCurrency(txn.amount, currency)}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDate(txn.transaction_date)}</p>
          </div>
        </div>
        {(onEdit || onDelete) ? (
          <div className="mt-2 flex justify-end gap-1">
            {onEdit ? (
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                aria-label="Edit transaction"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(txn);
                }}
              >
                <Icon name="edit" size={14} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-danger dark:bg-red-900/30"
                aria-label="Delete transaction"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(txn);
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default memo(TransactionItem);
