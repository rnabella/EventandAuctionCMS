/**
 * The Lite UI prints the same amount two ways: "10.00" (with two decimals) on
 * checkout totals and "10" / "1,000" (whole dollars) on preset tiles and the
 * thank-you page. Both helpers take cents, matching every API payload
 * (`amount: 1000`), and return the numeric part without a currency symbol —
 * callers prepend "$" themselves.
 *
 * - `usd(cents)` returns the amount with two decimal places (e.g., "10.00")
 * - `usdWhole(cents)` returns the amount rounded to whole dollars (e.g., "10", "1,000")
 */
export function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function usdWhole(cents: number): string {
  return Math.round(cents / 100).toLocaleString('en-US');
}
