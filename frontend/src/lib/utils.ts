export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

const moneyFormatter = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
})

export function formatMoney(value: string | number | null | undefined): string {
  const num = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (Number.isNaN(num)) return '$0.00'
  return moneyFormatter.format(num)
}

export function parseMoneyInput(value: string): string {
  const cleaned = value.replace(/[^0-9.,]/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return Number.isNaN(num) ? '0' : num.toFixed(2)
}
