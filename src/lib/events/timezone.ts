/**
 * spec.md §7.4 "Venue normalization and timezone inference" and §32 guardrail #40
 * ("do not add maps/geocoding solely for timezone"): timezone is inferred from an
 * application-side lookup table (state/province/country/city names), never from a
 * maps or geocoding API. Confidence is `high` only for an unambiguous match; ambiguous
 * or partial matches are `low`; nothing found is `none`. It is better to return `none`
 * than to guess a wrong zone.
 *
 * Two-letter/short codes (state and province abbreviations, "us"/"uk"/"uae") are
 * matched case-sensitively as an all-caps whole word against the *original* text
 * (never the lowercased form) — real addresses render them as "Austin, TX", never
 * "austin, tx" prose — so common lowercase English words ("in", "or", "me", "hi", "ok")
 * never collide with a state/country code.
 *
 * Pure, dependency-free: no I/O, no network calls.
 */

export type TimezoneConfidence = "high" | "low" | "none";

export interface TimezoneInference {
  timezone: string | null;
  confidence: TimezoneConfidence;
  matched: string | null;
}

interface LookupEntry {
  /** Canonical IANA zone, or null for an ambiguous state/region match. */
  zone: string | null;
  confidence: TimezoneConfidence;
  /** Canonical label recorded as `matched` when this entry wins. */
  label: string;
}

/** A table of full names/cities, matched case-insensitively as whole words/phrases. */
type NameTable = Record<string, LookupEntry>;
/** A table of short codes, matched case-sensitively as all-caps whole words. */
type AbbrevTable = Record<string, LookupEntry>;

// Unambiguous US cities that disambiguate a state whose IANA zone is otherwise split.
const US_CITY_NAMES: NameTable = {
  phoenix: { zone: "America/Phoenix", confidence: "high", label: "Phoenix" },
  indianapolis: { zone: "America/Indiana/Indianapolis", confidence: "high", label: "Indianapolis" },
  "el paso": { zone: "America/Denver", confidence: "high", label: "El Paso" },
  // Florida: Eastern statewide except the western panhandle (Central).
  miami: { zone: "America/New_York", confidence: "high", label: "Miami" },
  orlando: { zone: "America/New_York", confidence: "high", label: "Orlando" },
  tampa: { zone: "America/New_York", confidence: "high", label: "Tampa" },
  jacksonville: { zone: "America/New_York", confidence: "high", label: "Jacksonville" },
  pensacola: { zone: "America/Chicago", confidence: "high", label: "Pensacola" },
  // Tennessee: Central in the west, Eastern for the rest.
  memphis: { zone: "America/Chicago", confidence: "high", label: "Memphis" },
  nashville: { zone: "America/Chicago", confidence: "high", label: "Nashville" },
  knoxville: { zone: "America/New_York", confidence: "high", label: "Knoxville" },
  chattanooga: { zone: "America/New_York", confidence: "high", label: "Chattanooga" },
  // Kentucky: split roughly along the middle.
  louisville: { zone: "America/New_York", confidence: "high", label: "Louisville" },
  lexington: { zone: "America/New_York", confidence: "high", label: "Lexington" },
  "bowling green": { zone: "America/Chicago", confidence: "high", label: "Bowling Green" },
  paducah: { zone: "America/Chicago", confidence: "high", label: "Paducah" },
  // Kansas: mostly Central, a handful of far-western counties Mountain.
  wichita: { zone: "America/Chicago", confidence: "high", label: "Wichita" },
  topeka: { zone: "America/Chicago", confidence: "high", label: "Topeka" },
  "kansas city": { zone: "America/Chicago", confidence: "high", label: "Kansas City" },
  goodland: { zone: "America/Denver", confidence: "high", label: "Goodland" },
  // Nebraska: mostly Central, western panhandle Mountain.
  omaha: { zone: "America/Chicago", confidence: "high", label: "Omaha" },
  lincoln: { zone: "America/Chicago", confidence: "high", label: "Lincoln" },
  scottsbluff: { zone: "America/Denver", confidence: "high", label: "Scottsbluff" },
  // North Dakota: mostly Central, a southwestern strip Mountain.
  fargo: { zone: "America/Chicago", confidence: "high", label: "Fargo" },
  bismarck: { zone: "America/North_Dakota/Center", confidence: "high", label: "Bismarck" },
  // South Dakota: split roughly along the Missouri river.
  "sioux falls": { zone: "America/Chicago", confidence: "high", label: "Sioux Falls" },
  "rapid city": { zone: "America/Denver", confidence: "high", label: "Rapid City" },
  // Michigan: Eastern statewide except a few far-western Upper Peninsula counties.
  detroit: { zone: "America/Detroit", confidence: "high", label: "Detroit" },
  "grand rapids": { zone: "America/Detroit", confidence: "high", label: "Grand Rapids" },
  ironwood: { zone: "America/Menominee", confidence: "high", label: "Ironwood" },
  // Oregon: Pacific statewide except a small eastern (Malheur County) Mountain sliver.
  portland: { zone: "America/Los_Angeles", confidence: "high", label: "Portland" },
  // "Ontario" alone is ambiguous (a CA/OR city and a Canadian province with a split
  // zone), so it is intentionally omitted rather than guessed.
  // Idaho: Mountain in the south, Pacific in the north panhandle.
  boise: { zone: "America/Boise", confidence: "high", label: "Boise" },
  "coeur d'alene": { zone: "America/Los_Angeles", confidence: "high", label: "Coeur d'Alene" },
  "coeur dalene": { zone: "America/Los_Angeles", confidence: "high", label: "Coeur d'Alene" },
};

