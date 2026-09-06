/**
 * CMS "Fundraising Website" sub-navigation routes, relative to an event's base
 * path (`events/:eventId/`). Discovered by clicking through the Checklist page's
 * "Website Details" section and the Fundraising Website sidebar on the Integration
 * environment (2026-07-26) — cms-next doesn't expose these as guessable slugs.
 */
export const FUNDRAISING_WEBSITE_ROUTES = {
  general: 'lite/general/',
  branding: 'lite/design/',
  content: 'lite/copy/',
  advancedContent: 'lite/advancedCopy/',
  sponsors: 'lite/sponsors/',
  navigationMenu: 'lite/menu/',
  eventPage: 'lite/eventPage/',
  totalizerSettings: 'lite/totaliserSettings/',
} as const;

/** CMS "Ticketing" sub-navigation routes, discovered the same way (2026-07-26). */
export const TICKETING_ROUTES = {
  settings: 'tickets/settings/',
  details: 'tickets/info/',
  tickets: 'tickets/',
  createTicket: 'tickets/create/',
  questions: 'tickets/questions/',
  promotionCodes: 'tickets/promotionCodes/',
} as const;

/** CMS "Auction Items" sub-navigation routes, discovered the same way (2026-07-27). */
export const AUCTION_ITEMS_ROUTES = {
  campaignItems: 'lots/eventLots/',
  createCampaignItem: 'lots/create/',
  givergyItems: 'lots/suppliedLots/',
  inventoryItems: 'itemInventory/',
  createInventoryItem: 'itemInventory/create/',
  donors: 'lots/donors/',
  createDonor: 'lots/donors/create/',
} as const;

/** CMS "Donations" sub-navigation routes, discovered the same way (2026-07-27). */
export const DONATIONS_ROUTES = {
  settings: 'pledges/settings/',
} as const;

/**
 * CMS "Payment Collection" sub-navigation routes, discovered the same way (2026-07-27).
 * Note: `payments/daf/` (the URL the Checklist's "Set up the ability for DAF Pay" arrow
 * navigates to via client-side routing) 404s on a direct/hard navigation — DAF Pay setup
 * is actually reached via the "Enable DAFpay" section on the Settings page instead, or
 * the "Add Now" banner/modal on the Checklist page itself. See cms-ui-technical-notes memory.
 */
export const PAYMENT_COLLECTION_ROUTES = {
  stripeConnect: 'payments/stripeConnect/',
  settings: 'payments/settings/',
  receiptDetails: 'payments/receiptDetails/',
} as const;

/** CMS "Event Displays" sub-navigation routes, discovered the same way (2026-07-27). */
export const EVENT_DISPLAYS_ROUTES = {
  defaultScreensSettings: 'leaderboard/defaultScreensSettings/',
} as const;

/** CMS "Notifications" sub-navigation routes, discovered the same way (2026-07-30). */
export const NOTIFICATIONS_ROUTES = {
  settings: 'notifications/settings/',
  systemMessages: 'notifications/systemMessages/',
  campaigns: 'notifications/campaigns/',
  createEditCustomNotification: 'notifications/createEditCustomNotification/',
} as const;

/** CMS "Guests" sub-navigation routes, discovered the same way (2026-08-01). */
export const GUESTS_ROUTES = {
  guestList: 'guests/details/',
  createGuest: 'guests/create/',
  tables: 'tables/index/',
  createTable: 'tables/create/',
  tableAssignments: 'tables/moveGuests/',
} as const;
