export interface E2EDonor {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
}

/**
 * A fresh donor identity per run. The Lite UI checks BOTH email and mobile for
 * existing registrations, so both are derived from the seed. Emails stay on the
 * givergy.com domain (the WAF drops example.com), mobiles use the 201-555 range
 * (fictional in NANP), and no real inbox or phone is ever involved.
 */
export function newE2EDonor(seed: number = Date.now()): E2EDonor {
  return {
    firstName: 'QA',
    lastName: `E2E Donor ${seed % 100_000}`,
    email: `qa.e2e.donor+${seed}@givergy.com`,
    mobile: `201555${String(seed % 10_000).padStart(4, '0')}`,
    password: `Qa!e2e-${seed}`,
  };
}

/** Stripe's standard successful test card. The E2E event's Stripe account is in test mode (pk_test_…). */
export const STRIPE_TEST_CARD = {
  number: '4242424242424242',
  expiry: '12/34',
  cvc: '123',
  postalCode: '10001',
};
