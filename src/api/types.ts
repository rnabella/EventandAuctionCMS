// Response models for the endpoints the fundraising suite uses. Shapes were
// captured from the live Integration environment on 2026-09-06. Money is cents.

/** GET ems/checkin/v1/events/:eventId/reports/totals (enveloped) */
export interface Totals {
  totalRaised: number;
  charityProfit: number;
  silentAuction: { totalItems: number; itemsSold: number; raised: number; charityProfit: number };
  liveAuction: { totalItems: number; itemsSold: number; raised: number; charityProfit: number };
  buyItNow: { totalItems: number; itemsSold: number; raised: number; charityProfit: number };
  donation: { totalDonation: number; raised: number; totalDotation: number };
  raffles: {
    totalItems: number;
    raffleEntries: number;
    jackpotEntries: number;
    prizeEntries: number;
    totalRaised: number;
    prizePot: number;
  };
}

/** GET .../reports/donation?status=ACTIVE (enveloped; one row per donation, `totalCount` is always 0) */
export interface DonationReportRow {
  id: string; // the pledge item's title, e.g. "Donations"
  name: string; // donor full name
  qty: number;
  totalValue: number;
  fundId: string | null;
  fundTitle: string | null;
}

/** POST .../guests/:guestId/donations (BARE payload, HTTP 200 even when rejected) */
export interface CheckinDonationResult {
  id: string; // donation id — pass to cancelDonation
  pledgeId: string;
  code: 'accepted' | 'invalid_amount' | string;
  message: string;
  amount: number;
  total: number; // guest's running donation total after this call
}

/** POST .../guests/:guestId/donations/cancel (enveloped; entity is the retracted donation) */
export interface CancelledDonation {
  id: string;
  guestId: string;
  guestName: string;
  eventId: string;
  amount: number;
  amountPaid: number;
  anonymous: boolean;
}

/** GET .../guests/:guestId/payments/transactions (BARE array) */
export interface PaymentTransaction {
  id: string;
  itemDisplayNumber: string;
  description: string;
  recordType: 'donation' | string;
  guestId: string;
  guestName: string;
  amountDue: number;
  amountPaid: number;
  paymentStatus: 'paid' | string;
  paymentStatusReason: string;
  sourceApp: string;
  itemId: string;
  itemPurchaseId: string;
  itemCount: number;
  itemUnitPrice: number;
  itemTotalAmount: number;
}

export interface PaymentRecord {
  id: string;
  transactionId: string; // Stripe charge id, e.g. "ch_..."
  status: 'paid' | string;
  processor: 'stripe' | string;
  amount: number;
  totalPremiumAmount: number;
  currency: string;
  cardLast4: string;
  cardBrand: string;
  created: string;
  paymentTransactions: PaymentTransaction[];
}

/** GET .../guests/:guestId/payments/checkout (BARE object) — what the guest still owes */
export interface GuestCheckout {
  donations: Array<{ itemId: string; purchaseId: string; title: string; totalAmount: number }>;
  bids: unknown[];
  ticketPurchases: CheckoutTicketPurchase[];
  totalAmount: number;
  totalPremiumAmount: number;
  subTotal: number;
  grandTotal: number;
  currency: string;
}

/** GET lite/v1/events/:eventId (enveloped) — public event configuration */
export interface LiteEvent {
  id: string;
  name: string;
  currency: string;
  currencyCode: string;
  paymentEnabled: boolean;
  paymentProcessor: string;
  pledgeEnabled: boolean;
  pledgeOnLite: boolean;
  preAuthorizeEnabled: boolean;
}

/** GET lite/v1/events/:eventId/pledges/campaignItem (enveloped) — the donation item */
export interface PledgeAmount {
  id: string;
  amount: number;
  description: string;
  allowRecurring: boolean;
  hidden: boolean;
  status: 'active' | string;
}

export interface PledgeItem {
  id: string;
  title: string;
  status: 'active' | string;
  amounts: PledgeAmount[];
  minimum: number;
  minimumOnly: boolean;
  target: number;
  total: number;
}

/** GET lite/v1/events/:eventId/tickets?showHidden=false (enveloped array) */
export interface LiteTicket {
  id: string;
  title: string;
  type: 'individual' | string;
  price: number; // cents
  fee: number;
  numberAvailable: number; // 0 = sold out on the public site
  maxPerOrder: number;
  startTime: string;
  endTime: string; // ISO; sales stop after this
  seatCount: number;
  status: 'active' | string;
  hidden: boolean;
  itemQuestions: unknown[];
}

/** GET/POST ems/v1/iBid/events/:eventId/tickets/:ticketId (enveloped) — the CMS's own ticket record */
export interface IBidTicket {
  id: string;
  eventId: string;
  title: string;
  status: 'active' | string;
  startTime: string;
  endTime: string;
  sortNumber: number;
  externalId: string;
  hidden: boolean;
  price: number;
  numberAvailable: number;
  maxPerOrder: number;
  fee: number;
  ticketType: string;
  seatCount: number;
  itemQuestions: unknown[];
  estimate: number;
  promotionCodeIds: string[];
  enableGuestDetailCutOffTime: boolean;
  guestDetailCutOffTime: string;
  guestDetailCutOffCopy: string;
  created?: string;
  updated?: string;
}

/** POST checkin/v1/events/:eventId/guests/:guestId/ticketPurchases (BARE ARRAY; HTTP 200 even when `code` is "soldOut") */
export interface CheckinTicketPurchaseResult {
  id: string; // purchase id — pass to cancelTicketPurchase
  ticketId: string;
  code: 'accepted' | 'soldOut' | string;
  message: string;
  amount: number;
  count: number;
  available: number;
  bought: number;
}

/** One line of GuestCheckout.ticketPurchases */
export interface CheckoutTicketPurchase {
  itemId: string; // ticket id
  purchaseId: string;
  title: string;
  itemNumber: string;
  itemAmount: number;
  itemCount: number;
  totalAmount: number;
  baseTotal: number;
  subTotal: number;
}
