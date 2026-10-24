import 'server-only'

function escapeCell(value: unknown) {
  const text = String(value ?? '')
  // Leading whitespace/control characters can hide a formula from spreadsheet importers.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [headers.map(escapeCell).join(','), ...rows.map(row => headers.map(header => escapeCell(row[header])).join(','))].join('\n')
}
