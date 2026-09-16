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
  /** Verified live 2026-09-07: an active, unpaid bid never appears here (silent-auction bids don't charge until the auction closes) — always empty in this suite. Verify bids via EmsApi.reports.bids / LiteApi.lots instead. */
  bids: unknown[];
  ticketPurchases: CheckoutTicketPurchase[];
  buyNowPurchases: CheckoutBuyNowPurchase[];
  gliRaffles: CheckoutGliRafflePurchase[];
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

/** Payload for POST …/tickets/:id — the server owns `created`/`updated`, and `ticketType` is immutable once the ticket has purchases. */
export type IBidTicketUpdate = Omit<IBidTicket, 'created' | 'updated' | 'ticketType'>;

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

/** GET/POST ems/v1/iBid/events/:eventId/lots/:lotId (enveloped) — the CMS's own lot record. */
export interface IBidLot {
  id: string;
  eventId: string;
  displayNumber: string;
  title: string;
  status: 'active' | string;
  pdaDescription: string;
  webDescription: string;
  pictures: unknown[];
  startTime: string;
  endTime: string;
  created?: string;
  updated?: string;
  sortNumber: number;
  externalId: string;
  donatedItemId: string | null;
  linkedGuestId: string | null;
  hidden: boolean;
  shortId: string;
  portal: boolean;
  strapline: string;
  termsDescription: string;
  paymentDescription: string;
  voucherInfo: string;
  donatedBy: string;
  categories: unknown[];
  silent: boolean;
  buyNowPrice: number; // cents
  marginCap: number;
  bidMode: 'silent' | 'hybrid' | 'buy_now' | 'sealed' | string;
  numberAvailable: number;
  startPrice: number; // cents
  minStartPrice: number; // cents — the enforced minimum for a lot's first bid
  increments: Array<{ threshold: number; amount: number }>; // cents; the minimum jump required over the current top bid
  reserve: number;
  estimate: number;
  displayEstimate: boolean;
  autoSell: boolean;
  featured: boolean;
  allowPayment: boolean;
  featuredPictures: unknown[];
  requirePayment: boolean;
  sealedMultiBidding: boolean; // unrelated to sealed-bid visibility — do not use this to control sealed behaviour
  enableGiftAid: boolean;
  suppliedItemId: string | null;
  supplierCost: number;
  givergySupplyPrice: number;
  clientCost: number;
  deliveryAmount: number;
  deliveryOptions: string[];
  qrPicture: string | null;
  video: string;
  passwordProtect: boolean;
  password: string;
  taxRate: number;
  fmvLocked: boolean;
  revenueStreamType: string;
  cost: number;
  closed: boolean;
}

/**
 * Payload for POST …/lots/:id — the server owns `created`/`updated`, and
 * `startPrice` is immutable once the lot has any bids (a completed buy-now
 * purchase counts as one): resending it, even unchanged, is rejected with
 * `409 conflict "please do not change the starting price if there are any
 * bids on this lot."` (verified live 2026-09-07 — same shape of rule as
 * `IBidTicketUpdate`'s `ticketType` exclusion below).
 */
export type IBidLotUpdate = Omit<IBidLot, 'created' | 'updated' | 'startPrice'>;

/** GET lite/v1/events/:eventId/lots (enveloped array) — the public lot listing. */
export interface LiteLot {
  id: string;
  displayNumber: string;
  title: string;
  pictures: unknown[];
  pictureInfos: unknown[];
  categories: unknown[];
  buyNowPrice: number;
  bidMode: 'silent' | 'hybrid' | 'buy_now' | 'sealed' | string;
  numberAvailable: number;
  startPrice: number;
  reserve: number;
  /** On a sealed lot with any bid present, echoes bidCount (e.g. 1) instead of the real amount — not masked to 0. */
  topBidAmount: number;
  /** On a sealed lot with any bid present, e.g. "1 Bid Received" — not "No Bids Yet". */
  topBidAmountFormatted: string;
  /** "Sealed Bid Item" on a sealed lot even with real bids present; "No Bids" when genuinely empty. */
  topBidName: string;
  /** The top bidder's *guest* id, not a bid id — do not pass this to `EmsApi.checkin.cancelBid`'s bidId argument (verified live 2026-09-07, Task 6). */
  topBidId: string;
  anonymous: boolean;
  /** NOT masked on a sealed lot — shows the real count; only topBidName/topBidAmount(Formatted) mask. */
  bidCount: number;
  silent: boolean;
  boughtTotal: number;
  passwordProtect: boolean;
  status: 'active' | string;
  hidden: boolean;
}

