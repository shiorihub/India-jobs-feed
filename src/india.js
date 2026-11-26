// Decides whether a job location is in India and normalises the city name.

const CITY_ALIASES = {
    bengaluru: ['bengaluru', 'bangalore', 'bengalore', 'bangaluru'],
    hyderabad: ['hyderabad', 'secunderabad'],
    mumbai: ['mumbai', 'navi mumbai', 'bombay', 'thane'],
    pune: ['pune'],
    gurugram: ['gurugram', 'gurgaon'],
    noida: ['noida', 'greater noida'],
    delhi: ['new delhi', 'delhi', 'delhi ncr', 'ncr'],
    chennai: ['chennai', 'madras'],
    kolkata: ['kolkata', 'calcutta'],
    ahmedabad: ['ahmedabad', 'gandhinagar', 'gift city'],
    jaipur: ['jaipur'],
    kochi: ['kochi', 'cochin', 'ernakulam'],
    thiruvananthapuram: ['thiruvananthapuram', 'trivandrum'],
    coimbatore: ['coimbatore'],
    indore: ['indore'],
    chandigarh: ['chandigarh', 'mohali', 'panchkula'],
    lucknow: ['lucknow'],
    nagpur: ['nagpur'],
    vadodara: ['vadodara', 'baroda'],
    surat: ['surat'],
    bhubaneswar: ['bhubaneswar'],
    visakhapatnam: ['visakhapatnam', 'vizag'],
    mysuru: ['mysuru', 'mysore'],
    goa: ['goa', 'panaji'],
};

const STATES = [
    'karnataka', 'maharashtra', 'telangana', 'tamil nadu', 'haryana', 'uttar pradesh',
    'west bengal', 'gujarat', 'kerala', 'rajasthan', 'andhra pradesh', 'madhya pradesh', 'punjab', 'odisha',
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (words) => new RegExp(`(^|[^a-z])(${words.map(esc).join('|')})([^a-z]|$)`, 'i');

const CITY_RES = Object.entries(CITY_ALIASES).map(([city, aliases]) => [city, wordRe(aliases)]);
const INDIA_RE = wordRe(['india', 'bharat']);
const STATE_RE = wordRe(STATES);
// Same-named places abroad that would otherwise match a city alias.
const FOREIGN_RE = /\b(usa|united states|u\.s\.|canada|new york|ny|california|ohio|pakistan)\b/i;

const title = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/**
 * @param {string[]} locationStrings every location-ish string the ATS gave us
 * @param {string} [countryCode] ISO code when the ATS provides one
 * @returns {{isIndia: boolean, cities: string[]}}
 */
export function detectIndia(locationStrings, countryCode) {
    const text = locationStrings.filter(Boolean).join(' | ');
    const cities = CITY_RES.filter(([, re]) => re.test(text)).map(([city]) => title(city));
    const explicit = countryCode?.toUpperCase() === 'IN' || INDIA_RE.test(text);
    const implied = (cities.length > 0 || STATE_RE.test(text)) && !FOREIGN_RE.test(text);
    return { isIndia: explicit || implied, cities };
}
