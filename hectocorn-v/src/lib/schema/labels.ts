/** Human-readable labels for the schema enums (form selects, report badges, PDF). */
export const SECTOR_LABELS: Record<string, string> = {
  cybersecurity: "Cybersecurity",
  saas: "SaaS",
  fintech: "Fintech",
  healthtech: "Healthtech",
  biotech: "Biotech",
  climate_energy: "Climate & energy",
  deeptech_hardware: "Deep tech / hardware",
  ai_ml: "AI / ML",
  marketplace: "Marketplace",
  ecommerce: "E-commerce",
  consumer: "Consumer",
  edtech: "Edtech",
  proptech: "Proptech",
  mobility: "Mobility",
  other: "Other",
};

export const REGION_LABELS: Record<string, string> = {
  EU: "European Union",
  UK: "United Kingdom",
  US: "United States",
  MENA: "Middle East & North Africa",
  APAC: "Asia-Pacific",
  LATAM: "Latin America",
  AFRICA: "Africa",
  OTHER: "Other",
};

export const BUSINESS_MODEL_LABELS: Record<string, string> = {
  b2b_saas: "B2B SaaS",
  b2b_services: "B2B services",
  b2b2c: "B2B2C",
  b2c_subscription: "B2C subscription",
  b2c_transactional: "B2C transactional",
  marketplace: "Marketplace",
  hardware: "Hardware",
  licensing: "Licensing",
  other: "Other",
};

export const STAGE_LABELS: Record<string, string> = {
  idea: "Idea",
  pre_seed: "Pre-seed",
  seed: "Seed",
  series_a: "Series A",
  series_b_plus: "Series B+",
};

export const PRODUCT_STAGE_LABELS: Record<string, string> = {
  concept: "Concept",
  prototype: "Prototype",
  mvp: "MVP",
  launched: "Launched",
  scaling: "Scaling",
};

export const LEVEL_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

export const ROUND_TYPE_LABELS: Record<string, string> = {
  friends_family: "Friends & family",
  angel: "Angel",
  pre_seed: "Pre-seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  grant: "Grant",
  convertible_safe: "Convertible / SAFE",
  other: "Other",
};

export const LEAD_INVESTOR_LABELS: Record<string, string> = {
  vc: "VC fund",
  angel: "Angel",
  corporate: "Corporate",
  accelerator: "Accelerator",
  public_grant: "Public grant",
  none: "No lead",
};

export const METHOD_LABELS: Record<string, string> = {
  scorecard: "Scorecard",
  berkus: "Berkus",
  rfs: "Risk-Factor Summation",
  vc: "VC Method",
  multiples: "Revenue Multiples",
  anchor: "Last-Round Anchor",
};

export const SCORE_LABELS: Record<string, string> = {
  team: "Team",
  market: "Market",
  product: "Product",
  traction: "Traction",
  moat: "Moat",
  financial: "Financial",
  deal: "Deal",
};

export const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

export const toOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
