// Every product-analytics event name in one place, so the web app, the landing
// page, and GA4 reports share one vocabulary. Names are snake_case per GA4
// convention; the ones the landing page already sends (sign_up_started,
// google_sign_in, beta_code_used, ...) keep exactly the same spelling so both
// surfaces report into a single funnel.
export const ANALYTICS_EVENTS = {
  // Auth
  signUpStarted: "sign_up_started",
  signUpCompleted: "sign_up_completed",
  signInStarted: "login_started",
  signInCompleted: "login",
  loginCompleted: "login",
  googleSignIn: "google_sign_in",
  signOut: "sign_out",
  passwordResetRequested: "password_reset_requested",

  // Beta gate
  betaCodeUsed: "beta_code_used",
  betaCodeRejected: "beta_code_rejected",

  // Onboarding
  onboardingStepCompleted: "onboarding_step_completed",
  onboardingCompleted: "onboarding_completed",

  // Ledger
  transactionAdded: "transaction_added",
  transferCreated: "transfer_created",

  // Data portability
  dataExported: "data_exported",
  dataImported: "data_imported",

  // App
  pageView: "page_view",
  // Fires for both outcomes; the `outcome` parameter says which.
  installPromptResult: "install_prompt_result"
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

// GA4 rejects parameter values that are not primitives, so callers are held to
// the shapes it can actually store.
export type AnalyticsEventParams = Record<string, string | number | boolean | undefined>;
