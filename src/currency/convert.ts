/**
 * Reusable function to convert an amount to base currency.
 * exchangeRate = how many units of this currency per 1 base currency.
 * e.g. if base is USD and AED rate is 3.6725, then 100 AED = 100/3.6725 = 27.23 USD
 */
export function toBase(amount: number, exchangeRate: number): number {
  if (!exchangeRate || exchangeRate === 0 || exchangeRate === 1) return amount;
  return Math.round((amount / exchangeRate) * 100) / 100;
}

/**
 * Helper to create the transactions_data fields for base currency.
 */
export function baseFields(
  debit: number,
  credit: number,
  currency: string,
  exchangeRate: number,
) {
  return {
    debit,
    credit,
    base_currency_debit: toBase(debit, exchangeRate),
    base_currency_credit: toBase(credit, exchangeRate),
    currency,
    exchange_rate: exchangeRate,
  };
}
