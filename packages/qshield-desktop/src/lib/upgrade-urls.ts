export const UPGRADE_URLS = {
  free_to_personal: 'https://qshield.io/upgrade?from=free&to=personal&ref=desktop',
  personal_to_business: 'https://qshield.io/upgrade?from=personal&to=business&ref=desktop',
  business_to_enterprise: 'https://qshield.io/upgrade?from=business&to=enterprise&ref=desktop',
  contact_sales: 'mailto:sales@qshield.io?subject=QShield%20Enterprise%20Inquiry',
  manage_billing: 'https://qshield.io/billing?ref=desktop',
  pricing_page: 'https://qshield.io/pricing?ref=desktop',
} as const;

export async function openUpgradeUrl(key: keyof typeof UPGRADE_URLS): Promise<void> {
  const url = UPGRADE_URLS[key];
  await window.qshield.app.openExternal(url);
}
