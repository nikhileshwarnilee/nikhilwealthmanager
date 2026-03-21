import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BusinessStripSelector from '../../components/BusinessStripSelector';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon, { assetIconKey, categoryIconKey } from '../../components/Icon';
import { useAuth } from '../../app/AuthContext';
import { useToast } from '../../app/ToastContext';
import { API_BASE_URL, normalizeApiError } from '../../services/http';
import { fetchAccounts } from '../../services/accountService';
import { fetchAssets } from '../../services/assetService';
import { fetchBusinesses } from '../../services/businessService';
import { fetchCategories } from '../../services/categoryService';
import { fetchLedgerEntry } from '../../services/ledgerService';
import { createTransaction, fetchTransactions, updateTransaction, uploadTransactionReceipt } from '../../services/transactionService';
import { datetimeLocalNow, formatCurrency } from '../../utils/format';
import { hapticTap } from '../../utils/haptics';
import { isModuleEnabled } from '../../utils/modules';
import { canEditTransaction } from '../../utils/permissions';

const initialForm = {
  amount: '',
  from_account_id: '',
  to_account_id: '',
  from_asset_type_id: '',
  to_asset_type_id: '',
  category_id: '',
  business_id: '',
  note: '',
  location: '',
  receipt_path: '',
  receipt_url: '',
  transaction_date: datetimeLocalNow()
};

const typeOptions = [
  { value: 'expense', label: 'Expense', icon: 'expense' },
  { value: 'income', label: 'Income', icon: 'income' },
  { value: 'transfer', label: 'Transfer', icon: 'transfer' },
  { value: 'asset', label: 'Asset / Investment', icon: 'asset' },
  { value: 'people', label: 'People', icon: 'people' }
];

const assetActionOptions = [
  { value: 'invest', label: 'Invest' },
  { value: 'redeem', label: 'Redeem' },
  { value: 'opening', label: 'Opening / Gift' }
];

const peopleActionOptions = [
  { value: 'pay', label: 'Pay' },
  { value: 'receive', label: 'Receive' },
  { value: 'lend', label: 'Lend' },
  { value: 'borrow', label: 'Borrow' }
];

const regularToPeopleActions = new Set(['pay', 'lend']);

function accountTypeIcon(type) {
  return ['cash', 'bank', 'upi', 'wallet', 'credit', 'people'].includes(type) ? type : 'wallet';
}

function isPeopleReferenceType(referenceType) {
  return String(referenceType || '').toLowerCase().startsWith('people');
}

function derivePeopleAction(referenceType) {
  const raw = String(referenceType || '').toLowerCase();
  if (raw === 'people') return 'lend';
  if (raw.startsWith('people_')) {
    const maybeAction = raw.replace('people_', '');
    if (peopleActionOptions.some((option) => option.value === maybeAction)) {
      return maybeAction;
    }
  }
  return 'lend';
}

function peopleReferenceType(action) {
  return `people_${action}`;
}

function buildReceiptUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${base}/backend/${String(path).replace(/^\/+/, '')}`;
}

function buildLedgerNote(entry) {
  const contactName = String(entry?.contact_name || '').trim();
  const note = String(entry?.note || '').trim();
  if (!contactName) return note;
  if (!note) return contactName;
  return `${contactName} - ${note}`;
}

export default function TransactionFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const editing = Boolean(id);
  const { user, settings } = useAuth();
  const { pushToast } = useToast();
  const businessesEnabled = isModuleEnabled(settings, 'businesses');
  const ledgerEnabled = isModuleEnabled(settings, 'ledger');
  const assetsEnabled = isModuleEnabled(settings, 'assets');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [mode, setMode] = useState('expense');
  const [assetAction, setAssetAction] = useState('invest');
  const [peopleAction, setPeopleAction] = useState('lend');
  const [accounts, setAccounts] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [ledgerEntry, setLedgerEntry] = useState(null);
  const fileInputRef = useRef(null);
  const ledgerEntryId = !editing && ledgerEnabled
    ? Number(searchParams.get('ledger_entry_id') || location.state?.ledgerEntry?.id || 0)
    : 0;
  const ledgerConversionActive = !editing && Boolean(ledgerEntry?.id);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [accRes, catRes, assetRes, businessRes] = await Promise.all([
          fetchAccounts(),
          fetchCategories(),
          assetsEnabled ? fetchAssets() : Promise.resolve({ assets: [] }),
          businessesEnabled ? fetchBusinesses() : Promise.resolve({ businesses: [] })
        ]);
        setAccounts(accRes.accounts || []);
        setCategories(catRes.categories || []);
        setAssetTypes(assetRes.assets || []);
        setBusinesses(businessRes.businesses || []);

        if (editing) {
          setLedgerEntry(null);
          const txRes = await fetchTransactions({ id, page: 1, limit: 1 });
          const tx = txRes.transactions?.[0];
          if (!tx) throw new Error('Transaction not found.');
          if (!canEditTransaction(user, tx)) {
            pushToast({ type: 'warning', message: 'You do not have permission to edit this transaction.' });
            navigate(`/transactions/${id}`, { replace: true });
            return;
          }
          const isPeopleTransfer = tx.type === 'transfer' && isPeopleReferenceType(tx.reference_type);
          const isAssetMovement = tx.type === 'asset';
          if (isAssetMovement && !assetsEnabled) {
            pushToast({ type: 'warning', message: 'Assets / Wealth module is turned off for this account.' });
            navigate('/transactions', { replace: true });
            return;
          }
          const inferredMode = isPeopleTransfer ? 'people' : isAssetMovement ? 'asset' : tx.type;
          setMode(inferredMode);
          if (isPeopleTransfer) {
            setPeopleAction(derivePeopleAction(tx.reference_type));
          }
          if (isAssetMovement) {
            const isDirectAssetEntry = Boolean(tx.to_asset_type_id) && !tx.from_account_id && !tx.to_account_id && !tx.from_asset_type_id;
            if (isDirectAssetEntry || String(tx.reference_type || '') === 'asset_opening') {
              setAssetAction('opening');
            } else {
              setAssetAction(tx.to_asset_type_id ? 'invest' : 'redeem');
            }
          }
          setForm({
            amount: String(tx.amount || ''),
            from_account_id: tx.from_account_id ? String(tx.from_account_id) : '',
            to_account_id: tx.to_account_id ? String(tx.to_account_id) : '',
            from_asset_type_id: tx.from_asset_type_id ? String(tx.from_asset_type_id) : '',
            to_asset_type_id: tx.to_asset_type_id ? String(tx.to_asset_type_id) : '',
            category_id: tx.category_id ? String(tx.category_id) : '',
            business_id: businessesEnabled && tx.business_id ? String(tx.business_id) : '',
            note: tx.note || '',
            location: tx.location || '',
            receipt_path: tx.receipt_path || '',
            receipt_url: tx.receipt_path ? buildReceiptUrl(tx.receipt_path) : '',
            transaction_date: tx.transaction_date
              ? tx.transaction_date.replace(' ', 'T').slice(0, 16)
              : datetimeLocalNow()
          });
        } else if (ledgerEntryId > 0) {
          const entry =
            Number(location.state?.ledgerEntry?.id || 0) === ledgerEntryId
              ? location.state.ledgerEntry
              : (await fetchLedgerEntry(ledgerEntryId)).entry;
          const conversionMode = entry.direction === 'payable' ? 'expense' : 'income';
          const receiptPath = entry.attachment_path || '';
          setLedgerEntry(entry);
          setMode(conversionMode);
          setForm((prev) => ({
            ...prev,
            amount: String(entry.amount || ''),
            category_id: '',
            from_account_id: '',
            to_account_id: '',
            from_asset_type_id: '',
            to_asset_type_id: '',
            business_id: '',
            note: buildLedgerNote(entry),
            location: '',
            receipt_path: receiptPath,
            receipt_url: receiptPath ? buildReceiptUrl(receiptPath) : '',
            transaction_date: datetimeLocalNow()
          }));
        } else {
          setLedgerEntry(null);
          setMode('expense');
          setForm(initialForm);
        }
      } catch (error) {
        pushToast({ type: 'danger', message: normalizeApiError(error) });
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [assetsEnabled, businessesEnabled, editing, id, ledgerEntryId, location.state, navigate, pushToast, user]);

  useEffect(() => {
    if (!businessesEnabled) {
      setBusinesses([]);
      setForm((prev) => (prev.business_id ? { ...prev, business_id: '' } : prev));
    }
  }, [businessesEnabled]);

  useEffect(() => {
    if (!assetsEnabled) {
      setAssetTypes([]);
      setForm((prev) =>
        prev.from_asset_type_id || prev.to_asset_type_id
          ? { ...prev, from_asset_type_id: '', to_asset_type_id: '' }
          : prev
      );
      if (mode === 'asset') {
        setMode('expense');
      }
    }
  }, [assetsEnabled, mode]);

  useEffect(() => {
    if (!ledgerEnabled && ledgerEntry) {
      setLedgerEntry(null);
    }
  }, [ledgerEnabled, ledgerEntry]);

  const visibleCategories = useMemo(() => {
    if (mode === 'transfer' || mode === 'people' || mode === 'asset') return [];
    return categories.filter((item) => item.type === mode);
  }, [categories, mode]);

  const accountSelectorData = useMemo(
    () =>
      accounts.map((item) => ({
        value: String(item.id),
        label: item.name,
        type: item.type,
        balance: item.current_balance
      })),
    [accounts]
  );
  const assetSelectorData = useMemo(
    () =>
      assetTypes.map((item) => ({
        value: String(item.id),
        label: item.name,
        icon: item.icon,
        invested: Number(item.invested_amount || 0),
        current: Number(item.current_value || 0)
      })),
    [assetTypes]
  );

  const regularAccountOptions = useMemo(
    () => accountSelectorData.filter((item) => item.type !== 'people'),
    [accountSelectorData]
  );

  const peopleAccountOptions = useMemo(
    () => accountSelectorData.filter((item) => item.type === 'people'),
    [accountSelectorData]
  );

  const defaultRegularAccountId = useMemo(() => {
    const preferredId = String(user?.default_account_id || '');
    if (preferredId && regularAccountOptions.some((item) => item.value === preferredId)) {
      return preferredId;
    }

    return regularAccountOptions[0]?.value || '';
  }, [regularAccountOptions, user?.default_account_id]);

  const peopleFlowIsRegularToPeople = useMemo(
    () => regularToPeopleActions.has(peopleAction),
    [peopleAction]
  );
  const assetFlowIsAccountToAsset = useMemo(
    () => assetAction === 'invest',
    [assetAction]
  );
  const assetFlowIsAssetToAccount = useMemo(
    () => assetAction === 'redeem',
    [assetAction]
  );

  const fromAccountOptions = useMemo(() => {
    if (mode === 'asset') {
      return assetFlowIsAccountToAsset ? regularAccountOptions : [];
    }
    if (mode !== 'people') return regularAccountOptions;
    return peopleFlowIsRegularToPeople ? regularAccountOptions : peopleAccountOptions;
  }, [assetFlowIsAccountToAsset, mode, peopleAccountOptions, peopleFlowIsRegularToPeople, regularAccountOptions]);

  const toAccountOptions = useMemo(() => {
    if (mode === 'asset') {
      return assetFlowIsAssetToAccount ? regularAccountOptions : [];
    }
    if (mode !== 'people') return regularAccountOptions;
    return peopleFlowIsRegularToPeople ? peopleAccountOptions : regularAccountOptions;
  }, [assetFlowIsAssetToAccount, mode, peopleAccountOptions, peopleFlowIsRegularToPeople, regularAccountOptions]);

  const fromAccountTitle = useMemo(() => {
    if (mode === 'asset') {
      return assetFlowIsAccountToAsset ? 'From account' : 'From asset';
    }
    if (mode !== 'people') return 'From account';
    if (peopleAction === 'borrow') return 'Borrow from';
    if (peopleAction === 'receive') return 'Receive from';
    return 'From account';
  }, [assetFlowIsAccountToAsset, mode, peopleAction]);

  const toAccountTitle = useMemo(() => {
    if (mode === 'asset') {
      return assetFlowIsAccountToAsset ? 'To asset' : 'To account';
    }
    if (mode !== 'people') return 'To account';
    if (peopleAction === 'lend') return 'Lend to';
    if (peopleAction === 'pay') return 'Pay to';
    return 'To account';
  }, [assetFlowIsAccountToAsset, mode, peopleAction]);

  useEffect(() => {
    if (loading || editing || !defaultRegularAccountId) {
      return;
    }

    setForm((prev) => {
      const next = { ...prev };

      if (mode === 'income' && !next.to_account_id) {
        next.to_account_id = defaultRegularAccountId;
      }

      if (mode === 'expense' && !next.from_account_id) {
        next.from_account_id = defaultRegularAccountId;
      }

      if (mode === 'transfer' && !next.from_account_id) {
        next.from_account_id = defaultRegularAccountId;
      }

      if (mode === 'people') {
        if (peopleFlowIsRegularToPeople && !next.from_account_id) {
          next.from_account_id = defaultRegularAccountId;
        }
        if (!peopleFlowIsRegularToPeople && !next.to_account_id) {
          next.to_account_id = defaultRegularAccountId;
        }
      }

      if (mode === 'asset') {
        if (assetAction === 'invest' && !next.from_account_id) {
          next.from_account_id = defaultRegularAccountId;
        }
        if (assetAction === 'redeem' && !next.to_account_id) {
          next.to_account_id = defaultRegularAccountId;
        }
      }

      if (
        next.from_account_id === prev.from_account_id
        && next.to_account_id === prev.to_account_id
      ) {
        return prev;
      }

      return next;
    });
  }, [
    assetAction,
    defaultRegularAccountId,
    editing,
    loading,
    mode,
    peopleFlowIsRegularToPeople
  ]);

  const onTypeSelect = (nextMode) => {
    if (ledgerConversionActive) return;
    if (nextMode === 'asset' && !assetsEnabled) return;
    hapticTap();
    setMode(nextMode);
    if (nextMode === 'people' && mode !== 'people') {
      setPeopleAction('lend');
    }
    if (nextMode === 'asset' && mode !== 'asset') {
      setAssetAction('invest');
    }
    setForm((prev) => ({
      ...prev,
      category_id: nextMode === 'transfer' || nextMode === 'people' || nextMode === 'asset' ? '' : prev.category_id,
      business_id: businessesEnabled && (nextMode === 'income' || nextMode === 'expense') ? prev.business_id : '',
      from_account_id: nextMode === 'people' || mode === 'people' || nextMode === 'asset' || mode === 'asset' ? '' : prev.from_account_id,
      to_account_id: nextMode === 'people' || mode === 'people' || nextMode === 'asset' || mode === 'asset' ? '' : prev.to_account_id,
      from_asset_type_id: nextMode === 'asset' || mode === 'asset' ? '' : prev.from_asset_type_id,
      to_asset_type_id: nextMode === 'asset' || mode === 'asset' ? '' : prev.to_asset_type_id
    }));
  };

  const onAssetActionSelect = (nextAction) => {
    hapticTap();
    setAssetAction(nextAction);
    setForm((prev) => ({
      ...prev,
      from_account_id: '',
      to_account_id: '',
      from_asset_type_id: '',
      to_asset_type_id: ''
    }));
  };

  const onPeopleActionSelect = (nextAction) => {
    hapticTap();
    setPeopleAction(nextAction);
    setForm((prev) => ({
      ...prev,
      from_account_id: '',
      to_account_id: ''
    }));
  };

  const onSubmit = async () => {
    const actualType = mode === 'people' ? 'transfer' : mode === 'asset' ? 'asset' : mode;
    if (!form.amount || Number(form.amount) <= 0) {
      pushToast({ type: 'warning', message: 'Enter a valid amount.' });
      return;
    }
    if (actualType === 'income' && (!form.to_account_id || !form.category_id)) {
      pushToast({ type: 'warning', message: 'Choose destination account and category.' });
      return;
    }
    if (actualType === 'expense' && (!form.from_account_id || !form.category_id)) {
      pushToast({ type: 'warning', message: 'Choose source account and category.' });
      return;
    }
    if (actualType === 'transfer' && (!form.from_account_id || !form.to_account_id)) {
      pushToast({
        type: 'warning',
        message:
          mode === 'people'
            ? 'Choose both account and person for this people transaction.'
            : 'Choose source and destination accounts.'
      });
      return;
    }
    if (actualType === 'transfer' && form.from_account_id === form.to_account_id) {
      pushToast({ type: 'warning', message: 'Source and destination must be different.' });
      return;
    }
    if (actualType === 'asset' && assetAction === 'invest' && (!form.from_account_id || !form.to_asset_type_id)) {
      pushToast({ type: 'warning', message: 'Choose source account and destination asset.' });
      return;
    }
    if (actualType === 'asset' && assetAction === 'redeem' && (!form.from_asset_type_id || !form.to_account_id)) {
      pushToast({ type: 'warning', message: 'Choose source asset and destination account.' });
      return;
    }
    if (actualType === 'asset' && assetAction === 'opening' && !form.to_asset_type_id) {
      pushToast({ type: 'warning', message: 'Choose destination asset for opening/gift entry.' });
      return;
    }
    if (actualType === 'asset' && !assetsEnabled) {
      pushToast({ type: 'warning', message: 'Assets / Wealth module is turned off for this account.' });
      return;
    }

    setSaving(true);
    try {
      const peopleCounterpartyId =
        mode === 'people'
          ? Number(
              (regularToPeopleActions.has(peopleAction)
                ? form.to_account_id
                : form.from_account_id) || 0
            ) || null
          : null;

      const payload = {
        id: editing ? Number(id) : undefined,
        type: actualType,
        amount: Number(form.amount),
        from_account_id: form.from_account_id || null,
        to_account_id: form.to_account_id || null,
        from_asset_type_id: actualType === 'asset' ? form.from_asset_type_id || null : null,
        to_asset_type_id: actualType === 'asset' ? form.to_asset_type_id || null : null,
        category_id: actualType === 'income' || actualType === 'expense' ? form.category_id || null : null,
        business_id: businessesEnabled && (actualType === 'income' || actualType === 'expense') ? form.business_id || null : null,
        note: form.note || '',
        location: form.location || '',
        receipt_path: form.receipt_path || null,
        transaction_date: form.transaction_date ? form.transaction_date.replace('T', ' ') + ':00' : null,
        reference_type:
          mode === 'people'
            ? peopleReferenceType(peopleAction)
            : mode === 'asset'
              ? assetAction === 'invest'
                ? 'asset_investment'
                : assetAction === 'redeem'
                  ? 'asset_liquidation'
                  : 'asset_opening'
              : 'manual',
        reference_id:
          mode === 'people'
            ? peopleCounterpartyId
            : mode === 'asset'
              ? Number((assetAction === 'redeem' ? form.from_asset_type_id : form.to_asset_type_id) || 0) || null
              : null,
        ledger_entry_id: !editing && ledgerConversionActive ? Number(ledgerEntry.id) : null
      };

      const ledgerReturnTo = location.state?.ledgerReturnTo
        || (ledgerEntry?.contact_id ? `/ledger/contacts/${ledgerEntry.contact_id}` : '/ledger');
      if (editing) {
        await updateTransaction(payload);
        pushToast({ type: 'success', message: 'Transaction updated.' });
      } else {
        await createTransaction(payload);
        pushToast({
          type: 'success',
          message: ledgerConversionActive ? 'Ledger item converted to transaction.' : 'Transaction saved.'
        });
      }
      navigate(editing ? '/transactions' : (ledgerConversionActive ? ledgerReturnTo : '/transactions'), { replace: true });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const onPickReceipt = () => {
    fileInputRef.current?.click();
  };

  const onReceiptSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadingReceipt(true);
    try {
      const response = await uploadTransactionReceipt(file);
      setForm((prev) => ({
        ...prev,
        receipt_path: response.receipt_path || '',
        receipt_url: response.receipt_url || buildReceiptUrl(response.receipt_path || '')
      }));
      pushToast({ type: 'success', message: 'Receipt attached.' });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setUploadingReceipt(false);
    }
  };

  const onUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      pushToast({ type: 'warning', message: 'Geolocation is not supported in this browser.' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(5);
        const lng = position.coords.longitude.toFixed(5);
        setForm((prev) => ({ ...prev, location: `${lat}, ${lng}` }));
      },
      () => {
        pushToast({ type: 'warning', message: 'Could not fetch current location.' });
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const receiptExt = String(form.receipt_path || '').split('.').pop()?.toLowerCase() || '';
  const isImageReceipt = ['jpg', 'jpeg', 'png'].includes(receiptExt);
  const isPdfReceipt = receiptExt === 'pdf';
  const baseTypeOptions = assetsEnabled ? typeOptions : typeOptions.filter((option) => option.value !== 'asset');
  const visibleTypeOptions = ledgerConversionActive ? baseTypeOptions.filter((option) => option.value === mode) : baseTypeOptions;

  return (
    <AppShell
      title={editing ? 'Edit Transaction' : ledgerConversionActive ? 'Convert Ledger Item' : 'Add Transaction'}
      subtitle={ledgerConversionActive ? 'Select account and category to complete conversion' : 'Tap-first flow'}
      showFab={false}
      contentScrollable={false}
      contentClassName="overflow-hidden"
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <section className="card-surface flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-2 scroll-hidden">
            {ledgerConversionActive ? (
              <div className="shrink-0 rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">
                Converting {ledgerEntry?.direction === 'payable' ? 'a payable into an expense' : 'a receivable into an income'}.
                Amount and attachment are already pulled from Ledger.
              </div>
            ) : null}
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</p>
            <div className={`shrink-0 grid gap-1 ${ledgerConversionActive ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-5'}`}>
              {visibleTypeOptions.map((option) => {
                const active = mode === option.value;
                return (
                  <button
                    type="button"
                    key={option.value}
                    disabled={ledgerConversionActive}
                    className={`rounded-lg border p-1.5 text-center transition-all ${
                      active
                        ? 'border-primary bg-primary/12 text-primary shadow-card'
                        : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                    onClick={() => onTypeSelect(option.value)}
                  >
                    <span className="mx-auto mb-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                      <Icon name={option.icon} size={14} />
                    </span>
                    <p className="truncate text-[10px] font-bold">{option.label}</p>
                  </button>
                );
              })}
            </div>
            {mode === 'people' ? (
              <div className="shrink-0">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Action
                </p>
                <div className="flex flex-wrap gap-2">
                  {peopleActionOptions.map((option) => {
                    const active = peopleAction === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                          active
                            ? 'border-primary bg-primary/12 text-primary'
                            : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                        onClick={() => onPeopleActionSelect(option.value)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : mode === 'asset' ? (
              <div className="shrink-0">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Flow
                </p>
                <div className="flex flex-wrap gap-2">
                  {assetActionOptions.map((option) => {
                    const active = assetAction === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                          active
                            ? 'border-primary bg-primary/12 text-primary'
                            : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                        onClick={() => onAssetActionSelect(option.value)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {assetAction === 'opening' ? (
                  <p className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Opening / gift entry adds to asset history without debiting any account.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="shrink-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount</p>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xl font-extrabold text-slate-900 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="0.00"
                value={form.amount}
                readOnly={ledgerConversionActive}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
              />
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {formatCurrency(Number(form.amount || 0))}
              </p>
              {ledgerConversionActive ? (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Ledger conversion keeps the original amount.
                </p>
              ) : null}
              <label className="mt-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Short Description
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="What was this for?"
                  value={form.note}
                  onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                />
              </label>
            </div>

            {(mode === 'income' || mode === 'expense') ? (
              <div className="shrink-0">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Category
                  </p>
                  <Link to="/categories/new" className="text-[11px] font-semibold text-primary">
                    Create
                  </Link>
                </div>
                {visibleCategories.length ? (
                  <div className="overflow-x-auto pr-1 pb-1 scroll-hidden touch-pan-x">
                    <div className="grid w-max grid-flow-col grid-rows-3 gap-2">
                      {visibleCategories.map((item) => {
                        const idValue = String(item.id);
                        const active = String(form.category_id) === idValue;
                        return (
                          <button
                            key={idValue}
                            type="button"
                            className={`w-[74px] rounded-xl border p-1.5 text-center transition-all duration-200 ${
                              active
                                ? 'border-primary bg-primary/12 text-primary shadow-card'
                                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                            }`}
                            onClick={() => {
                              hapticTap();
                              setForm((prev) => ({ ...prev, category_id: idValue }));
                            }}
                          >
                            <span
                              className="mx-auto mb-1 inline-flex h-7 w-7 items-center justify-center rounded-lg text-white"
                              style={{ backgroundColor: item.color || '#7c3aed' }}
                            >
                              <Icon name={categoryIconKey(item)} size={14} />
                            </span>
                            <p className="truncate text-[10px] font-semibold">{item.name}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-100 p-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    No categories in this type.
                  </p>
                )}
                {businessesEnabled ? (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Business
                      </p>
                      <Link to="/businesses" className="text-[11px] font-semibold text-primary">
                        Manage
                      </Link>
                    </div>
                    <BusinessStripSelector
                      businesses={businesses}
                      selected={form.business_id}
                      onSelect={(value) => setForm((prev) => ({ ...prev, business_id: value }))}
                      emptyLabel="No business"
                    />
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Optional. Tag this {mode} to the business it belongs to.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                No category required for {mode === 'people' ? 'people' : mode === 'asset' ? 'asset' : 'transfer'} mode.
              </div>
            )}

            {(mode === 'expense' || mode === 'transfer' || mode === 'people' || (mode === 'asset' && assetFlowIsAccountToAsset)) && (
              <div className="shrink-0">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {fromAccountTitle}
                  </p>
                  <Link to="/accounts" className="text-[11px] font-semibold text-primary">
                    Add Account
                  </Link>
                </div>
                {fromAccountOptions.length ? (
                  <div className="overflow-x-auto pr-1 pb-1 scroll-hidden touch-pan-x">
                    <div className="flex w-max gap-2">
                      {fromAccountOptions.map((item) => {
                        const idValue = String(item.value);
                        const active = String(form.from_account_id) === idValue;
                        return (
                          <button
                            key={idValue}
                            type="button"
                            className={`w-[90px] rounded-xl border p-1.5 text-center transition-all duration-200 ${
                              active
                                ? 'border-primary bg-primary/12 text-primary shadow-card'
                                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                            }`}
                            onClick={() => {
                              hapticTap();
                              setForm((prev) => ({ ...prev, from_account_id: idValue }));
                            }}
                          >
                            <span className="mx-auto mb-1 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                              <Icon name={accountTypeIcon(item.type)} size={14} />
                            </span>
                            <p className="truncate text-[10px] font-semibold">{item.label}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-100 p-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {mode === 'people' ? 'No eligible accounts for this action. Create required account type first.' : 'No accounts found.'}
                  </p>
                )}
              </div>
            )}

            {mode === 'asset' ? (
              <div className="shrink-0">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {assetFlowIsAssetToAccount ? 'From asset' : 'To asset'}
                  </p>
                  <Link to="/assets/types" className="text-[11px] font-semibold text-primary">
                    Manage
                  </Link>
                </div>
                {assetSelectorData.length ? (
                  <div className="overflow-x-auto pr-1 pb-1 scroll-hidden touch-pan-x">
                    <div className="flex w-max gap-2">
                      {assetSelectorData.map((item) => {
                        const idValue = String(item.value);
                        const selectedId = assetFlowIsAssetToAccount ? form.from_asset_type_id : form.to_asset_type_id;
                        const active = String(selectedId) === idValue;
                        return (
                          <button
                            key={idValue}
                            type="button"
                            className={`w-[106px] rounded-xl border p-1.5 text-center transition-all duration-200 ${
                              active
                                ? 'border-primary bg-primary/12 text-primary shadow-card'
                                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                            }`}
                            onClick={() => {
                              hapticTap();
                              if (assetFlowIsAssetToAccount) {
                                setForm((prev) => ({ ...prev, from_asset_type_id: idValue }));
                              } else {
                                setForm((prev) => ({ ...prev, to_asset_type_id: idValue }));
                              }
                            }}
                          >
                            <span className="mx-auto mb-1 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                              <Icon name={assetIconKey({ icon: item.icon, name: item.label })} size={14} />
                            </span>
                            <p className="truncate text-[10px] font-semibold">{item.label}</p>
                            <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{formatCurrency(item.current)}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-100 p-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    No asset types found. Create one in Assets / Investments.
                  </p>
                )}
              </div>
            ) : null}

            {(mode === 'income' || mode === 'transfer' || mode === 'people' || (mode === 'asset' && assetFlowIsAssetToAccount)) && (
              <div className="shrink-0">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {toAccountTitle}
                  </p>
                  <Link to="/accounts" className="text-[11px] font-semibold text-primary">
                    Add Account
                  </Link>
                </div>
                {toAccountOptions.length ? (
                  <div className="overflow-x-auto pr-1 pb-1 scroll-hidden touch-pan-x">
                    <div className="flex w-max gap-2">
                      {toAccountOptions.map((item) => {
                        const idValue = String(item.value);
                        const active = String(form.to_account_id) === idValue;
                        return (
                          <button
                            key={idValue}
                            type="button"
                            className={`w-[90px] rounded-xl border p-1.5 text-center transition-all duration-200 ${
                              active
                                ? 'border-primary bg-primary/12 text-primary shadow-card'
                                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                            }`}
                            onClick={() => {
                              hapticTap();
                              setForm((prev) => ({ ...prev, to_account_id: idValue }));
                            }}
                          >
                            <span className="mx-auto mb-1 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                              <Icon name={accountTypeIcon(item.type)} size={14} />
                            </span>
                            <p className="truncate text-[10px] font-semibold">{item.label}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-100 p-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {mode === 'people' ? 'No eligible accounts for this action. Create required account type first.' : 'No accounts found.'}
                  </p>
                )}
              </div>
            )}

            <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Additional details
              </p>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Date & Time
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    value={form.transaction_date}
                    onChange={(event) => setForm((prev) => ({ ...prev, transaction_date: event.target.value }))}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Location (optional)
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      placeholder="Location label or coordinates"
                      value={form.location}
                      onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      onClick={onUseCurrentLocation}
                      title="Use current location"
                    >
                      <Icon name="location" size={16} />
                    </button>
                  </div>
                </label>

                <div className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Attach Receipt</p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        onClick={onPickReceipt}
                        disabled={uploadingReceipt || ledgerConversionActive}
                      >
                        {uploadingReceipt ? 'Uploading...' : form.receipt_path ? 'Replace' : 'Attach'}
                      </button>
                      {form.receipt_path && !ledgerConversionActive ? (
                        <button
                          type="button"
                          className="rounded-lg bg-red-100 px-2 py-1 text-[11px] font-semibold text-danger dark:bg-red-900/30"
                          onClick={() => setForm((prev) => ({ ...prev, receipt_path: '', receipt_url: '' }))}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    className="hidden"
                    onChange={onReceiptSelected}
                  />
                  {form.receipt_path ? (
                    <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                      {isImageReceipt && form.receipt_url ? (
                        <img
                          src={form.receipt_url}
                          alt="Receipt preview"
                          className="h-24 w-full rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                          <Icon name={isPdfReceipt ? 'file' : 'note'} size={16} />
                          <span className="truncate">{form.receipt_path.split('/').pop()}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">No receipt attached.</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <button
            type="button"
            disabled={saving}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-white shadow-lg disabled:opacity-70"
            onClick={onSubmit}
          >
            {saving ? 'Finishing...' : 'Finish'}
          </button>
        </div>
      )}
    </AppShell>
  );
}


