# Master Project Plans and PRDs

This document contains detailed Product Requirements Documents (PRDs) and implementation plans for the 6 portfolio projects currently lacking interactive demos. Each plan is designed to be as technically and experientially deep as the *Mind Coach* demo, leveraging the existing stack (React, Supabase, n8n, Edge Functions) to create comprehensive, agentic, and stateful simulations.

---

## 1. BharatPe Unity Card Demo (Fintech Simulator)

### 1.1 Executive Summary
A deep interactive simulator for a co-branded credit card lifecycle. Users experience the 0-to-1 journey of a credit card: onboarding (KYC), underwriting, real-time limit assignment, and a gamified dashboard for card usage, statement generation, and rewards.

### 1.2 User Journey
1. **Discovery**: Landing page detailing the card's value prop.
2. **Onboarding & KYC**: Simulated video KYC and document upload.
3. **Underwriting**: Supabase Edge Function calls an n8n workflow simulating a credit bureau fetch (CIBIL score) and runs a mock risk model to assign a dynamic credit limit and APR.
4. **Dashboard**: 
   - View virtual card (flip animation).
   - "Simulate Transaction" button (e.g., "Buy Coffee", "Buy Laptop").
   - Transactions are processed by an edge function that handles approvals/declines based on available limit and mock fraud rules.
5. **Rewards**: Earn "Unity Coins" on transactions, with a mini-store to redeem them.

### 1.3 Technical Architecture
- **Supabase Tables**: `unity_card_profiles`, `unity_card_accounts` (limit, available_balance, apr), `unity_card_transactions`, `unity_card_rewards`.
- **Edge Functions**: 
  - `unity-card-underwrite`: Triggers n8n risk workflow.
  - `unity-card-transact`: Handles transaction atomicity, limit deduction, and rewards calculation.
- **n8n Orchestration**: Workflow for "Credit Underwriting" that takes mock PII, generates a deterministic credit score, and outputs a credit decision JSON.
- **Frontend**: React-based dashboard, CSS 3D transforms for the virtual card, Recharts for spend analytics.

---

## 2. Postpe & Personal Loans Demo (BNPL / Lending Simulator)

### 2.1 Executive Summary
A "Scan & Pay Later" and Personal Loan disbursement simulator. It showcases real-time lending capabilities, specifically highlighting the "EMI on QR" feature.

### 2.2 User Journey
1. **Entry**: App interface with a camera viewfinder simulation (Scan QR).
2. **Scan & Pay**: User clicks "Scan QR" (loads a mock merchant QR for an electronics store).
3. **EMI on QR**: The system recognizes a large transaction (e.g., Rs. 40,000) and instantly prompts "Convert to EMI?".
4. **Dynamic Sliders**: User adjusts loan tenure (3, 6, 9 months). The UI recalculates EMI, interest, and processing fees dynamically.
5. **Real-time Disbursal**: User accepts. An edge function simulates E-Nach validation and instantly updates the merchant's ledger and the user's loan portfolio.
6. **Loan Dashboard**: View active loans, upcoming EMI calendar, and a "Make Payment" simulation.

### 2.3 Technical Architecture
- **Supabase Tables**: `postpe_users`, `postpe_loans` (principal, tenure, apr, status), `postpe_emi_schedules` (due_date, amount, status).
- **Edge Functions**:
  - `postpe-checkout`: Calculates EMI permutations dynamically.
  - `postpe-disburse`: Generates the amortized EMI schedule and inserts rows into `postpe_emi_schedules`.
- **Frontend**: Mobile-first UI mimicking a fintech app, interactive slider components for EMI calculation, calendar view for repayments.

---

## 3. Mi Pay & Device Financing Demo (E-commerce Financing)

### 3.1 Executive Summary
An embedded finance simulator integrated into a mock e-commerce checkout flow. It demonstrates how "Mi Credit Lite" increases conversion by offering instant device financing at the point of sale.

### 3.2 User Journey
1. **Storefront**: User browses a mock Xiaomi store and adds a flagship phone to the cart.
2. **Checkout**: At payment, alongside Credit Card/UPI, a "Mi Device Financing" option appears with a tag "0% EMI available".
3. **Instant Approval**: User selects financing. A modal asks for their PAN (mocked). 
4. **Risk Orchestration**: n8n workflow evaluates the user's "device data" (mocked telemetry like device age, usage patterns) combined with traditional credit scoring.
5. **Contract Generation**: A dynamic PDF/HTML loan contract is generated.
6. **Completion**: Order is successful, and the user is redirected to the "Mi Pay" dashboard to view their device loan.

