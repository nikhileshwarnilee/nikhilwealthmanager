import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon from '../../components/Icon';
import ReportExportSheet from '../../components/ReportExportSheet';
import { useToast } from '../../app/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useRouteState } from '../../hooks/useRouteState';
import {
  createLedgerContact,
  createLedgerEntry,
  deleteLedgerEntry,
  fetchLedgerOpenItemsReport,
  fetchLedgerOverview,
  updateLedgerContact,
  updateLedgerEntry
} from '../../services/ledgerService';
import { normalizeApiError } from '../../services/http';
import { uploadTransactionReceipt } from '../../services/transactionService';
import { formatCurrency, formatDateTime } from '../../utils/format';
import {
  buildReportDefinition,
  exportReportDefinition,
  formatReportDateRange,
  reportDateRangeFromInterval,
  validateReportDateRange
} from '../../utils/reportExport';
import { createDefaultIntervalState } from '../../utils/intervals';
import {
  attachmentMeta,
  blankContactForm,
  blankEntryForm,
  contactMatchesDirection,
  directionActionLabel,
  directionDescription,
  directionLabel,
  ledgerFocusOptions,
  partyTypeLabel,
  partyTypeOptions
} from './ledgerHelpers';

const ledgerTabOptions = [
  { value: 'open', label: 'Open Items' },
  { value: 'contacts', label: 'Contacts' }
];

function normalizeFocus(raw) {
  return raw === 'receivable' || raw === 'payable' ? raw : 'all';
}

function normalizeTab(raw) {
  return raw === 'contacts' ? 'contacts' : 'open';
}

function buildEntryForm(entry, direction = 'receivable', contactId = '') {
  const attachment = attachmentMeta(entry?.attachment_path);
  return {
    id: entry?.id || null,
    contact_id: entry?.contact_id ? String(entry.contact_id) : contactId ? String(contactId) : '',
    direction: entry?.direction || direction,
    amount: entry?.amount ? String(entry.amount) : '',
    note: entry?.note || '',
    attachment_path: attachment.path,
    attachment_url: attachment.url
  };
}

