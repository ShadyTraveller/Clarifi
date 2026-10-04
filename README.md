# Yavamo

Website: https://www.yavamo.ca. The repository directory and Supabase/Vercel resource names remain Clarifi. Existing database RPC and storage identifiers are retained for compatibility.

A responsive service workspace for dispatch and technicians. Requests, the dispatch map and estimates sit alongside the existing Clients, Invoices and Team views. Services cover security film, locksmith rekey/lock changes, windows, doors and skincare.

## Development

Use Node.js 24, then run npm ci and npm run dev. Run npm run check, npm test and npm run build before publishing. The browser smoke test uses Playwright; set PLAYWRIGHT_MODULE and CHROME_PATH when using an external runtime.

## Configuration

Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the existing Supabase project. Free drafting rules are enabled by default and require no API credits. They extract labelled contact fields and build editable template scopes without external AI calls. Photos, live sourcing and translation require a provider. To opt into OpenAI later, set ASSISTANT_PROVIDER=openai and set OPENAI_API_KEY only in the server environment. Never prefix it with NEXT_PUBLIC_, commit it, or include an environment file in deployment uploads. Production and preview secrets belong in Vercel encrypted/sensitive environment variables. OPENAI_MODEL is optional (defaults to gpt-4.1); MAPQUEST_API_KEY is optional for geocoding.

The local secret belongs in ignored .env.local. After a production build, node tests/security-scan.cjs verifies that it is absent from browser assets. API errors return safe messages without credentials.

## Workflows

Create an editable request from call notes, or start a blank draft. Assignment requires matching specialties and a recent technician location; otherwise it stays unassigned. Estimates combine saved requests, trade templates, notes, photos and confirmed pricing. Supplier alternatives are sourced from Amazon Canada and Home Depot Canada; unavailable prices need staff confirmation. Client previews exclude internal supplier costs.

Area uses width × height × count ÷ 144 for inch measurements. Photo assessments provide evidence suggestions; staff confirm checklist completion. Spanish translation changes answers while keeping the interface English. Alt+1/2/3 switch office views; Alt+N creates a request and Alt+E creates an estimate.

Approval links use the existing Supabase customer function and expiring, hashed tokens. Payments and automated email/text delivery are deferred. OpenAI features require API credits; blank drafts remain available when the provider cannot respond.
