import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon from '../../components/Icon';
import ReportExportSheet from '../../components/ReportExportSheet';
import { useToast } from '../../app/ToastContext';
import {
  createLedgerEntry,
  deleteLedgerEntry,
  fetchLedgerContactReport,
  fetchLedgerContactView,
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
  blankEntryForm,
  directionActionLabel,
  directionLabel,
  partyTypeLabel,
  partyTypeOptions
} from './ledgerHelpers';

function buildEntryForm(entry, direction = 'receivable', contactId = '') {
  const attachment = attachmentMeta(entry?.attachment_path);
  return {
    id: entry?.id || null,
    contact_id: contactId ? String(contactId) : entry?.contact_id ? String(entry.contact_id) : '',
    direction: entry?.direction || direction,
    amount: entry?.amount ? String(entry.amount) : '',
    note: entry?.note || '',
    attachment_path: attachment.path,
    attachment_url: attachment.url
  };
}

export default function LedgerContactPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const contactId = Number(id || 0);
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    party_type: 'customer',
    phone: '',
    email: '',
    notes: ''
  });
  const [entryForm, setEntryForm] = useState(() => blankEntryForm());
  const [savingContact, setSavingContact] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const load = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const response = await fetchLedgerContactView(contactId);
      setData(response || null);
      const contact = response?.contact || {};
      setContactForm({
        name: contact.name || '',
        party_type: contact.party_type || 'customer',
        phone: contact.phone || '',
        email: contact.email || '',
        notes: contact.notes || ''
      });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [contactId, pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  const contact = data?.contact || null;
  const summary = data?.summary || {};
  const openEntries = data?.open_entries || [];
  const history = data?.history || [];
  const receivableHistory = useMemo(() => history.filter((item) => item.direction === 'receivable'), [history]);
  const payableHistory = useMemo(() => history.filter((item) => item.direction === 'payable'), [history]);
  const defaultExportRange = useMemo(
    () => reportDateRangeFromInterval(createDefaultIntervalState()),
    []
  );

  const openEntrySheet = (direction = 'receivable', entry = null) => {
    setEntryForm(buildEntryForm(entry, direction, contactId));
    setEntryFormOpen(true);
  };

  const onSaveContact = async () => {
    if (!contactId || !contactForm.name.trim()) {
      pushToast({ type: 'warning', message: 'Contact name is required.' });
      return;
    }
    setSavingContact(true);
    try {
      await updateLedgerContact({
        id: contactId,
        name: contactForm.name.trim(),
        party_type: contactForm.party_type,
        phone: contactForm.phone || '',
        email: contactForm.email || '',
        notes: contactForm.notes || ''
      });
      setContactFormOpen(false);
      await load();
      pushToast({ type: 'success', message: 'Contact updated.' });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSavingContact(false);
    }
  };

  const onSaveEntry = async () => {
    if (!entryForm.amount || Number(entryForm.amount) <= 0) {
      pushToast({ type: 'warning', message: 'Enter a valid amount.' });
      return;
    }
    setSavingEntry(true);
    try {
      const payload = {
        id: entryForm.id || undefined,
        contact_id: contactId,
        direction: entryForm.direction,
        amount: Number(entryForm.amount),
        note: entryForm.note || '',
        attachment_path: entryForm.attachment_path || ''
      };
      if (entryForm.id) await updateLedgerEntry(payload);
      else await createLedgerEntry(payload);
      setEntryFormOpen(false);
      setEntryForm(blankEntryForm());
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
  const onGenerateReport = useCallback(
    async ({ format, fromDate, toDate }) => {
      try {
        const range = validateReportDateRange({ fromDate, toDate });
        const reportData = await fetchLedgerContactReport(contactId, {
          date_from: range.fromDate,
          date_to: range.toDate
        });
        const reportHistory = reportData?.history || [];
        const creditRows = reportHistory.filter((item) => item.direction === 'receivable');
        const debitRows = reportHistory.filter((item) => item.direction === 'payable');

        const definition = buildReportDefinition({
          title: `${reportData?.contact?.name || contact?.name || 'Ledger Contact'} Ledger Report`,
          subtitle: 'Open items and converted ledger history by contact',
          fileName: `${reportData?.contact?.name || contact?.name || 'ledger-contact'}-ledger-report`,
          dateRangeLabel: formatReportDateRange(range.fromDate, range.toDate),
          meta: [
            { label: 'Contact', value: reportData?.contact?.name || contact?.name || '-' },
            { label: 'Party Type', value: partyTypeLabel(reportData?.contact?.party_type || contact?.party_type) },
            { label: 'Phone', value: reportData?.contact?.phone || contact?.phone || '-' },
            { label: 'Email', value: reportData?.contact?.email || contact?.email || '-' }
          ],
          summary: [
            { label: 'Open Receivable', value: formatCurrency(reportData?.summary?.open_receivable_total || 0) },
            { label: 'Open Payable', value: formatCurrency(reportData?.summary?.open_payable_total || 0) },
            { label: 'Settled In', value: formatCurrency(reportData?.summary?.settled_receivable_total || 0) },
            { label: 'Settled Out', value: formatCurrency(reportData?.summary?.settled_payable_total || 0) },
            { label: 'Open Items', value: String(reportData?.summary?.open_count || 0) },
            { label: 'Converted Items', value: String(reportData?.summary?.settled_count || 0) }
          ],
          tables: [
            {
              name: 'Open Items',
              columns: [
                { key: 'created_at', label: 'Created' },
                { key: 'direction', label: 'Direction' },
                { key: 'amount', label: 'Amount' },
                { key: 'note', label: 'Note' },
                { key: 'attachment_path', label: 'Attachment' }
              ],
              rows: (reportData?.open_entries || []).map((entry) => ({
                created_at: formatDateTime(entry.created_at),
                direction: directionLabel(entry.direction),
                amount: formatCurrency(entry.amount || 0),
                note: entry.note || '',
                attachment_path: entry.attachment_path ? entry.attachment_path.split('/').pop() : ''
              }))
            },
            {
              name: 'Credit History',
              columns: [
                { key: 'transaction_date', label: 'Date' },
                { key: 'category_name', label: 'Category' },
                { key: 'account_name', label: 'Account' },
                { key: 'amount', label: 'Amount' },
                { key: 'note', label: 'Note' },
                { key: 'transaction_id', label: 'Transaction ID' },
                { key: 'attachment_path', label: 'Attachment' }
              ],
              rows: creditRows.map((item) => ({
                transaction_date: formatDateTime(item.transaction_date || item.converted_at),
                category_name: item.category_name || 'Converted Income',
                account_name: item.account_name || '-',
                amount: formatCurrency(item.amount || 0),
                note: item.note || '',
                transaction_id: item.transaction_id ? String(item.transaction_id) : '',
                attachment_path: item.attachment_path ? item.attachment_path.split('/').pop() : ''
              }))
            },
            {
              name: 'Debit History',
              columns: [
                { key: 'transaction_date', label: 'Date' },
                { key: 'category_name', label: 'Category' },
                { key: 'account_name', label: 'Account' },
                { key: 'amount', label: 'Amount' },
                { key: 'note', label: 'Note' },
                { key: 'transaction_id', label: 'Transaction ID' },
                { key: 'attachment_path', label: 'Attachment' }
              ],
              rows: debitRows.map((item) => ({
                transaction_date: formatDateTime(item.transaction_date || item.converted_at),
                category_name: item.category_name || 'Converted Expense',
                account_name: item.account_name || '-',
                amount: formatCurrency(item.amount || 0),
                note: item.note || '',
                transaction_id: item.transaction_id ? String(item.transaction_id) : '',
                attachment_path: item.attachment_path ? item.attachment_path.split('/').pop() : ''
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
    [contact?.email, contact?.name, contact?.party_type, contact?.phone, contactId, pushToast]
  );

  return (
    <AppShell
      title={contact?.name || 'Ledger Contact'}
      subtitle={partyTypeLabel(contact?.party_type)}
      onRefresh={load}
      showFab={false}
      onExport={() => setExportOpen(true)}
      contentClassName="gap-3 pb-3"
    >
      <section className="grid grid-cols-2 gap-3">
        <div className="card-surface rounded-xl p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Open Receivable</p>
          <p className="mt-1 text-lg font-extrabold text-emerald-600">{formatCurrency(summary.open_receivable_total || 0)}</p>
        </div>
        <div className="card-surface rounded-xl p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Open Payable</p>
          <p className="mt-1 text-lg font-extrabold text-rose-600">{formatCurrency(summary.open_payable_total || 0)}</p>
        </div>
        <div className="card-surface col-span-2 rounded-xl p-3 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p>{summary.open_count || 0} open items</p>
              <p className="mt-1">{summary.settled_count || 0} converted items</p>
            </div>
            <div className="text-right">
              <p className="text-emerald-600">Settled in: {formatCurrency(summary.settled_receivable_total || 0)}</p>
              <p className="mt-1 text-rose-600">Settled out: {formatCurrency(summary.settled_payable_total || 0)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <button type="button" className="rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-white" onClick={() => openEntrySheet('receivable')}>Add Receivable</button>
        <button type="button" className="rounded-xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white dark:bg-slate-700" onClick={() => openEntrySheet('payable')}>Add Payable</button>
        <button type="button" className="rounded-xl bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => setContactFormOpen(true)}>Edit Contact</button>
      </section>

      <section className="card-surface rounded-xl p-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Contact Info</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
            <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Phone</p>
            <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{contact?.phone || '-'}</p>
          </div>
          <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
            <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Email</p>
            <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{contact?.email || '-'}</p>
          </div>
          <div className="col-span-2 rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
            <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Notes</p>
            <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">{contact?.notes || '-'}</p>
          </div>
        </div>
      </section>

      <section className="card-surface rounded-xl p-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Open Items</h3>
        <div className="mt-3 space-y-3">
          {loading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />) : openEntries.length ? openEntries.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-slate-200 p-3.5 shadow-sm dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{directionLabel(entry.direction)}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(entry.created_at)}</p>
                </div>
                <p className={`text-base font-extrabold ${entry.direction === 'payable' ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(entry.amount)}</p>
              </div>
              {entry.note ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{entry.note}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white" onClick={() => onConvert(entry)}>Convert</button>
                <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => openEntrySheet(entry.direction, entry)}>Edit</button>
                <button type="button" className="rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-danger dark:bg-red-900/30" onClick={() => setDeleteTarget(entry)}>Remove</button>
              </div>
            </article>
          )) : <EmptyState title="No open items" subtitle="This contact has no pending receivables or payables right now." />}
        </div>
      </section>

      <section className="card-surface rounded-xl p-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Credit History</h3>
        <div className="mt-3 space-y-3">
          {loading ? <div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /> : receivableHistory.length ? receivableHistory.map((item) => (
            <article key={item.ledger_entry_id} className="rounded-2xl border border-slate-200 p-3.5 shadow-sm dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.category_name || 'Converted Income'}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(item.transaction_date || item.converted_at)}</p>
                </div>
                <p className="text-base font-extrabold text-emerald-600">{formatCurrency(item.amount)}</p>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.note || '-'}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">{item.account_name || 'No account'}</span>
                {item.transaction_id ? <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => navigate(`/transactions/${item.transaction_id}`)}>Open Transaction</button> : null}
              </div>
            </article>
          )) : <EmptyState title="No credit history yet" subtitle="Converted income for this contact will appear here." />}
        </div>
      </section>

      <section className="card-surface rounded-xl p-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Debit History</h3>
        <div className="mt-3 space-y-3">
          {loading ? <div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /> : payableHistory.length ? payableHistory.map((item) => (
            <article key={item.ledger_entry_id} className="rounded-2xl border border-slate-200 p-3.5 shadow-sm dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.category_name || 'Converted Expense'}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(item.transaction_date || item.converted_at)}</p>
                </div>
                <p className="text-base font-extrabold text-rose-600">{formatCurrency(item.amount)}</p>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.note || '-'}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">{item.account_name || 'No account'}</span>
                {item.transaction_id ? <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => navigate(`/transactions/${item.transaction_id}`)}>Open Transaction</button> : null}
              </div>
            </article>
          )) : <EmptyState title="No debit history yet" subtitle="Converted expenses for this contact will appear here." />}
        </div>
      </section>

      <BottomSheet open={contactFormOpen} onClose={() => setContactFormOpen(false)} title="Edit Contact">
        <div className="space-y-3">
          <input type="text" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Name" value={contactForm.name} onChange={(event) => setContactForm((prev) => ({ ...prev, name: event.target.value }))} />
          <HorizontalSelector items={partyTypeOptions} selected={contactForm.party_type} onSelect={(value) => setContactForm((prev) => ({ ...prev, party_type: value }))} wrap />
          <input type="text" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Phone" value={contactForm.phone} onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.target.value }))} />
          <input type="email" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Email" value={contactForm.email} onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))} />
          <textarea rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="Notes" value={contactForm.notes} onChange={(event) => setContactForm((prev) => ({ ...prev, notes: event.target.value }))} />
          <button type="button" disabled={savingContact} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-70" onClick={onSaveContact}>{savingContact ? 'Saving...' : 'Update Contact'}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={entryFormOpen} onClose={() => setEntryFormOpen(false)} title={entryForm.id ? `Edit ${directionLabel(entryForm.direction)}` : directionActionLabel(entryForm.direction)}>
        <div className="space-y-3">
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
          <p className="text-sm text-slate-600 dark:text-slate-300">This removes the pending entry from the ledger. Past converted history stays intact.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button type="button" disabled={deleting} className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-70" onClick={onDeleteEntry}>{deleting ? 'Removing...' : 'Remove'}</button>
          </div>
        </div>
      </BottomSheet>

      <ReportExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={`${contact?.name || 'Ledger Contact'} Ledger Report`}
        subtitle="Generate a PDF, Excel, or CSV contact-wise ledger report"
        defaultRange={defaultExportRange}
        onGenerate={onGenerateReport}
      />
    </AppShell>
  );
}
