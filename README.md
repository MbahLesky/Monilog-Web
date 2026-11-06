# Moniilog — Web Application (PWA)

**Progressive Web App for Smart Personal Financial Management**

Moniilog Web is a high-performance, offline-capable Progressive Web App (PWA) built with React 18, Vite, TypeScript, Tailwind CSS, and Dexie.js (IndexedDB). It syncs in real time with the central Moniilog Supabase PostgreSQL database.

- **Production Domain:** `https://web.moniilog.com`
- **Main Website:** `https://moniilog.com`

---

## Key Features

- **Progressive Web App (PWA):** Installable on desktop and mobile browsers with service worker caching.
- **Client-Side Offline Storage:** Local IndexedDB persistence via **Dexie.js** mirroring cloud entities.
- **Realtime Cloud Synchronization:** Subscribes to Supabase Realtime channels (`accounts`, `categories`, `transactions`, `transfers`, `budgets`, `recurring_transactions`) with delta sync.
- **Authentication:** Supabase Auth supporting Email & Password with Resend SMTP autoconfirm, Google OAuth, and Google One-Tap.
- **Financial Dashboard:** Net worth metrics, monthly cash flow charts, recent ledger activities, and category breakdowns.
- **Budget & Recurring Managers:** Complete visual managers for spending limits, recurrence rules, and active subscriptions.
- **In-App AI Chatbot:** Web financial assistant for natural language transaction logging and insights.
- **Data Portability:** Full CSV import with column mapping and duplicate detection; CSV and JSON export.

---

## Task Registry & Roadmap

All active, completed, and proposed roadmap tasks for the web app are managed in [**TODO.md**](./TODO.md).

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Verify `.env.local` has your Supabase connection parameters:
```env
VITE_SUPABASE_URL=https://hvtoqnhfqwftbwqxgcbd.supabase.co
VITE_SUPABASE_ANON_KEY=<your_anon_key>
VITE_APP_ENV=development
VITE_ENABLE_PWA=true
```

### 3. Run Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### 4. Build for Production
```bash
npm run build
```