// Unambiguous US states/territories: a single IANA zone applies statewide (name form).
const US_STATE_NAMES: NameTable = {
  alabama: { zone: "America/Chicago", confidence: "high", label: "Alabama" },
  alaska: { zone: "America/Anchorage", confidence: "high", label: "Alaska" },
  arizona: { zone: "America/Phoenix", confidence: "high", label: "Arizona" },
  arkansas: { zone: "America/Chicago", confidence: "high", label: "Arkansas" },
  california: { zone: "America/Los_Angeles", confidence: "high", label: "California" },
  colorado: { zone: "America/Denver", confidence: "high", label: "Colorado" },
  connecticut: { zone: "America/New_York", confidence: "high", label: "Connecticut" },
  delaware: { zone: "America/New_York", confidence: "high", label: "Delaware" },
  "washington dc": { zone: "America/New_York", confidence: "high", label: "Washington, DC" },
  florida: { zone: null, confidence: "low", label: "Florida" },
  georgia: { zone: "America/New_York", confidence: "high", label: "Georgia" },
  hawaii: { zone: "Pacific/Honolulu", confidence: "high", label: "Hawaii" },
  idaho: { zone: null, confidence: "low", label: "Idaho" },
  illinois: { zone: "America/Chicago", confidence: "high", label: "Illinois" },
  indiana: { zone: "America/Indiana/Indianapolis", confidence: "high", label: "Indiana" },
  iowa: { zone: "America/Chicago", confidence: "high", label: "Iowa" },
  kansas: { zone: null, confidence: "low", label: "Kansas" },
  kentucky: { zone: null, confidence: "low", label: "Kentucky" },
  louisiana: { zone: "America/Chicago", confidence: "high", label: "Louisiana" },
  maine: { zone: "America/New_York", confidence: "high", label: "Maine" },
  maryland: { zone: "America/New_York", confidence: "high", label: "Maryland" },
  massachusetts: { zone: "America/New_York", confidence: "high", label: "Massachusetts" },
  michigan: { zone: null, confidence: "low", label: "Michigan" },
  minnesota: { zone: "America/Chicago", confidence: "high", label: "Minnesota" },
  mississippi: { zone: "America/Chicago", confidence: "high", label: "Mississippi" },
  missouri: { zone: "America/Chicago", confidence: "high", label: "Missouri" },
  montana: { zone: "America/Denver", confidence: "high", label: "Montana" },
  nebraska: { zone: null, confidence: "low", label: "Nebraska" },
  nevada: { zone: "America/Los_Angeles", confidence: "high", label: "Nevada" },
  "new hampshire": { zone: "America/New_York", confidence: "high", label: "New Hampshire" },
  "new jersey": { zone: "America/New_York", confidence: "high", label: "New Jersey" },
  "new mexico": { zone: "America/Denver", confidence: "high", label: "New Mexico" },
  "new york": { zone: "America/New_York", confidence: "high", label: "New York" },
  "north carolina": { zone: "America/New_York", confidence: "high", label: "North Carolina" },
  "north dakota": { zone: null, confidence: "low", label: "North Dakota" },
  ohio: { zone: "America/New_York", confidence: "high", label: "Ohio" },
  oklahoma: { zone: "America/Chicago", confidence: "high", label: "Oklahoma" },
  oregon: { zone: null, confidence: "low", label: "Oregon" },
  pennsylvania: { zone: "America/New_York", confidence: "high", label: "Pennsylvania" },
  "rhode island": { zone: "America/New_York", confidence: "high", label: "Rhode Island" },
  "south carolina": { zone: "America/New_York", confidence: "high", label: "South Carolina" },
  "south dakota": { zone: null, confidence: "low", label: "South Dakota" },
  tennessee: { zone: null, confidence: "low", label: "Tennessee" },
  texas: { zone: "America/Chicago", confidence: "high", label: "Texas" },
  utah: { zone: "America/Denver", confidence: "high", label: "Utah" },
  vermont: { zone: "America/New_York", confidence: "high", label: "Vermont" },
  virginia: { zone: "America/New_York", confidence: "high", label: "Virginia" },
  washington: { zone: "America/Los_Angeles", confidence: "high", label: "Washington" },
  "west virginia": { zone: "America/New_York", confidence: "high", label: "West Virginia" },
  wisconsin: { zone: "America/Chicago", confidence: "high", label: "Wisconsin" },
  wyoming: { zone: "America/Denver", confidence: "high", label: "Wyoming" },
};

