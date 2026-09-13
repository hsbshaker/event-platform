/**
 * spec.md §7.4 "Venue normalization and timezone inference" and §32 guardrail #40
 * ("do not add maps/geocoding solely for timezone"): timezone is inferred from an
 * application-side lookup table (state/province/country/city names), never from a
 * maps or geocoding API. Confidence is `high` only for an unambiguous match; ambiguous
 * or partial matches are `low`; nothing found is `none`. It is better to return `none`
 * than to guess a wrong zone.
 *
 * Two-letter/short codes (state and province abbreviations, "US"/"UK"/"UAE") are matched
 * case-sensitively against the *original* text, and only where an address puts one:
 * straight after a comma ("Austin, TX") or immediately before a postal code
 * ("Austin TX 78701"). Case alone is not enough — all-caps venue text is ordinary, and
 * several codes are also English words, so "DINNER IN LA" would otherwise resolve to
 * Indiana at high confidence and be written straight to the event's stored timezone.
 *
 * Two known limits, both settled deliberately and both failing safe. A conversational
 * all-caps ending such as "SEE YOU THERE, OK" is syntactically identical to "NORMAN, OK",
 * so it still resolves to Oklahoma; separating them needs a signal this table does not
 * carry. And a city named with its country rather than its state ("Phoenix, USA") reports
 * the country, which is ambiguous, so it falls back to the browser zone rather than the
 * city's: containment is deliberately not extended across the country/state boundary,
 * because doing so would make "Portland, United States" pick one of two real Portlands.
 *
 * Only `high` confidence overrides the browser zone (see `resolveEventTimezone`), so a
 * `low` answer costs nothing a caller would have had anyway.
 *
 * Pure, dependency-free: no I/O, no network calls.
 */

export type TimezoneConfidence = "high" | "low" | "none";

export interface TimezoneInference {
  timezone: string | null;
  confidence: TimezoneConfidence;
  matched: string | null;
}

/**
 * The broad, split-zone regions that contain other entries in the same table. Naming
 * them as a closed set keeps `within` honest in both directions: an entry cannot claim
 * a container that does not exist, and `WORLD_CONTAINERS` cannot quietly stop providing
 * one that entries still name.
 */
type ContainerKey = "australia" | "canada" | "brazil" | "united states";

interface LookupEntry {
  /** Canonical IANA zone, or null for an ambiguous state/region match. */
  zone: string | null;
  confidence: TimezoneConfidence;
  /** Canonical label recorded as `matched` when this entry wins. */
  label: string;
  /**
   * The broad split-zone region this entry sits inside, when there is one. A container
   * never outranks a place inside it that also matched: "Sydney, Australia" is Sydney's
   * zone, not Australia's absence of one.
   */
  within?: ContainerKey;
}

// Countries whose IANA zone is split, so they resolve nothing on their own. Each is the
// single shared entry its own table and `within` both point at, so a container and the
// places inside it can be compared by identity.
const WORLD_CONTAINERS: Record<ContainerKey, LookupEntry> = {
  australia: { zone: null, confidence: "low", label: "Australia" },
  canada: { zone: null, confidence: "low", label: "Canada" },
  brazil: { zone: null, confidence: "low", label: "Brazil" },
  "united states": { zone: null, confidence: "low", label: "United States" },
};

/** A table of full names/cities, matched case-insensitively as whole words/phrases. */
type NameTable = Record<string, LookupEntry>;
/** A table of short codes, matched case-sensitively as all-caps whole words. */
type AbbrevTable = Record<string, LookupEntry>;

/** Every key a city may name as its owning region; checked at compile time. */
type RegionKey = keyof typeof US_STATE_NAMES | keyof typeof CA_PROVINCE_NAMES;

/**
 * A city entry additionally names the region it sits in, by that region's own key in
 * `US_STATE_NAMES` / `CA_PROVINCE_NAMES`. That is what separates the two things a city
 * name can mean when a region is named alongside it: an exception *inside* the matched
 * region (El Paso is Mountain inside Central Texas; Pensacola is Central inside Eastern
 * Florida) versus a same-named city in some *other* region (Oregon's Portland turning up
 * in "Portland, ME").
 */
