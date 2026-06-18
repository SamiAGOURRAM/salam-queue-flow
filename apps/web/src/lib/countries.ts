/**
 * Country helpers for the location picker.
 *
 * We store only ISO 3166-1 alpha-2 codes and derive the display name at runtime
 * via `Intl.DisplayNames` (locale-aware — names come out in the active UI language)
 * and the flag emoji from the code. No bundled name table to translate or drift.
 */

/** ISO 3166-1 alpha-2 codes (UN members + commonly used territories). */
export const COUNTRY_CODES: string[] = [
  'AD','AE','AF','AG','AL','AM','AO','AR','AT','AU','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ',
  'BN','BO','BR','BS','BT','BW','BY','BZ','CA','CD','CF','CG','CH','CI','CL','CM','CN','CO','CR','CU',
  'CV','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','ER','ES','ET','FI','FJ','FM','FR','GA',
  'GB','GD','GE','GH','GM','GN','GQ','GR','GT','GW','GY','HN','HR','HT','HU','ID','IE','IL','IN','IQ',
  'IR','IS','IT','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KZ','LA','LB','LC','LI',
  'LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MG','MH','MK','ML','MM','MN','MR','MT','MU',
  'MV','MW','MX','MY','MZ','NA','NE','NG','NI','NL','NO','NP','NR','NZ','OM','PA','PE','PG','PH','PK',
  'PL','PS','PT','PW','PY','QA','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SI','SK','SL','SM',
  'SN','SO','SR','SS','ST','SV','SY','SZ','TD','TG','TH','TJ','TL','TM','TN','TO','TR','TT','TV','TW',
  'TZ','UA','UG','US','UY','UZ','VA','VC','VE','VN','VU','WS','YE','ZA','ZM','ZW',
];

const CODE_SET = new Set(COUNTRY_CODES);

/** Regional-indicator flag emoji for a 2-letter code (e.g. 'MA' → 🇲🇦). */
export function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return '🏳️';
  return code
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export interface Country {
  code: string;
  name: string;
  flag: string;
}

/** All countries with localized names, sorted by name in the given locale. */
export function getCountries(locale = 'en'): Country[] {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    display = null;
  }
  return COUNTRY_CODES.map((code) => ({
    code,
    name: display?.of(code) ?? code,
    flag: flagEmoji(code),
  })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** Localized country name for a single code (falls back to the code itself). */
export function countryName(code: string, locale = 'en'): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Normalize/validate an arbitrary code against our known set (default 'MA'). */
export function normalizeCountryCode(code: string | null | undefined, fallback = 'MA'): string {
  const upper = (code ?? '').toUpperCase();
  return CODE_SET.has(upper) ? upper : fallback;
}
