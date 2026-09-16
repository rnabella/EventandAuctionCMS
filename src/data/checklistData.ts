/**
 * Expected structure of the CMS event "Checklist" page, captured from the live
 * Integration environment (event 9754d4fb-88f5-11f1-a08c-f68364a05a4e) on 2026-07-26.
 * Used as the acceptance baseline for checklist.spec.ts, and as the backlog driving
 * which CMS sections get their own page objects/tests next.
 *
 * "Prize Draw" (2 items) added 2026-09-16 after being caught as a real, missing
 * section — reproduced identically on both the US and UK environments (same 2 item
 * titles, same position between Donations and Payment Collection), confirming it's a
 * genuine newer CMS section, not an environment-specific quirk. No page object exists
 * for it yet (the Lite UI purchase flow for Prize Draw remains out of scope — see
 * README's GLI Raffle gotchas for how it differs from GLI Raffle/Silent Auction); this
 * only fixes the checklist page's own section/item inventory.
 */
export const CHECKLIST_SECTIONS: Record<string, string[]> = {
  'Website Details': [
    'Set up your website URL',
    'Add your social links',
    'Add your color scheme and logos',
    'Add your homepage text, homepage image or video and additional info text',
    'Configure your website menu',
    'Add sponsor highlights',
    'Set up your dedicated Event Page',
  ],
  Ticketing: [
    'Configure your ticket settings',
    'Update the ticket details',
    'Create your tickets',
    'Configure your questions',
    'Create your promo codes',
  ],
  'Auction Items': [
    'Upload auction items',
    'Add your chosen Givergy Items',
    'Upload your inventory auction items',
    'Thank your item donors',
  ],
  Donations: ['Configure your donation settings'],
  'Prize Draw': ['Learn about the legal requirements in your region', 'Add your chosen Prize Draw Items'],
  'Payment Collection': [
    'Set up Stripe account for payment collection',
    'Set up the ability for DAF Pay. Provide your EIN number',
    'Review the payment method - Donor Tip or Platform fee',
    'Configure your receipts',
  ],
  'Event Displays': [
    'Create & Design your Event Display Screens within Event Display & Totalizer > Settings',
    'Share with your onsite AV team to display.',
  ],
  Notifications: [
    'Review our recommended communication strategy guide',
    'Review & update the default system notifications',
    'Draft, schedule & test your custom notifications',
  ],
  'Guest Details': ['Upload your guest information', 'Add your guests to their tables'],
};

export const CHECKLIST_TOTAL_ITEM_COUNT = Object.values(CHECKLIST_SECTIONS).reduce((total, items) => total + items.length, 0);