interface CityEntry extends LookupEntry {
  region: RegionKey;
}
/** A table of cities, each tied to the region it belongs to. */
type CityTable = Record<string, CityEntry>;

// Cities that resolve a split-timezone region, or that are an exception to their own
// region's zone. Every entry names its owning region.
const CITY_NAMES = {
  phoenix: { zone: "America/Phoenix", confidence: "high", label: "Phoenix", region: "arizona" },
  indianapolis: {
    zone: "America/Indiana/Indianapolis",
    confidence: "high",
    label: "Indianapolis",
    region: "indiana",
  },
  "el paso": { zone: "America/Denver", confidence: "high", label: "El Paso", region: "texas" },
  // Florida: Eastern statewide except the western panhandle (Central).
  miami: { zone: "America/New_York", confidence: "high", label: "Miami", region: "florida" },
  orlando: { zone: "America/New_York", confidence: "high", label: "Orlando", region: "florida" },
  tampa: { zone: "America/New_York", confidence: "high", label: "Tampa", region: "florida" },
  jacksonville: {
    zone: "America/New_York",
    confidence: "high",
    label: "Jacksonville",
    region: "florida",
  },
  pensacola: { zone: "America/Chicago", confidence: "high", label: "Pensacola", region: "florida" },
  // Tennessee: Central in the west, Eastern for the rest.
  memphis: { zone: "America/Chicago", confidence: "high", label: "Memphis", region: "tennessee" },
  nashville: {
    zone: "America/Chicago",
    confidence: "high",
    label: "Nashville",
    region: "tennessee",
  },
  knoxville: {
    zone: "America/New_York",
    confidence: "high",
    label: "Knoxville",
    region: "tennessee",
  },
  chattanooga: {
    zone: "America/New_York",
    confidence: "high",
    label: "Chattanooga",
    region: "tennessee",
  },
  // Kentucky: split roughly along the middle.
  louisville: {
    zone: "America/New_York",
    confidence: "high",
    label: "Louisville",
    region: "kentucky",
  },
  lexington: {
    zone: "America/New_York",
    confidence: "high",
    label: "Lexington",
    region: "kentucky",
  },
  "bowling green": {
    zone: "America/Chicago",
    confidence: "high",
    label: "Bowling Green",
    region: "kentucky",
  },
  paducah: { zone: "America/Chicago", confidence: "high", label: "Paducah", region: "kentucky" },
  // Kansas: mostly Central, a handful of far-western counties Mountain.
  wichita: { zone: "America/Chicago", confidence: "high", label: "Wichita", region: "kansas" },
  topeka: { zone: "America/Chicago", confidence: "high", label: "Topeka", region: "kansas" },
  "kansas city": {
    zone: "America/Chicago",
    confidence: "high",
    label: "Kansas City",
    region: "kansas",
  },
  goodland: { zone: "America/Denver", confidence: "high", label: "Goodland", region: "kansas" },
  // Nebraska: mostly Central, western panhandle Mountain.
  omaha: { zone: "America/Chicago", confidence: "high", label: "Omaha", region: "nebraska" },
  lincoln: { zone: "America/Chicago", confidence: "high", label: "Lincoln", region: "nebraska" },
  scottsbluff: {
    zone: "America/Denver",
    confidence: "high",
    label: "Scottsbluff",
    region: "nebraska",
  },
  // North Dakota: mostly Central, a southwestern strip Mountain.
  fargo: { zone: "America/Chicago", confidence: "high", label: "Fargo", region: "north dakota" },
  bismarck: {
    zone: "America/North_Dakota/Center",
    confidence: "high",
    label: "Bismarck",
    region: "north dakota",
  },
  // South Dakota: split roughly along the Missouri river.
  "sioux falls": {
    zone: "America/Chicago",
    confidence: "high",
    label: "Sioux Falls",
    region: "south dakota",
  },
  "rapid city": {
    zone: "America/Denver",
    confidence: "high",
    label: "Rapid City",
    region: "south dakota",
  },
  // Michigan: Eastern statewide except a few far-western Upper Peninsula counties.
  detroit: { zone: "America/Detroit", confidence: "high", label: "Detroit", region: "michigan" },
  "grand rapids": {
    zone: "America/Detroit",
    confidence: "high",
    label: "Grand Rapids",
    region: "michigan",
  },
  ironwood: {
    zone: "America/Menominee",
    confidence: "high",
    label: "Ironwood",
    region: "michigan",
  },
  // Oregon: Pacific statewide except a small eastern (Malheur County) Mountain sliver.
  portland: {
    zone: "America/Los_Angeles",
    confidence: "high",
    label: "Portland",
    region: "oregon",
  },
  // "Ontario" alone is ambiguous (a CA/OR city and a Canadian province with a split
  // zone), so it is intentionally omitted rather than guessed.
  // Idaho: Mountain in the south, Pacific in the north panhandle.
  boise: { zone: "America/Boise", confidence: "high", label: "Boise", region: "idaho" },
  "coeur d'alene": {
    zone: "America/Los_Angeles",
    confidence: "high",
    label: "Coeur d'Alene",
    region: "idaho",
  },
  "coeur dalene": {
    zone: "America/Los_Angeles",
    confidence: "high",
    label: "Coeur d'Alene",
    region: "idaho",
  },
  // Ontario spans Eastern and Central, so the province alone stays ambiguous; Toronto
  // resolves it the same way Pensacola resolves Florida.
  toronto: {
    zone: "America/Toronto",
    confidence: "high",
    label: "Toronto",
    region: "ontario",
    within: "canada",
  },
} satisfies CityTable;