/** POST checkin/v1/events/:eventId/guests/:guestId/bids (BARE payload, HTTP 200 even when rejected) */
export interface CheckinBidResult {
  id: string; // bid id — pass to cancelBid
  lotId: string;
  code: 'accepted' | 'below_minimum' | 'below_increase' | string;
  message: string;
  amount: number;
  maxAmount: number;
  topAmount: number; // masked to 0 on a sealed lot
  topBid: string;
  topBidder: string | null;
}

/** POST .../bids/cancel (enveloped; entity is null when the bid id was already gone — this endpoint is idempotent, unlike ticketPurchases/cancel). */
export interface CancelledBid {
  id: string;
  guestId: string;
  guestName: string;
  anonymous: boolean;
}

/** POST checkin/v1/events/:eventId/guests/:guestId/buyNowPurchases (BARE OBJECT — not an array, unlike ticketPurchases) */
export interface CheckinBuyNowResult {
  id: string; // purchase id — pass to cancelBuyNowPurchase
  buyNowId: string;
  code: 'accepted' | 'invalid_bid_mode' | string;
  message: string;
  amount: number;
  count: number;
  available: number;
  bought: number;
}

/** POST .../buyNowPurchases/cancel (enveloped; entity is null when the purchase id was already gone — idempotent). */
export interface CancelledBuyNowPurchase {
  id: string;
  guestId: string;
  guestName: string;
  anonymous: boolean;
}

/** GET .../reports/bids (enveloped array) — one row per lot, regardless of bid mode. */
export interface BidsReportRow {
  id: string; // lot id
  number: string; // the lot's display number
  item: string; // lot title
  bids: number; // bid count
  totalValue: number; // cents
  shortId: string;
}

/** One line of GuestCheckout.buyNowPurchases (bids never appear in checkout — see EmsApi.checkin.bid's docblock) */
export interface CheckoutBuyNowPurchase {
  itemId: string; // lot id
  purchaseId: string;
  title: string;
  itemNumber: string;
  itemAmount: number;
  itemCount: number;
  totalAmount: number;
  baseTotal: number;
  subTotal: number;
}

/** GET/PATCH ems/v1/iBid/events/:eventId/gli-raffles/:raffleId (enveloped) — the CMS's own raffle record. PATCH is a partial update — see `EmsApi.gliRaffles.update`'s docblock. */
export interface IBidGliRaffle {
  id: string;
  eventId: string;
  displayNumber: string;
  title: string;
  status: 'active' | string;
  hidden: boolean;
  shortId: string;
  price: number; // cents, the per-individual-entry price
  numberAvailable: number;
  startTime: string;
  endTime: string;
  created?: string;
  updated?: string;
  raffleMode: 'regular_prize_draw' | string;
  minimumAge: number;
  countryRegion: string;
  jurisdiction?: string;
  licenceNumber: string;
  licensee: string;
  splitPercentage: number;
  currencyCode: string;
  started: boolean;
  suspended: boolean;
  bundles?: IBidGliRaffleBundle[];
  [key: string]: unknown; // the full record has ~50 more admin-only fields never touched by this suite
}

