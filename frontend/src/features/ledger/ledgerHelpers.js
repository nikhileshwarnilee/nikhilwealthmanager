import { buildBackendFileUrl } from '../../utils/uploads';

export const ledgerFocusOptions = [
  { value: 'all', label: 'All' },
  { value: 'receivable', label: 'Receivable' },
  { value: 'payable', label: 'Payable' }
];

export const partyTypeOptions = [
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'both', label: 'Both' }
];

export function blankContactForm(partyType = 'customer') {
  return {
    id: null,
    name: '',
    party_type: partyType,
    phone: '',
    email: '',
    notes: ''
  };
}

export function blankEntryForm(direction = 'receivable', contactId = '') {
  return {
    id: null,
    contact_id: contactId ? String(contactId) : '',
    direction,
    amount: '',
    note: '',
    attachment_path: '',
    attachment_url: ''
  };
}

export function directionLabel(direction) {
  return direction === 'payable' ? 'Payable' : 'Receivable';
}

export function directionShortLabel(direction) {
  return direction === 'payable' ? 'You Pay' : 'You Get';
}

export function directionActionLabel(direction) {
  return direction === 'payable' ? 'Add Payable' : 'Add Receivable';
}

export function directionDescription(direction) {
  return direction === 'payable'
    ? 'Money you still need to pay out.'
    : 'Money you are still expected to receive.';
}

export function partyTypeLabel(type) {
  if (type === 'supplier') return 'Supplier';
  if (type === 'both') return 'Customer + Supplier';
  return 'Customer';
}

export function contactMatchesDirection(contact, direction) {
  const partyType = String(contact?.party_type || 'customer');
  if (partyType === 'both') return true;
  if (direction === 'payable') return partyType === 'supplier';
  return partyType === 'customer';
}

export function attachmentMeta(path) {
  const cleanPath = String(path || '').trim();
  const ext = cleanPath.split('.').pop()?.toLowerCase() || '';
  return {
    path: cleanPath,
    url: cleanPath ? buildBackendFileUrl(cleanPath) : '',
    isImage: ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext),
    isPdf: ext === 'pdf'
  };
}