// Unambiguous US states/territories: a single IANA zone applies statewide (name form).
const US_STATE_NAMES = {
  alabama: { zone: "America/Chicago", confidence: "high", label: "Alabama" },
  alaska: { zone: "America/Anchorage", confidence: "high", label: "Alaska" },
  arizona: { zone: "America/Phoenix", confidence: "high", label: "Arizona" },
  arkansas: { zone: "America/Chicago", confidence: "high", label: "Arkansas" },
  california: { zone: "America/Los_Angeles", confidence: "high", label: "California" },
  colorado: { zone: "America/Denver", confidence: "high", label: "Colorado" },
  connecticut: { zone: "America/New_York", confidence: "high", label: "Connecticut" },
  delaware: { zone: "America/New_York", confidence: "high", label: "Delaware" },
  "washington dc": { zone: "America/New_York", confidence: "high", label: "Washington, DC" },
  // `normalize` turns the periods in "Washington, D.C." into spaces, so the punctuated
  // form needs its own alias key; without it the longest-key rule would fall back to the
  // `washington` state entry and return Pacific time for the District of Columbia.
  "washington d c": { zone: "America/New_York", confidence: "high", label: "Washington, DC" },
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
} satisfies NameTable;

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
const CA_PROVINCE_NAMES = {
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
} satisfies NameTable;