// US state/territory two-letter postal codes, matched case-sensitively (all caps).
const US_STATE_ABBREVS: AbbrevTable = {
  AL: US_STATE_NAMES.alabama,
  AK: US_STATE_NAMES.alaska,
  AZ: US_STATE_NAMES.arizona,
  AR: US_STATE_NAMES.arkansas,
  CA: US_STATE_NAMES.california,
  CO: US_STATE_NAMES.colorado,
  CT: US_STATE_NAMES.connecticut,
  DE: US_STATE_NAMES.delaware,
  DC: US_STATE_NAMES["washington dc"],
  FL: US_STATE_NAMES.florida,
  GA: US_STATE_NAMES.georgia,
  HI: US_STATE_NAMES.hawaii,
  ID: US_STATE_NAMES.idaho,
  IL: US_STATE_NAMES.illinois,
  IN: US_STATE_NAMES.indiana,
  IA: US_STATE_NAMES.iowa,
  KS: US_STATE_NAMES.kansas,
  KY: US_STATE_NAMES.kentucky,
  LA: US_STATE_NAMES.louisiana,
  ME: US_STATE_NAMES.maine,
  MD: US_STATE_NAMES.maryland,
  MA: US_STATE_NAMES.massachusetts,
  MI: US_STATE_NAMES.michigan,
  MN: US_STATE_NAMES.minnesota,
  MS: US_STATE_NAMES.mississippi,
  MO: US_STATE_NAMES.missouri,
  MT: US_STATE_NAMES.montana,
  NE: US_STATE_NAMES.nebraska,
  NV: US_STATE_NAMES.nevada,
  NH: US_STATE_NAMES["new hampshire"],
  NJ: US_STATE_NAMES["new jersey"],
  NM: US_STATE_NAMES["new mexico"],
  NY: US_STATE_NAMES["new york"],
  NC: US_STATE_NAMES["north carolina"],
  ND: US_STATE_NAMES["north dakota"],
  OH: US_STATE_NAMES.ohio,
  OK: US_STATE_NAMES.oklahoma,
  OR: US_STATE_NAMES.oregon,
  PA: US_STATE_NAMES.pennsylvania,
  RI: US_STATE_NAMES["rhode island"],
  SC: US_STATE_NAMES["south carolina"],
  SD: US_STATE_NAMES["south dakota"],
  TN: US_STATE_NAMES.tennessee,
  TX: US_STATE_NAMES.texas,
  UT: US_STATE_NAMES.utah,
  VT: US_STATE_NAMES.vermont,
  VA: US_STATE_NAMES.virginia,
  WA: US_STATE_NAMES.washington,
  WV: US_STATE_NAMES["west virginia"],
  WI: US_STATE_NAMES.wisconsin,
  WY: US_STATE_NAMES.wyoming,
};

