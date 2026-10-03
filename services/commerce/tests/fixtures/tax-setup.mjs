export const setupTime = 1_791_000_000;
export const registrationFixture = (patch = {}) => ({ id: "taxreg_fixture", object: "tax.registration", country: "US", livemode: false,
  active_from: 1_700_000_000, expires_at: null, status: "active", country_options: { us: { state: "CA", type: "state_sales_tax" } }, ...patch });
export const settingsFixture = (patch = {}) => ({ object: "tax.settings", livemode: false, status: "active",
  defaults: { provider: "stripe", tax_behavior: null, tax_code: null }, head_office: { address: { country: "US", state: "CA" } }, status_details: { active: {} }, ...patch });
export const setupReaderFixture = (rows = [registrationFixture()]) => ({ livemode: false,
  account: async () => ({ id: "acct_fixture", object: "account", private_contact: "must not expose" }),
  settings: async () => settingsFixture(), registrations: async () => ({ object: "list", has_more: false, data: rows }) });