### 3.3 Technical Architecture
- **Supabase Tables**: `mipay_products`, `mipay_orders`, `mipay_contracts`.
- **Edge Functions**: `mipay-risk-engine` (calls n8n).
- **n8n Orchestration**: Alternative data underwriting workflow (evaluates mock telemetry + credit score to approve/decline).
- **Frontend**: E-commerce cart flow, seamless modal transitions, dynamic contract rendering.

---

## 4. WealthWise AI Demo (Agentic Personal Finance)

### 4.1 Executive Summary
An AI-native personal finance assistant that goes beyond simple charting. It uses Agentic RAG to analyze a user's mock bank transactions, identify patterns, and offer actionable, hyper-personalized financial advice via an interactive chat interface.

### 4.2 User Journey
1. **Account Sync**: User "connects" mock bank accounts (checking, savings, credit). The DB is seeded with 3 months of varied transactions (groceries, subscriptions, salary).
2. **Dashboard Overview**: Cash flow charts, top spending categories, and a "Financial Health Score".
3. **Proactive AI Insights**: The dashboard surfaces an alert: "You've spent 20% more on dining this month. Chat with WealthWise to optimize."
4. **Agentic Chat**: 
   - User asks: "How can I save for a vacation?"
   - AI Agent uses n8n to query the user's transaction history, identifies redundant subscriptions (e.g., two streaming services), and proposes a customized budget plan.

### 4.3 Technical Architecture
- **Supabase Tables**: `wealth_users`, `wealth_transactions` (amount, category, date, merchant), `wealth_insights`.
- **Edge Functions**: `wealth-chat` (proxies to n8n).
- **n8n Orchestration**:
  - **Tool-Calling LLM**: Has access to tools like `GetTransactions`, `GetCashflow`, `CreateBudget`.
  - Analyzes the specific user's DB rows to provide grounded financial advice.
- **Frontend**: Complex dashboard with Recharts/Chart.js + an integrated chat drawer similar to Mind Coach's therapist chat.

---

## 5. ChainSecure ID Demo (Web3 Decentralized Identity)

### 5.1 Executive Summary
A simulation of a blockchain-based identity verification system. It demystifies Web3 identity by showing a tangible flow: acquiring a Verifiable Credential (VC) and using it for 1-click KYC across different DApps.

### 5.2 User Journey
1. **Issuer Portal (Government/Bank)**: User verifies their identity (mock form) and is issued a "KYC Credential" VC. 
2. **Wallet View**: The user sees their simulated Web3 Wallet containing this cryptographic credential.
3. **Verifier Portal (DeFi App)**: User navigates to a mock DeFi trading platform.
4. **Zero-Knowledge Login**: Instead of filling out a form, the user clicks "Connect with ChainSecure". A signing request pops up. 
5. **Verification**: The system verifies the VC cryptographically (simulated via Edge Function) without storing the user's raw PII on the DeFi app's database.

### 5.3 Technical Architecture
- **Supabase Tables**: `chainsecure_wallets` (public_key), `chainsecure_credentials` (credential_id, hash, status).
- **Edge Functions**: 
  - `chainsecure-issue`: Generates a mock signed JWT/VC.
  - `chainsecure-verify`: Validates the VC signature and returns a boolean.
- **Frontend**: Split-screen or multi-step UI to show the perspective of the Issuer, the Wallet, and the Verifier App.

---

## 6. AdGenius Demo (Generative AI Marketing SaaS)

### 6.1 Executive Summary
A B2B SaaS tool simulation that leverages LLMs to automate ad copy generation and simulates real-time A/B testing performance to prove ROI.

### 6.2 User Journey
1. **Campaign Creation**: User enters a product URL or description (e.g., "Eco-friendly running shoes").
2. **Generation via n8n**: 
   - System scrapes/reads the product context.
   - LLM generates 3 distinct ad variants (e.g., Emotional, Functional, FOMO).
3. **Ad Review**: User reviews the generated copy, headlines, and mock AI-generated imagery (using placeholders or Unsplash).
4. **Simulated Live Campaign**: User clicks "Launch Test".
5. **Real-time Analytics**: A dashboard shows simulated real-time metrics (Impressions, Clicks, Conversions) updating every few seconds. After a simulated "7 days", the system auto-declares a winning variant based on CTR.

### 6.3 Technical Architecture
- **Supabase Tables**: `adgenius_campaigns`, `adgenius_variants` (copy, headline, platform), `adgenius_metrics` (time_series_data).
- **Edge Functions**: 
  - `adgenius-generate`: Triggers n8n to call OpenAI/Anthropic to generate the copy variants.
  - `adgenius-simulate-traffic`: A cron-like edge function (or client-side simulation) that populates `adgenius_metrics` with probabilistic click data biased towards one "winning" variant.
- **n8n Orchestration**: Prompt chaining workflow: `Extract Features -> Identify Audience -> Generate Copy Variations`.
- **Frontend**: SaaS dashboard, split-view A/B test results, real-time animated charts.