// Canadian provinces/territories (name form). Most are unambiguous; a few straddle a
// border (Ontario spans Eastern/Central).
const CA_PROVINCE_NAMES: NameTable = {
  alberta: { zone: "America/Edmonton", confidence: "high", label: "Alberta" },
  "british columbia": { zone: "America/Vancouver", confidence: "high", label: "British Columbia" },
  manitoba: { zone: "America/Winnipeg", confidence: "high", label: "Manitoba" },
  "new brunswick": { zone: "America/Moncton", confidence: "high", label: "New Brunswick" },
  "newfoundland and labrador": {
    zone: "America/St_Johns",
    confidence: "high",
    label: "Newfoundland and Labrador",
  },
  newfoundland: {
    zone: "America/St_Johns",
    confidence: "high",
    label: "Newfoundland and Labrador",
  },
  "nova scotia": { zone: "America/Halifax", confidence: "high", label: "Nova Scotia" },
  ontario: { zone: null, confidence: "low", label: "Ontario" },
  "prince edward island": {
    zone: "America/Halifax",
    confidence: "high",
    label: "Prince Edward Island",
  },
  quebec: { zone: "America/Toronto", confidence: "high", label: "Quebec" },
  saskatchewan: { zone: "America/Regina", confidence: "high", label: "Saskatchewan" },
  "northwest territories": {
    zone: "America/Yellowknife",
    confidence: "high",
    label: "Northwest Territories",
  },
  nunavut: { zone: null, confidence: "low", label: "Nunavut" },
  yukon: { zone: "America/Whitehorse", confidence: "high", label: "Yukon" },
};

const CA_PROVINCE_ABBREVS: AbbrevTable = {
  AB: CA_PROVINCE_NAMES.alberta,
  BC: CA_PROVINCE_NAMES["british columbia"],
  MB: CA_PROVINCE_NAMES.manitoba,
  NB: CA_PROVINCE_NAMES["new brunswick"],
  NL: CA_PROVINCE_NAMES.newfoundland,
  NS: CA_PROVINCE_NAMES["nova scotia"],
  PE: CA_PROVINCE_NAMES["prince edward island"],
  QC: CA_PROVINCE_NAMES.quebec,
  SK: CA_PROVINCE_NAMES.saskatchewan,
  NT: CA_PROVINCE_NAMES["northwest territories"],
  NU: CA_PROVINCE_NAMES.nunavut,
  YT: CA_PROVINCE_NAMES.yukon,
};