export default function LedgerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchOpen, setSearchOpen] = useRouteState('ledger-search-open', false);
  const [searchTerm, setSearchTerm] = useRouteState('ledger-search-term', '');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [selectorContacts, setSelectorContacts] = useState([]);
  const [selectorLoading, setSelectorLoading] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [contactForm, setContactForm] = useState(() => blankContactForm());
  const [entryForm, setEntryForm] = useState(() => blankEntryForm());
  const [entryContactSearch, setEntryContactSearch] = useState('');
  const [entryContactDropdownOpen, setEntryContactDropdownOpen] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const focus = normalizeFocus(searchParams.get('focus'));
  const activeTab = normalizeTab(searchParams.get('tab'));
  const effectiveFocus = activeTab === 'open' ? focus : 'all';
  const debouncedSearch = useDebounce(searchTerm, 250);
  const defaultExportRange = useMemo(
    () => reportDateRangeFromInterval(createDefaultIntervalState()),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchLedgerOverview({
        focus: effectiveFocus,
        search: debouncedSearch || undefined
      });
      setOverview(response || null);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, effectiveFocus, pushToast]);

  const loadSelectorContacts = useCallback(async () => {
    setSelectorLoading(true);
    try {
      const response = await fetchLedgerOverview({ focus: 'all' });
      setSelectorContacts(response.contacts || []);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSelectorLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (entryFormOpen && !selectorContacts.length) {
      loadSelectorContacts();
    }
  }, [entryFormOpen, loadSelectorContacts, selectorContacts.length]);

  useEffect(() => {
    if (!entryFormOpen) {
      setEntryContactDropdownOpen(false);
      setEntryContactSearch('');
    }
  }, [entryFormOpen]);

  const contacts = overview?.contacts || [];
  const openEntries = overview?.open_entries || [];
  const summary = overview?.summary || null;

  const selectedEntryContact = useMemo(
    () =>
      selectorContacts.find((contact) => String(contact.id) === String(entryForm.contact_id))
      || contacts.find((contact) => String(contact.id) === String(entryForm.contact_id))
      || null,
    [contacts, entryForm.contact_id, selectorContacts]
  );

  const filteredSelectorContacts = useMemo(() => {
    const query = entryContactSearch.trim().toLowerCase();
    return selectorContacts
      .filter((contact) => contactMatchesDirection(contact, entryForm.direction))
      .filter((contact) => {
        if (!query) return true;
        return [contact.name, contact.phone, contact.email, contact.notes]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      });
  }, [entryContactSearch, entryForm.direction, selectorContacts]);

  const setTab = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    const normalized = normalizeTab(nextTab);
    if (normalized === 'open') next.delete('tab');
    else next.set('tab', normalized);
    setSearchParams(next, { replace: true });
  };

  const setFocus = (nextFocus, nextTab = null) => {
    const next = new URLSearchParams(searchParams);
    const normalized = normalizeFocus(nextFocus);
    if (normalized === 'all') next.delete('focus');
    else next.set('focus', normalized);

    if (nextTab) {
      const normalizedTab = normalizeTab(nextTab);
      if (normalizedTab === 'open') next.delete('tab');
      else next.set('tab', normalizedTab);
    }

    setSearchParams(next, { replace: true });
  };

  const openContactSheet = (partyType = 'customer', contact = null) => {
    setContactForm(
      contact
        ? {
            id: contact.id,
            name: contact.name || '',
            party_type: contact.party_type || partyType,
            phone: contact.phone || '',
            email: contact.email || '',
            notes: contact.notes || ''
          }
        : blankContactForm(partyType)
    );
    setContactFormOpen(true);
  };

  const openEntrySheet = (direction = 'receivable', entry = null, contactId = '') => {
    setEntryContactSearch('');
    setEntryContactDropdownOpen(false);
    setEntryForm(buildEntryForm(entry, direction, contactId));
    setEntryFormOpen(true);
  };

  const closeEntrySheet = () => {
    setEntryFormOpen(false);
    setEntryForm(blankEntryForm());
    setEntryContactDropdownOpen(false);
    setEntryContactSearch('');
  };

  const onSaveContact = async () => {
    if (!contactForm.name.trim()) {
      pushToast({ type: 'warning', message: 'Contact name is required.' });
      return;
    }
    setSavingContact(true);
    try {
      const payload = {
        id: contactForm.id || undefined,
        name: contactForm.name.trim(),
        party_type: contactForm.party_type,
        phone: contactForm.phone || '',
        email: contactForm.email || '',
        notes: contactForm.notes || ''
      };
      if (contactForm.id) await updateLedgerContact(payload);
      else await createLedgerContact(payload);
      setContactFormOpen(false);
      setContactForm(blankContactForm());
      await Promise.all([load(), loadSelectorContacts()]);
      pushToast({ type: 'success', message: contactForm.id ? 'Contact updated.' : 'Contact created.' });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSavingContact(false);
    }
  };

  const onSaveEntry = async () => {
    if (!entryForm.contact_id) {
      pushToast({ type: 'warning', message: 'Choose a contact first.' });
      return;
    }
    if (!entryForm.amount || Number(entryForm.amount) <= 0) {
      pushToast({ type: 'warning', message: 'Enter a valid amount.' });
      return;
    }
    setSavingEntry(true);
    try {
      const payload = {
        id: entryForm.id || undefined,
        contact_id: Number(entryForm.contact_id),
        direction: entryForm.direction,
        amount: Number(entryForm.amount),
        note: entryForm.note || '',
        attachment_path: entryForm.attachment_path || ''
      };
      if (entryForm.id) await updateLedgerEntry(payload);
      else await createLedgerEntry(payload);
      closeEntrySheet();
      await load();
      pushToast({ type: 'success', message: `${directionLabel(entryForm.direction)} saved.` });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSavingEntry(false);
    }
  };

  const onUploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadingAttachment(true);
    try {
      const response = await uploadTransactionReceipt(file);
      const attachment = attachmentMeta(response.receipt_path || '');
      setEntryForm((prev) => ({
        ...prev,
        attachment_path: attachment.path,
        attachment_url: response.receipt_url || attachment.url
      }));
      pushToast({ type: 'success', message: 'Attachment uploaded.' });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const onDeleteEntry = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await deleteLedgerEntry(deleteTarget.id);
      setDeleteTarget(null);
      await load();
      pushToast({ type: 'success', message: 'Ledger item removed.' });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setDeleting(false);
    }
  };

  const onConvert = (entry) => {
    navigate(`/transactions/new?ledger_entry_id=${entry.id}`, {
      state: {
        ledgerEntry: entry,
        ledgerReturnTo: `${location.pathname}${location.search}`
      }
    });
  };

  const searchPlaceholder = activeTab === 'contacts' ? 'Search contacts' : 'Search contact or note';
  const contactPickerHint = entryForm.direction === 'payable'
    ? 'Search suppliers for this payable entry.'
    : 'Search customers for this receivable entry.';
  const openItemsReportTitle = focus === 'receivable'
    ? 'Open Receivables Report'
    : focus === 'payable'
      ? 'Open Payables Report'
      : 'Open Ledger Report';
  const onGenerateReport = useCallback(
    async ({ format, fromDate, toDate }) => {
      try {
        const range = validateReportDateRange({ fromDate, toDate });
        const response = await fetchLedgerOpenItemsReport({
          focus,
          date_from: range.fromDate,
          date_to: range.toDate
        });

        const query = debouncedSearch.trim().toLowerCase();
        const openItems = (response?.open_entries || []).filter((entry) => {
          if (!query) return true;
          return [entry.contact_name, entry.note]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));
        });

        const receivableTotal = openItems
          .filter((entry) => entry.direction === 'receivable')
          .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        const payableTotal = openItems
          .filter((entry) => entry.direction === 'payable')
          .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        const uniqueContacts = new Set(openItems.map((entry) => entry.contact_id)).size;

        const definition = buildReportDefinition({
          title: openItemsReportTitle,
          subtitle: 'Pending receivables and payables with contact details',
          fileName: openItemsReportTitle,
          dateRangeLabel: formatReportDateRange(range.fromDate, range.toDate),
          meta: [
            {
              label: 'Focus',
              value: focus === 'all' ? 'All open items' : directionLabel(focus)
            },
            { label: 'Search', value: debouncedSearch || 'None' }
          ],
          summary: [
            { label: 'Receivable', value: formatCurrency(receivableTotal) },
            { label: 'Payable', value: formatCurrency(payableTotal) },
            { label: 'Net Position', value: formatCurrency(receivableTotal - payableTotal) },
            { label: 'Contacts', value: String(uniqueContacts) },
            { label: 'Open Items', value: String(openItems.length) }
          ],
          tables: [
            {
              name: 'Open Items',
              columns: [
                { key: 'created_at', label: 'Created' },
                { key: 'contact_name', label: 'Contact' },
                { key: 'contact_party_type', label: 'Party Type' },
                { key: 'direction', label: 'Direction' },
                { key: 'amount', label: 'Amount' },
                { key: 'note', label: 'Note' },
                { key: 'attachment_path', label: 'Attachment' }
              ],
              rows: openItems.map((entry) => ({
                created_at: formatDateTime(entry.created_at),
                contact_name: entry.contact_name || '-',
                contact_party_type: partyTypeLabel(entry.contact_party_type),
                direction: directionLabel(entry.direction),
                amount: formatCurrency(entry.amount || 0),
                note: entry.note || '',
                attachment_path: entry.attachment_path ? entry.attachment_path.split('/').pop() : ''
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
    [debouncedSearch, focus, openItemsReportTitle, pushToast]
  );

  return (
    <AppShell
      title="Ledger"
      subtitle={activeTab === 'contacts' ? 'Customers and suppliers with detailed history' : 'Track receivables and payables'}
      onRefresh={load}
      showFab={false}
      onExport={activeTab === 'open' ? () => setExportOpen(true) : null}
      searchEnabled
      searchOpen={searchOpen}
      searchValue={searchTerm}
      onToggleSearch={() => setSearchOpen((prev) => !prev)}
      onSearchChange={setSearchTerm}
      searchPlaceholder={searchPlaceholder}
      contentClassName="gap-3 pb-3"
    >
      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className={`card-surface rounded-xl p-3 text-left transition ${
            activeTab === 'open' && focus === 'receivable' ? 'ring-2 ring-emerald-500/30' : ''
          }`}
          onClick={() => setFocus('receivable', 'open')}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">You'll Get</p>
          <p className="mt-1 text-lg font-extrabold text-emerald-600">{formatCurrency(summary?.receivable_total || 0)}</p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Open receivables</p>
        </button>
        <button
          type="button"
          className={`card-surface rounded-xl p-3 text-left transition ${
            activeTab === 'open' && focus === 'payable' ? 'ring-2 ring-rose-500/30' : ''
          }`}
          onClick={() => setFocus('payable', 'open')}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">You'll Pay</p>
          <p className="mt-1 text-lg font-extrabold text-rose-600">{formatCurrency(summary?.payable_total || 0)}</p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Open payables</p>
        </button>
        <button
          type="button"
          className={`card-surface col-span-2 rounded-xl p-3 text-left transition ${
            activeTab === 'open' && focus === 'all' ? 'ring-2 ring-primary/25' : ''
          }`}
          onClick={() => setFocus('all', 'open')}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Net Position</p>
              <p className="mt-1 text-base font-extrabold text-slate-900 dark:text-slate-100">{formatCurrency(summary?.net_total || 0)}</p>
            </div>
            <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
              <p>{summary?.open_entries_count || 0} open items</p>
              <p>{summary?.contacts_count || 0} contacts</p>
            </div>
          </div>
        </button>
      </section>

      <section className="card-surface rounded-xl p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Browse Ledger</h3>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Use one tab for pending items and one for contacts.</p>
          </div>
          <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
            <p>{summary?.open_entries_count || 0} pending</p>
            <p>{summary?.contacts_count || 0} saved</p>
          </div>
        </div>
        <div className="mt-3">
          <HorizontalSelector items={ledgerTabOptions} selected={activeTab} onSelect={setTab} />
        </div>
      </section>

      {activeTab === 'open' ? (
        <section className="grid grid-cols-2 gap-3">
          <button type="button" className="rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-white" onClick={() => openEntrySheet('receivable')}>Add Receivable</button>
          <button type="button" className="rounded-xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white dark:bg-slate-700" onClick={() => openEntrySheet('payable')}>Add Payable</button>
        </section>
      ) : null}

      {activeTab === 'contacts' ? (
        <section className="grid grid-cols-2 gap-3">
          <button type="button" className="rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-white" onClick={() => openContactSheet('customer')}>Add Customer</button>
          <button type="button" className="rounded-xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white dark:bg-slate-700" onClick={() => openContactSheet('supplier')}>Add Supplier</button>
        </section>
      ) : null}

      <section className={activeTab === 'open' ? 'card-surface rounded-xl p-3' : 'hidden'}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Open Items</h3>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {focus === 'all' ? 'Convert pending items into real income or expense later.' : directionDescription(focus)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {openEntries.length} shown
          </div>
        </div>
        <div className="mt-3">
          <HorizontalSelector items={ledgerFocusOptions} selected={focus} onSelect={(value) => setFocus(value, 'open')} />
        </div>
        <div className="mt-3 space-y-3">
          {loading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />) : openEntries.length ? openEntries.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-slate-200 p-3.5 shadow-sm dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.contact_name}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{directionLabel(entry.direction)} | {formatDateTime(entry.created_at)}</p>
                </div>
                <p className={`text-base font-extrabold ${entry.direction === 'payable' ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(entry.amount)}</p>
              </div>
              {entry.note ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{entry.note}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white" onClick={() => onConvert(entry)}>Convert</button>
                <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => openEntrySheet(entry.direction, entry)}>Edit</button>
                <button type="button" className="rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-danger dark:bg-red-900/30" onClick={() => setDeleteTarget(entry)}>Remove</button>
                <Link to={`/ledger/contacts/${entry.contact_id}`} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">View Contact</Link>
              </div>
            </article>
          )) : <EmptyState title="No open ledger items" subtitle={debouncedSearch ? 'Try a different search.' : 'Add a receivable or payable to start tracking.'} />}
        </div>
      </section>

      <section className={activeTab === 'contacts' ? 'card-surface rounded-xl p-3' : 'hidden'}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Contacts</h3>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Contacts stay visible even after balances are cleared.</p>
          </div>
          <div className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {contacts.length} shown
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {loading ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />) : contacts.length ? contacts.map((contact) => (
            <article key={contact.id} className="rounded-2xl border border-slate-200 p-3.5 shadow-sm dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{contact.name}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{partyTypeLabel(contact.party_type)} | {contact.open_entries_count || 0} open item(s)</p>
                </div>
                <div className="text-right text-[11px]">
                  <p className="font-semibold text-emerald-600">{formatCurrency(contact.open_receivable_total || 0)}</p>
                  <p className="mt-1 font-semibold text-rose-600">{formatCurrency(contact.open_payable_total || 0)}</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Last activity: {formatDateTime(contact.last_activity_at)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/ledger/contacts/${contact.id}`} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">View Details</Link>
                <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => openContactSheet(contact.party_type || 'customer', contact)}>Edit</button>
                <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => openEntrySheet('receivable', null, contact.id)}>Add Receivable</button>
                <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => openEntrySheet('payable', null, contact.id)}>Add Payable</button>
              </div>
            </article>
          )) : <EmptyState title="No contacts yet" subtitle={debouncedSearch ? 'Try a different search.' : 'Add customers and suppliers to build your ledger.'} />}
        </div>
      </section>

      <BottomSheet open={contactFormOpen} onClose={() => setContactFormOpen(false)} title={contactForm.id ? 'Edit Contact' : 'New Contact'}>
        <div className="space-y-3">
          <input type="text" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Name" value={contactForm.name} onChange={(event) => setContactForm((prev) => ({ ...prev, name: event.target.value }))} />
          <HorizontalSelector items={partyTypeOptions} selected={contactForm.party_type} onSelect={(value) => setContactForm((prev) => ({ ...prev, party_type: value }))} wrap />
          <input type="text" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Phone" value={contactForm.phone} onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.target.value }))} />
          <input type="email" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Email" value={contactForm.email} onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))} />
          <textarea rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Notes" value={contactForm.notes} onChange={(event) => setContactForm((prev) => ({ ...prev, notes: event.target.value }))} />
          <button type="button" disabled={savingContact} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-70" onClick={onSaveContact}>{savingContact ? 'Saving...' : contactForm.id ? 'Update Contact' : 'Create Contact'}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={entryFormOpen} onClose={closeEntrySheet} title={entryForm.id ? `Edit ${directionLabel(entryForm.direction)}` : directionActionLabel(entryForm.direction)}>
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Customer / Supplier</p>
              <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => { setEntryFormOpen(false); openContactSheet(entryForm.direction === 'payable' ? 'supplier' : 'customer'); }}>Create New</button>
            </div>
            <button
              type="button"
              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                entryContactDropdownOpen
                  ? 'border-primary bg-primary/5'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              }`}
              onClick={async () => {
                if (!selectorContacts.length && !selectorLoading) {
                  await loadSelectorContacts();
                }
                setEntryContactDropdownOpen((prev) => !prev);
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Selected Contact</p>
                  <p className={`mt-1 truncate text-sm font-semibold ${selectedEntryContact ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {selectedEntryContact?.name || (selectorLoading ? 'Loading contacts...' : 'Tap to search and select')}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedEntryContact ? partyTypeLabel(selectedEntryContact.party_type) : contactPickerHint}
                  </p>
                </div>
                <Icon name={entryContactDropdownOpen ? 'close' : 'search'} size={16} />
              </div>
            </button>
            {entryContactDropdownOpen ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <input type="text" autoFocus className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Search contact" value={entryContactSearch} onChange={(event) => setEntryContactSearch(event.target.value)} />
                <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
                  {selectorLoading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />) : filteredSelectorContacts.length ? filteredSelectorContacts.map((contact) => (
                    <button
                      type="button"
                      key={contact.id}
                      className={`w-full rounded-xl border px-3 py-3 text-left ${String(entryForm.contact_id) === String(contact.id) ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'}`}
                      onClick={() => {
                        setEntryForm((prev) => ({ ...prev, contact_id: String(contact.id) }));
                        setEntryContactSearch('');
                        setEntryContactDropdownOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{contact.name}</p>
                          <p className="mt-1 text-[11px]">{partyTypeLabel(contact.party_type)}</p>
                        </div>
                        <Icon name="people" size={16} />
                      </div>
                    </button>
                  )) : <p className="rounded-xl bg-slate-100 px-3 py-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">No matching contacts.</p>}
                </div>
              </div>
            ) : null}
          </div>
          <input type="number" min="0" step="0.01" inputMode="decimal" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-lg font-extrabold dark:border-slate-700 dark:bg-slate-900" placeholder="Amount" value={entryForm.amount} onChange={(event) => setEntryForm((prev) => ({ ...prev, amount: event.target.value }))} />
          <textarea rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Note" value={entryForm.note} onChange={(event) => setEntryForm((prev) => ({ ...prev, note: event.target.value }))} />
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Attachment</p>
              <label className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {uploadingAttachment ? 'Uploading...' : entryForm.attachment_path ? 'Replace' : 'Upload'}
                <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={uploadingAttachment} onChange={onUploadAttachment} />
              </label>
            </div>
            {entryForm.attachment_path ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800">
                <a href={entryForm.attachment_url || attachmentMeta(entryForm.attachment_path).url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 font-semibold text-primary">
                  <Icon name="file" size={14} />
                  <span className="truncate">{entryForm.attachment_path.split('/').pop()}</span>
                </a>
                <button type="button" className="rounded-md bg-red-100 px-2 py-1 font-semibold text-danger dark:bg-red-900/30" onClick={() => setEntryForm((prev) => ({ ...prev, attachment_path: '', attachment_url: '' }))}>Remove</button>
              </div>
            ) : <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">No attachment added.</p>}
          </div>
          <button type="button" disabled={savingEntry} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-70" onClick={onSaveEntry}>{savingEntry ? 'Saving...' : entryForm.id ? `Update ${directionLabel(entryForm.direction)}` : directionActionLabel(entryForm.direction)}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Remove Ledger Item">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">This removes the pending item from the ledger. Existing transactions stay untouched.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button type="button" disabled={deleting} className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-70" onClick={onDeleteEntry}>{deleting ? 'Removing...' : 'Remove'}</button>
          </div>
        </div>
      </BottomSheet>

      <ReportExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={openItemsReportTitle}
        subtitle="Generate a PDF, Excel, or CSV ledger open items report"
        defaultRange={defaultExportRange}
        onGenerate={onGenerateReport}
      />
    </AppShell>
  );
}
