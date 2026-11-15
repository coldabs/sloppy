// The claims lexicons (F69): the word lists behind the claims
// rules — social-proof phrases, claim verbs and nouns, reporting
// subjects, selling signals, and the spelled-number tables. Data
// only; the matching logic stays in claims.ts. The four phrase
// lists are exported for the rules that scan them and for the
// tests that pin every entry.

// The social-proof phrases, shared by the rule below and by the number
// rules: a number that is the crowd in one of these claims — "Trusted
// by 10,000 teams" — is already flagged by the social-proof rule, so
// the number rules leave it alone instead of charging one claim twice.
// The number has to follow the phrase directly, with only "over",
// "more than", or "about" in between. "Join a million happy readers"
// is not covered: no social-proof phrase matches it, so the number
// still counts on its own.
export const SOCIAL_PROOF_PHRASES = [
  'trusted by',
  'loved by',
  'used by',
  'join thousands',
  'join millions',
  'join over',
  'join 10,000',
  'join the thousands',
  'loved by millions',
  'trusted by millions',
  'used by millions',
  'join the millions',
  'loved by thousands',
  'trusted by thousands',
]

// Verbs and nouns that make a percentage a claim rather than a
// measurement: "We grew 500%", "99.9% uptime". A percentage with none
// of these nearby — "The battery is at 50%." — is a plain statement
// and stays clean.
export const CLAIM_VERBS = new Set([
  'grew',
  'grows',
  'growing',
  'growth',
  'increased',
  'increases',
  'increasing',
  'increase',
  'uptime',
  'secure',
  'security',
  'accuracy',
  'accurate',
  'faster',
  'fastest',
  'cheaper',
  'cheapest',
  'saved',
  'saves',
  'saving',
  'retention',
  'conversion',
  'boost',
  'boosts',
  'boosted',
  'guaranteed',
  'guarantee',
  'improved',
  'improves',
  'improvement',
])

// A reporting sentence measures something instead of selling it:
// "Unemployment increased 2%", "Revenue grew 12% year over year".
// The sentence names a measured subject and a change verb, so its
// percentages are data, not claims — a news or earnings sentence is
// not a selling claim even when it uses a claim verb like "grew".
export const REPORTING_SUBJECTS = new Set([
  'unemployment',
  'revenue',
  'revenues',
  'inflation',
  'sales',
  'profit',
  'profits',
  'loss',
  'losses',
  'price',
  'prices',
  'gdp',
  'exports',
  'imports',
  'wages',
  'shares',
  'stock',
  'market',
  'economy',
  'turnout',
  'voters',
  'polling',
  'weather',
  'temperature',
  'rainfall',
  'earnings',
  'income',
  'turnover',
  'demand',
  'supply',
  'interest',
  'rates',
  'mortgage',
  'rent',
  'housing',
  'energy',
  'oil',
  'gas',
  'electricity',
  'crime',
  'births',
  'deaths',
  'population',
  'retail',
  'manufacturing',
  'services',
  'jobs',
  'hiring',
  'layoffs',
  'growth',
])

export const CHANGE_VERBS = new Set([
  'increased',
  'increases',
  'increasing',
  'increase',
  'grew',
  'grows',
  'growing',
  'rose',
  'risen',
  'rises',
  'rising',
  'fell',
  'falls',
  'falling',
  'climbed',
  'climbs',
  'climbing',
  'dropped',
  'drops',
  'dropping',
  'reached',
  'reaches',
  'reaching',
  'jumped',
  'jumps',
  'surged',
  'surging',
  'declined',
  'declines',
  'declining',
  'decreased',
  'decreases',
  'decreasing',
  'gained',
  'gains',
  'lost',
  'loses',
])

// A bare or spelled number only counts as a selling claim when the
// sentence sells: it speaks as the seller (we / our / us), uses a
// selling verb, or puts a boast adjective next to the number ("10,000
// happy users"). "Over a thousand companies across Germany use it
// every day" has none of these, so it stays clean. A number with a
// claim noun but no selling context — a date, a measurement, a plain
// statement — is not a claim.
export const SELLING_SIGNALS = new Set([
  'we',
  'our',
  'us',
  'join',
  'trusted',
  'deliver',
  'delivers',
  'serve',
  'serves',
  'offer',
  'offers',
  'provide',
  'provides',
  'guarantee',
  'guarantees',
  'promise',
  'promises',
])

export const BOAST_ADJECTIVES = new Set([
  'happy',
  'loyal',
  'dedicated',
  'satisfied',
  'paying',
  'delighted',
  'thrilled',
  'proud',
])

// A bare number only counts when it is a selling claim: a large, round
// figure about the product — users, customers, growth, accuracy — with
// no source beside it and with selling context in the sentence. A
// number with context stays clean: "the server handled 10,000
// requests", a date, a version, a measurement, a number in a
// reporting sentence ("Revenue grew 12%"), and a price statement
// ("100% FREE"). The threshold is 1,000, so "500 customers" is left
// alone, and a plain four-digit year is never a claim.
export const CLAIM_NOUNS = new Set([
  'user',
  'users',
  'customer',
  'customers',
  'team',
  'teams',
  'reader',
  'readers',
  'subscriber',
  'subscribers',
  'download',
  'downloads',
  'install',
  'installs',
  'company',
  'companies',
  'business',
  'businesses',
  'client',
  'clients',
  'member',
  'members',
  'follower',
  'followers',
  'account',
  'accounts',
  'people',
  'organisation',
  'organisations',
  'organization',
  'organizations',
])

export const MAGNITUDE_VALUE: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
  million: 1_000_000,
  billion: 1_000_000_000,
}

export const SPELLED_VALUE: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

export const FAKE_AUTHORITY_PHRASES = [
  'studies have shown',
  'studies show',
  'studies confirm',
  'research shows',
  'research suggests',
  'research confirms',
  'experts agree',
  'experts say',
  'scientists say',
  'science says',
  'data shows',
  'the data speaks for itself',
  'it is well known',
  'it is widely known',
  'everyone knows',
  'as we all know',
  'history shows',
  'evidence shows',
  'it has been proven',
  'doctors recommend',
]

export const TESTIMONIAL_PHRASES = [
  'changed my life',
  'life-changing',
  '10x our',
  'best decision we\'ve made',
  'best decision i\'ve made',
  'can\'t imagine',
  'blown away',
  'a must-have',
  'game changer for me',
  'changed the game',
  'could not be happier',
  'couldn\'t be happier',
  'highly recommend',
  'worth every penny',
  'best purchase ever',
  'i wish i had found this sooner',
  'total game-changer',
  'i love this product so much',
  'best thing i have ever used',
]

export const SUPERLATIVE_PHRASES = [
  'best tool',
  'best choice',
  'ultimate choice',
  'ultimate tool',
  'perfect fit',
  'perfect choice',
  'best in the world',
  'best ever',
  'the very best',
  'number one',
  'number 1',
  'top rated',
  'top-rated',
  'highest rated',
  'most popular',
  "world's best",
  'best thing ever',
]
