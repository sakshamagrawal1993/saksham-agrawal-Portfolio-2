const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Phoenix': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Montreal': 'CA',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
  'Europe/Stockholm': 'SE',
  'Europe/Zurich': 'CH',
  'Asia/Singapore': 'SG',
  'Asia/Dubai': 'AE',
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Hong_Kong': 'HK',
  'Asia/Taipei': 'TW',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Perth': 'AU',
  'Pacific/Auckland': 'NZ',
};

function resolveCountryFromLocales(): string | null {
  if (typeof navigator === 'undefined') return null;
  const localeCandidates = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const locale of localeCandidates) {
    const normalized = locale.replace('_', '-');
    const region = normalized.split('-').find((token) => /^[A-Z]{2}$/.test(token));
    if (region) return region.toUpperCase();
  }
  return null;
}

function resolveCountryFromTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return null;
    return TIMEZONE_TO_COUNTRY[tz] ?? null;
  } catch {
    return null;
  }
}

export function resolveCountryCodeFromClient(): string | null {
  return resolveCountryFromLocales() ?? resolveCountryFromTimeZone();
}

export function getCountryNameFromCode(code: string | null): string | null {
  if (!code) return null;
  try {
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function toTelHref(contact: string | null | undefined): string | null {
  if (!contact) return null;
  const digits = contact.replace(/[^\d+]/g, '');
  if (!digits) return null;
  return `tel:${digits}`;
}
