function sanitizeCell(value) {
  const text = String(value ?? '');
  if (text !== '' && ['=', '+', '-', '@'].includes(text[0])) {
    return `'${text}`;
  }
  return text;
}

export function exportTransactionsToCsv(transactions, filename = `transactions-${Date.now()}.csv`) {
  const header = [
    'ID',
    'Date',
    'Type',
    'Amount',
    'From Account',
    'To Account',
    'From Asset',
    'To Asset',
    'Category',
    'Note',
    'Location',
    'Receipt'
  ];

  const rows = (transactions || []).map((txn) => [
    sanitizeCell(txn.id),
    sanitizeCell(txn.transaction_date),
    sanitizeCell(txn.type),
    sanitizeCell(txn.amount),
    sanitizeCell(txn.from_account_name),
    sanitizeCell(txn.to_account_name),
    sanitizeCell(txn.from_asset_type_name),
    sanitizeCell(txn.to_asset_type_name),
    sanitizeCell(txn.category_name),
    sanitizeCell(txn.note),
    sanitizeCell(txn.location),
    sanitizeCell(txn.receipt_path)
  ]);

  const all = [header, ...rows]
    .map((row) => row.map((col) => `"${String(col ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([all], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