const CA_PROVINCE_ABBREVS: AbbrevTable = {
  AB: CA_PROVINCE_NAMES.alberta,
  BC: CA_PROVINCE_NAMES["british columbia"],
  MB: CA_PROVINCE_NAMES.manitoba,
  NB: CA_PROVINCE_NAMES["new brunswick"],
  NL: CA_PROVINCE_NAMES.newfoundland,
  NS: CA_PROVINCE_NAMES["nova scotia"],
  ON: CA_PROVINCE_NAMES.ontario,
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
  sydney: {
    zone: "Australia/Sydney",
    confidence: "high",
    label: "Sydney",
    within: "australia",
  },
  melbourne: {
    zone: "Australia/Melbourne",
    confidence: "high",
    label: "Melbourne",
    within: "australia",
  },
  brisbane: {
    zone: "Australia/Brisbane",
    confidence: "high",
    label: "Brisbane",
    within: "australia",
  },
  perth: { zone: "Australia/Perth", confidence: "high", label: "Perth", within: "australia" },
  australia: WORLD_CONTAINERS.australia,
  auckland: { zone: "Pacific/Auckland", confidence: "high", label: "Auckland" },
  "new zealand": { zone: "Pacific/Auckland", confidence: "high", label: "New Zealand" },
  // Same entry as the city table uses, so the two can never drift apart.
  toronto: CITY_NAMES.toronto,
  vancouver: {
    zone: "America/Vancouver",
    confidence: "high",
    label: "Vancouver",
    within: "canada",
  },
  montreal: { zone: "America/Toronto", confidence: "high", label: "Montreal", within: "canada" },
  canada: WORLD_CONTAINERS.canada,
  "mexico city": { zone: "America/Mexico_City", confidence: "high", label: "Mexico City" },
  mexico: { zone: "America/Mexico_City", confidence: "high", label: "Mexico" },
  "sao paulo": {
    zone: "America/Sao_Paulo",
    confidence: "high",
    label: "Sao Paulo",
    within: "brazil",
  },
  brazil: WORLD_CONTAINERS.brazil,
  "buenos aires": {
    zone: "America/Argentina/Buenos_Aires",
    confidence: "high",
    label: "Buenos Aires",
  },
  argentina: { zone: "America/Argentina/Buenos_Aires", confidence: "high", label: "Argentina" },
  "united states": WORLD_CONTAINERS["united states"],
  // The same entry, so "USA" and "United States" are one place, not two.
  usa: WORLD_CONTAINERS["united states"],
};

// Country-level short codes, matched case-sensitively (all caps) for the same reason
// as state codes: "us"/"uk" collide with ordinary English words in lowercase prose.
const WORLD_ABBREVS: AbbrevTable = {
  UK: WORLD_NAMES["united kingdom"],
  US: WORLD_NAMES["united states"],
  USA: WORLD_NAMES["united states"],
  UAE: WORLD_NAMES["united arab emirates"],
};

interface Tier<E extends LookupEntry = LookupEntry> {
  names: Record<string, E>;
  abbrevs?: Record<string, E>;
}

// Region tiers, most specific first: US states/territories, then Canadian
// provinces/territories, then broad countries and well-known world cities. The first
// tier with a match wins outright, and within a tier the longest matching key wins.
const REGION_TIERS: Tier[] = [
  { names: US_STATE_NAMES, abbrevs: US_STATE_ABBREVS },
  { names: CA_PROVINCE_NAMES, abbrevs: CA_PROVINCE_ABBREVS },
  { names: WORLD_NAMES, abbrevs: WORLD_ABBREVS },
];

// The city table is not a tier of its own: it refines a region rather than outranking
// it. A city name alone ("Portland", "Lincoln", "Lexington") is ambiguous across states,
// so it decides the zone only when no region matched, or when it sits inside the region
// that did match and is therefore that region's own exception.
const CITY_TIER: Tier<CityEntry> = { names: CITY_NAMES };

/**
 * The entry a city's `region` key refers to, by identity — abbreviation tables alias the
 * very same objects as their name tables, so a region matched as "TX" and one matched as
 * "Texas" compare equal here.
 */
function owningRegionEntry(city: CityEntry): LookupEntry {
  const states: NameTable = US_STATE_NAMES;
  const provinces: NameTable = CA_PROVINCE_NAMES;
  return states[city.region] ?? provinces[city.region];
}

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

/**
 * Case-sensitive match of an all-caps code against the original text, in one of the two
 * positions an address actually puts one: straight after a comma ("Austin, TX",
 * "Toronto, ON") or immediately before a postal code ("Austin TX 78701",
 * "Toronto ON M5V 2T6").
 *
 * Case on its own is not evidence: all-caps venue and address text is ordinary, and IN,
 * LA, OK, ME, HI and US are also English words, so matching a bare all-caps word turned
 * "DINNER IN LA" into Indiana and "JOIN US OK" into Oklahoma — at `high` confidence,
 * which `resolveEventTimezone` writes straight to the event's stored zone. Requiring the
 * address position costs only the "Austin TX" form with neither comma nor postal code,
 * and that returns `none` rather than a wrong zone.
 */
