import type { AccountType } from "@/types/common";

export const APP_NAME = "Moniilog";

export const APP_TAGLINE = "Make financial tracking as easy as sending a message.";

export const SETTINGS_ROW_ID = "app-settings";

export const NOTIFICATION_PREFERENCES_ID = "notification-preferences";

export const DEFAULT_ACCOUNTS: Array<{
  id: string;
  name: string;
  type: AccountType;
  displayOrder: number;
}> = [
  {
    id: "default-cash",
    name: "Cash",
    type: "cash",
    displayOrder: 0
  },
  {
    id: "default-bank",
    name: "Bank",
    type: "bank",
    displayOrder: 1
  }
];

// Mirrors the Flutter app's system categories (lib/core/constants/system_defaults.dart):
// same ids, names, types, and iconKeys so both surfaces — and the WhatsApp chatbot
// writing into Firestore — share one category vocabulary.
export const DEFAULT_CATEGORY_SEEDS = [
  { id: "cat-inc-salary", name: "Salary", type: "income", iconKey: "salary", colorKey: "success" },
  { id: "cat-inc-freelance", name: "Freelance", type: "income", iconKey: "freelance", colorKey: "success" },
  { id: "cat-inc-business", name: "Business", type: "income", iconKey: "business", colorKey: "success" },
  { id: "cat-inc-gift", name: "Gift", type: "income", iconKey: "gift", colorKey: "success" },
  { id: "cat-exp-food", name: "Food", type: "expense", iconKey: "food", colorKey: "danger" },
  { id: "cat-exp-transport", name: "Transport", type: "expense", iconKey: "transport", colorKey: "danger" },
  { id: "cat-exp-bills", name: "Bills", type: "expense", iconKey: "bills", colorKey: "danger" },
  { id: "cat-exp-shopping", name: "Shopping", type: "expense", iconKey: "shopping", colorKey: "danger" },
  { id: "cat-exp-health", name: "Health", type: "expense", iconKey: "health", colorKey: "danger" },
  { id: "cat-exp-airtime", name: "Airtime", type: "expense", iconKey: "airtime", colorKey: "danger" }
] as const;

// Mirrors AppConstants.supportedCurrencies in the Flutter app (default XAF).
export const SUPPORTED_CURRENCIES = [
  { code: "XAF", label: "Central African CFA Franc", symbol: "FCFA" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦" }
] as const;

export const DEFAULT_CURRENCY = "XAF";

export const DEFAULT_LANGUAGE = "en";

export const COMING_SOON_MESSAGE =
  "This path stays visible in the UI, but it is not active in the current web phase yet.";