export type IBidGliRaffleUpdate = Pick<
  IBidGliRaffle,
  | 'id'
  | 'eventId'
  | 'displayNumber'
  | 'title'
  | 'status'
  | 'hidden'
  | 'shortId'
  | 'price'
  | 'numberAvailable'
  | 'startTime'
  | 'endTime'
  | 'raffleMode'
  | 'minimumAge'
  | 'countryRegion'
  | 'jurisdiction'
  | 'licenceNumber'
  | 'licensee'
  | 'splitPercentage'
  | 'currencyCode'
  | 'started'
  | 'suspended'
  | 'bundles'
>;

export interface IBidGliRaffleBundle {
  id: string;
  title: string; // e.g. "3 for $25"
  count: number; // entries per bundle
  price: number; // cents
  numberAvailable: number;
  status: 'active' | string;
}

/** GET lite/v1/events/:eventId/gli-raffles(/:id) (enveloped) — the public site's raffle detail. */
export interface LiteGliRaffle {
  cachedGliRaffle: {
    id: string;
    displayNumber: string;
    title: string;
    status: 'active' | string;
    hidden: boolean;
    price: number;
    minimumAge: number;
    startTime: string;
    endTime: string;
  };
  gliBundleList: Array<{ id: string; title: string; count: number; price: number; numberLeft: number; numberAvailable: number }>;
  totalRaisedAmount: number;
  prizeAmount: number;
  numberLeft: number; // remaining individual-entry stock
  bundleNumberLeft: number;
  totalNumberLeft: number; // numberLeft + bundleNumberLeft
}

/** GET checkin/v1/events/:eventId/items/gliRaffles (BARE array) — the per-raffle sold/raised oracle, same role as BidsReportRow for lots. */
export interface GliRaffleItemsReportRow {
  id: string;
  number: string;
  title: string;
  price: number;
  available: number;
  bought: number; // NEVER reverses on cancel (same quirk as tickets' itemsSold) — delta-assert, don't compare to an absolute value across a cancel
  bundles: Array<{ id: string; title: string; price: number; available: number; bought: number; count: number }>;
  minAge: number;
  jurisdiction: string;
  prizePot: number; // DOES reverse on cancel
  totalRaised: number; // DOES reverse on cancel
}

/** One line of GuestCheckout.gliRaffles */
export interface CheckoutGliRafflePurchase {
  itemId: string; // raffle id
  purchaseId: string;
  title: string;
  itemNumber: string;
  itemAmount: number;
  itemCount: number;
  totalAmount: number;
  baseTotal: number;
  subTotal: number;
}

/**
 * GET v1/iBid/clients/stripe-subscriptions/ (BARE array, cross-event admin search) — same shape as
 * the `entity` returned by POST .../guests/:guestId/subscription (creation). Verified live 2026-09-12.
 */
export interface StripeSubscription {
  id: string; // internal record id — use THIS for cancel, not subscriptionId
  eventId: string;
  eventName: string;
  amount: number; // cents, per-charge amount
  l1AccountId: string;
  accountName: string;
  guestId: string;
  guestName: string;
  customerId: string; // Stripe customer id
  productId: string;
  productName: string | null;
  productDescription: string | null;
  priceId: string;
  currency: string;
  recurringInterval: 'week' | 'month' | string;
  recurringIntervalCount: number; // e.g. 2 with interval "week" = bi-weekly
  subscriptionId: string; // the real Stripe subscription id, e.g. "sub_..."
  subscriptionStatus: 'active' | string;
  startDate: string;
  endDate: string;
  passOnPaymentFee: boolean;
  accountId: string; // Stripe Connect account id
  subscriptionType: 'recurring' | string;
  firstBillingDate: string;
  cancelAtDate: string;
  totalAmount: number; // lifetime amount actually charged so far — 0 until the first billing date passes
  totalAppFee: number;
  totalAmountPaidToClient: number;
  lastPaymentDate: string; // epoch (1970-01-01) until the first real charge happens
  created: string;
  updated: string;
}

/** POST .../gliRafflePurchases/cancel response */
export interface CancelledGliRafflePurchase {
  id: string;
  gliRaffleId: string;
  code: 'cancelled' | string;
  bundleId: string | null;
  amount: number;
  count: number;
}
