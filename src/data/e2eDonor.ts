export interface E2EDonor {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
}

// NANP reserves the "555" exchange (xxx-555-xxxx) as fictional/never-dialable
// in any of these area codes — unlike a random 7-digit local number, which can
// land on a real, dialable subscriber (outbound SMS sandboxing on the test
// environment is unconfirmed, so that risk is worth avoiding rather than
// accepting). Spreading the same 555 exchange across 10 area codes multiplies
// the collision space instead of widening it into real-number territory.
const AREA_CODES = ['201', '212', '213', '312', '415', '512', '617', '702', '801', '917'];

/**
 * A fresh donor identity per run. The Lite UI checks BOTH email and mobile for
 * existing registrations, so both are derived from the seed. Emails stay on the
 * givergy.com domain (the WAF drops example.com); mobiles stay in the `555`
 * exchange (see AREA_CODES above) spread across 10 area codes, giving ~100,000
 * distinct `xxx-555-xxxx` numbers (10 area codes x 10,000 four-digit endings)
 * instead of the 10,000 a single area code offered — collisions still grow
 * with run count, they just take ~10x longer to matter. A collision (the
 * mobile already registered) fails legibly via `LiteRegisterPage.submit()`,
 * which throws with the Lite API's own rejection code/message. No real inbox
 * or phone is ever involved.
 */
export function newE2EDonor(seed: number = Date.now()): E2EDonor {
  const areaCode = AREA_CODES[seed % AREA_CODES.length];
  const line = String(Math.floor(seed / AREA_CODES.length) % 10_000).padStart(4, '0');
  return {
    firstName: 'QA',
    lastName: `E2E Donor ${seed % 1_000_000}`,
    email: `qa.e2e.donor+${seed}@givergy.com`,
    mobile: `${areaCode}555${line}`,
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
