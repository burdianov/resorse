/**
 * A column's human name.
 *
 * Columns carry one in `meta.label` when their header is a component
 * (`DataTableColumnHeader` renders a button, not a string a menu or a CSV
 * header can print). The id is the fallback, so an unlabelled column is still
 * operable and still exportable.
 *
 * Its own module rather than a helper inside one consumer: the view options
 * (F021) and the CSV export (F022) must agree on the label, and importing one
 * from the other would tie two unrelated components together.
 */
export function columnLabel(column: { id: string; columnDef: { meta?: unknown } }): string {
  const meta = column.columnDef.meta
  if (typeof meta === 'object' && meta !== null && 'label' in meta) {
    const label = (meta as { label?: unknown }).label
    if (typeof label === 'string') return label
  }
  return column.id
}
