# Moniilog — Web Application (PWA)

**Progressive Web App for Smart Personal Financial Management**

Moniilog Web is a high-performance, offline-capable Progressive Web App (PWA) built with React 18, Vite, TypeScript, Tailwind CSS, and Dexie.js (IndexedDB). It syncs in real time with the central Moniilog Supabase PostgreSQL database.

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

## Web Task Registry & Roadmap

> [!IMPORTANT]
> **Workflow Protocol:** Tasks specific to the web application are tracked here. When completed, tasks are struck through (`~~[x] ...~~`). Proposed tasks must be approved before implementation.

### Completed Web Milestones
- ~~[x] **WEB-001:** Build responsive desktop and mobile web interface with Tailwind CSS and Radix UI~~
- ~~[x] **WEB-002:** Implement Dexie.js IndexedDB local storage mirroring backend financial tables~~
- ~~[x] **WEB-003:** Integrate Supabase Authentication (Email/Password, Google OAuth, Google One-Tap)~~
- ~~[x] **WEB-004:** Implement background delta synchronization engine with Supabase Realtime channels~~
- ~~[x] **WEB-005:** Create Financial Dashboard with net worth, monthly cash flow, and spending breakdown charts~~
- ~~[x] **WEB-006:** Implement Budget Manager and Recurring Transaction Manager interfaces~~
- ~~[x] **WEB-007:** Implement CSV statement import with column mapping and duplicate detection~~
- ~~[x] **WEB-008:** Integrate In-App Financial Assistant chatbot interface~~
- ~~[x] **WEB-009:** Configure PWA manifest and service worker for desktop/mobile installability~~

### Current / In-Progress Tasks
- [ ] **WEB-010: Multi-Device Sync Verification**: Validate real-time record reflection on Web when changes occur on Mobile or WhatsApp.
- [ ] **WEB-011: WhatsApp Linking Modal**: Create UI dialog displaying a QR code / deep link to pair user account with WhatsApp bot.

### Proposed Upcoming Tasks (Pending Approval)
- [ ] **WEB-012: PDF Statement Export**: Export formatted monthly income/expense statements directly in browser.
- [ ] **WEB-013: Production Deployment**: Configure CI/CD and deploy to Vercel or Firebase App Hosting.

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