// A modest set of well-known world cities and countries (single-zone or overwhelmingly
// dominant zone; no attempt at exhaustive world coverage).
const WORLD_NAMES: NameTable = {
  london: { zone: "Europe/London", confidence: "high", label: "London" },
  "united kingdom": { zone: "Europe/London", confidence: "high", label: "United Kingdom" },
  paris: { zone: "Europe/Paris", confidence: "high", label: "Paris" },
  france: { zone: "Europe/Paris", confidence: "high", label: "France" },
  berlin: { zone: "Europe/Berlin", confidence: "high", label: "Berlin" },
  germany: { zone: "Europe/Berlin", confidence: "high", label: "Germany" },
  madrid: { zone: "Europe/Madrid", confidence: "high", label: "Madrid" },
  spain: { zone: "Europe/Madrid", confidence: "high", label: "Spain" },
  rome: { zone: "Europe/Rome", confidence: "high", label: "Rome" },
  italy: { zone: "Europe/Rome", confidence: "high", label: "Italy" },
  dublin: { zone: "Europe/Dublin", confidence: "high", label: "Dublin" },
  ireland: { zone: "Europe/Dublin", confidence: "high", label: "Ireland" },
  amsterdam: { zone: "Europe/Amsterdam", confidence: "high", label: "Amsterdam" },
  netherlands: { zone: "Europe/Amsterdam", confidence: "high", label: "Netherlands" },
  lisbon: { zone: "Europe/Lisbon", confidence: "high", label: "Lisbon" },
  portugal: { zone: "Europe/Lisbon", confidence: "high", label: "Portugal" },
  moscow: { zone: "Europe/Moscow", confidence: "high", label: "Moscow" },
  tokyo: { zone: "Asia/Tokyo", confidence: "high", label: "Tokyo" },
  japan: { zone: "Asia/Tokyo", confidence: "high", label: "Japan" },
  seoul: { zone: "Asia/Seoul", confidence: "high", label: "Seoul" },
  "south korea": { zone: "Asia/Seoul", confidence: "high", label: "South Korea" },
  beijing: { zone: "Asia/Shanghai", confidence: "high", label: "Beijing" },
  shanghai: { zone: "Asia/Shanghai", confidence: "high", label: "Shanghai" },
  china: { zone: "Asia/Shanghai", confidence: "high", label: "China" },
  "hong kong": { zone: "Asia/Hong_Kong", confidence: "high", label: "Hong Kong" },
  singapore: { zone: "Asia/Singapore", confidence: "high", label: "Singapore" },
  "kuala lumpur": { zone: "Asia/Kuala_Lumpur", confidence: "high", label: "Kuala Lumpur" },
  bangkok: { zone: "Asia/Bangkok", confidence: "high", label: "Bangkok" },
  thailand: { zone: "Asia/Bangkok", confidence: "high", label: "Thailand" },
  jakarta: { zone: "Asia/Jakarta", confidence: "high", label: "Jakarta" },
  mumbai: { zone: "Asia/Kolkata", confidence: "high", label: "Mumbai" },
  delhi: { zone: "Asia/Kolkata", confidence: "high", label: "Delhi" },
  bangalore: { zone: "Asia/Kolkata", confidence: "high", label: "Bangalore" },
  india: { zone: "Asia/Kolkata", confidence: "high", label: "India" },
  dubai: { zone: "Asia/Dubai", confidence: "high", label: "Dubai" },
  "united arab emirates": { zone: "Asia/Dubai", confidence: "high", label: "United Arab Emirates" },
  istanbul: { zone: "Europe/Istanbul", confidence: "high", label: "Istanbul" },
  turkey: { zone: "Europe/Istanbul", confidence: "high", label: "Turkey" },
  "tel aviv": { zone: "Asia/Jerusalem", confidence: "high", label: "Tel Aviv" },
  jerusalem: { zone: "Asia/Jerusalem", confidence: "high", label: "Jerusalem" },
  israel: { zone: "Asia/Jerusalem", confidence: "high", label: "Israel" },
  cairo: { zone: "Africa/Cairo", confidence: "high", label: "Cairo" },
  egypt: { zone: "Africa/Cairo", confidence: "high", label: "Egypt" },
  johannesburg: { zone: "Africa/Johannesburg", confidence: "high", label: "Johannesburg" },
  "south africa": { zone: "Africa/Johannesburg", confidence: "high", label: "South Africa" },
  nigeria: { zone: "Africa/Lagos", confidence: "high", label: "Nigeria" },
  lagos: { zone: "Africa/Lagos", confidence: "high", label: "Lagos" },
  sydney: { zone: "Australia/Sydney", confidence: "high", label: "Sydney" },
  melbourne: { zone: "Australia/Melbourne", confidence: "high", label: "Melbourne" },
  brisbane: { zone: "Australia/Brisbane", confidence: "high", label: "Brisbane" },
  perth: { zone: "Australia/Perth", confidence: "high", label: "Perth" },
  australia: { zone: null, confidence: "low", label: "Australia" },
  auckland: { zone: "Pacific/Auckland", confidence: "high", label: "Auckland" },
  "new zealand": { zone: "Pacific/Auckland", confidence: "high", label: "New Zealand" },
  toronto: { zone: "America/Toronto", confidence: "high", label: "Toronto" },
  vancouver: { zone: "America/Vancouver", confidence: "high", label: "Vancouver" },
  montreal: { zone: "America/Toronto", confidence: "high", label: "Montreal" },
  canada: { zone: null, confidence: "low", label: "Canada" },
  "mexico city": { zone: "America/Mexico_City", confidence: "high", label: "Mexico City" },
  mexico: { zone: "America/Mexico_City", confidence: "high", label: "Mexico" },
  "sao paulo": { zone: "America/Sao_Paulo", confidence: "high", label: "Sao Paulo" },
  brazil: { zone: null, confidence: "low", label: "Brazil" },
  "buenos aires": {
    zone: "America/Argentina/Buenos_Aires",
    confidence: "high",
    label: "Buenos Aires",
  },
  argentina: { zone: "America/Argentina/Buenos_Aires", confidence: "high", label: "Argentina" },
  "united states": { zone: null, confidence: "low", label: "United States" },
  usa: { zone: null, confidence: "low", label: "United States" },
};

// Country-level short codes, matched case-sensitively (all caps) for the same reason
// as state codes: "us"/"uk" collide with ordinary English words in lowercase prose.
const WORLD_ABBREVS: AbbrevTable = {
  UK: WORLD_NAMES["united kingdom"],
  US: WORLD_NAMES["united states"],
  USA: WORLD_NAMES["united states"],
  UAE: WORLD_NAMES["united arab emirates"],
};

interface Tier {
  names: NameTable;
  abbrevs?: AbbrevTable;
}