function containsAbbrev(rawText: string, code: string): boolean {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`,\\s*${escaped}(?![A-Za-z0-9])`).test(rawText)) return true;
  // US ZIP (12345 / 12345-6789) or the first half of a Canadian postal code (M5V).
  const postalCode = String.raw`\d{5}(-\d{4})?|[A-Z]\d[A-Z]`;
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}\\s+(${postalCode})(?![A-Za-z0-9])`).test(rawText);
}

interface Candidate<E extends LookupEntry = LookupEntry> {
  entry: E;
  weight: number;
}

/**
 * The best match within one tier, by a stated order rather than by table order:
 *
 * 1. a place beats a broad container it sits inside, however much longer the
 *    container's key is — "Sydney, Australia" is Sydney, not ambiguous Australia;
 * 2. otherwise the longest matching name key wins, since it is the most specific
 *    ("new hampshire" over "hampshire" were both present);
 * 3. names beat abbreviations, which are short and easier to hit by accident;
 * 4. among abbreviations the longest code wins ("USA" over "US");
 * 5. two codes of the same length pointing at different places means the text
 *    contradicts itself, so neither wins — guessing risks a confidently wrong zone;
 * 6. anything still tied is settled by table order, which is stable.
 */
function evaluateTier<E extends LookupEntry>(
  rawText: string,
  normalizedText: string,
  tier: Tier<E>,
): Candidate<E> | null {
  const matches: Candidate<E>[] = [];
  for (const [key, entry] of Object.entries(tier.names)) {
    if (containsWord(normalizedText, key)) matches.push({ entry, weight: key.length });
  }

  // Rule 1: any container that a more specific match sits inside is out of the running.
  const shadowed = new Set<LookupEntry>();
  for (const match of matches) {
    if (!match.entry.within || match.entry.zone === null) continue;
    const container = WORLD_CONTAINERS[match.entry.within];
    if (container.zone === null) shadowed.add(container);
  }

  let best: Candidate<E> | null = null;
  for (const match of matches) {
    if (shadowed.has(match.entry)) continue;
    if (!best || match.weight > best.weight) best = match;
  }
  if (best || !tier.abbrevs) return best;

  let winner: Candidate<E> | null = null;
  let contradicted = false;
  for (const [code, entry] of Object.entries(tier.abbrevs)) {
    if (!containsAbbrev(rawText, code)) continue;
    if (!winner || code.length > winner.weight) {
      winner = { entry, weight: code.length };
      contradicted = false;
    } else if (code.length === winner.weight && entry !== winner.entry) {
      contradicted = true;
    }
  }
  return contradicted ? null : winner;
}

/**
 * spec.md §7.4 step 2: infer a candidate IANA timezone + confidence from venue text.
 *
 * Regions are resolved first, because the surrounding state/province/country is what
 * says which "Portland" or "Lincoln" the text means. A city then decides only when it
 * is the region's own business to be decided by it:
 *
 * 1. the matched city sits inside the matched region (`region` key identical) — it is
 *    that region's exception or split-resolver, so it wins outright, whatever the
 *    region's own zone says: El Paso in Texas, Pensacola in Florida, Toronto in Ontario;
 * 2. the matched city belongs to some other region — a name collision, so the region
 *    wins and the city is discarded: "Portland, ME", "Lincoln Center, New York, NY";
 * 3. no city matched — the region wins, which for an ambiguous region (`zone: null`)
 *    means `low` confidence with no zone;
 * 4. no region matched — a city match decides on its own.
 *
 * Returns `none` when nothing in the tables matches.
 */
export function inferTimezoneFromVenue(text: string | null | undefined): TimezoneInference {
  if (!text) {
    return { timezone: null, confidence: "none", matched: null };
  }
  const normalized = normalize(text);
  if (!normalized) {
    return { timezone: null, confidence: "none", matched: null };
  }

  let region: Candidate | null = null;
  for (const tier of REGION_TIERS) {
    region = evaluateTier(text, normalized, tier);
    if (region) break;
  }
  const city = evaluateTier(text, normalized, CITY_TIER);

  let best: Candidate | null;
  if (!region) {
    best = city;
  } else if (city && owningRegionEntry(city.entry) === region.entry) {
    best = city;
  } else {
    best = region;
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
