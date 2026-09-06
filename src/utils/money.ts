/**
 * The Lite UI prints the same amount two ways: "$10.00" on checkout totals
 * and "$10" / "$1,000" on preset tiles and the thank-you page. Both helpers
 * take cents, matching every API payload (`amount: 1000`).
 */
export function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function usdWhole(cents: number): string {
  return Math.round(cents / 100).toLocaleString('en-US');
}