// Order matters: cities (most specific, disambiguating) before states/provinces
// before broad countries — a match in an earlier tier wins outright, and within a
// tier the longest matching key wins.
const TIERS: Tier[] = [
  { names: US_CITY_NAMES },
  { names: US_STATE_NAMES, abbrevs: US_STATE_ABBREVS },
  { names: CA_PROVINCE_NAMES, abbrevs: CA_PROVINCE_ABBREVS },
  { names: WORLD_NAMES, abbrevs: WORLD_ABBREVS },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s'-]/g, " ") // also strips NFKD combining marks left over from accents
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Word-boundary match: `key` must appear as a whole word/phrase inside `haystack`,
 * not as a substring of a longer word (so "in" does not match "increase").
 */
function containsWord(haystack: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
  return pattern.test(` ${haystack} `);
}

/** Case-sensitive whole-word match of an all-caps code against the original text. */
function containsAbbrev(rawText: string, code: string): boolean {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`);
  return pattern.test(` ${rawText} `);
}

interface Candidate {
  entry: LookupEntry;
  weight: number;
}

function evaluateTier(rawText: string, normalizedText: string, tier: Tier): Candidate | null {
  let best: Candidate | null = null;
  for (const [key, entry] of Object.entries(tier.names)) {
    if (!containsWord(normalizedText, key)) continue;
    if (!best || key.length > best.weight) {
      best = { entry, weight: key.length };
    }
  }
  if (tier.abbrevs) {
    for (const [code, entry] of Object.entries(tier.abbrevs)) {
      if (!containsAbbrev(rawText, code)) continue;
      // Abbreviations are inherently short; only let one win over a name match if no
      // name match was found in this tier.
      if (!best) {
        best = { entry, weight: code.length };
      }
    }
  }
  return best;
}

/**
 * spec.md §7.4 step 2: infer a candidate IANA timezone + confidence from venue text.
 * Looks up cities first (they disambiguate split-timezone regions), then
 * states/provinces, then broader countries/well-known cities. Returns `none` when
 * nothing in the table matches.
 */
export function inferTimezoneFromVenue(text: string | null | undefined): TimezoneInference {
  if (!text) {
    return { timezone: null, confidence: "none", matched: null };
  }
  const normalized = normalize(text);
  if (!normalized) {
    return { timezone: null, confidence: "none", matched: null };
  }

  let best: Candidate | null = null;
  for (const tier of TIERS) {
    best = evaluateTier(text, normalized, tier);
    if (best) break;
  }

  if (!best) {
    return { timezone: null, confidence: "none", matched: null };
  }
  return {
    timezone: best.entry.zone,
    confidence: best.entry.zone ? best.entry.confidence : "low",
    matched: best.entry.label,
  };
}

/**
 * spec.md §7.4 step 3: validate a candidate timezone against the runtime's own IANA
 * set. Checks `Intl.supportedValuesOf("timeZone")` first (fast, exact-canonical-name
 * match); when it does not list `tz` — including when it is unavailable and throws —
 * falls back to constructing an `Intl.DateTimeFormat` with the zone, which throws
 * `RangeError` for a truly unknown zone but (unlike `supportedValuesOf`'s canonical
 * list) also accepts valid IANA link/alias names the runtime's own tzdata resolves
 * (e.g. `Asia/Kolkata` as an alias of the canonical `Asia/Calcutta`).
 */
export function validateTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    if (
      typeof Intl.supportedValuesOf === "function" &&
      Intl.supportedValuesOf("timeZone").includes(tz)
    ) {
      return true;
    }
  } catch {
    // fall through to the DateTimeFormat probe below
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface ResolveEventTimezoneInput {
  venueText: string | null | undefined;
  browserTimezone: string | null | undefined;
}

/**
 * spec.md §7.4 steps 2-4: an unambiguous (high-confidence) inference from venue text
 * wins; otherwise fall back to a valid browser timezone; otherwise `null`, meaning
 * "ask" (step 6) — a decision left to the caller, never made here.
 */
export function resolveEventTimezone(input: ResolveEventTimezoneInput): string | null {
  const inferred = inferTimezoneFromVenue(input.venueText);
  if (inferred.confidence === "high" && inferred.timezone && validateTimezone(inferred.timezone)) {
    return inferred.timezone;
  }
  if (validateTimezone(input.browserTimezone)) {
    return input.browserTimezone as string;
  }
  return null;
}
