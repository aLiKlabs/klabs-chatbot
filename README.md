# K-Labs Reusable Website AI Chatbot

An internal platform for K-Labs administrators to create isolated, knowledge-grounded AI assistants for client websites. Each project has separate configuration, domains, content, conversations, feedback, leads, and analytics. There is no public signup, billing, subscription, or customer dashboard.

Phase 1 is implemented: secure administrator authentication, project creation and lifecycle management, a responsive dashboard, the complete initial Supabase schema, private storage buckets, pgvector retrieval foundations, and Row Level Security.

## Architecture

- **Dashboard:** Next.js App Router, React, strict TypeScript, and Tailwind CSS.
- **Authentication:** Supabase Auth sessions refreshed by the Next.js request proxy. Access requires both a valid Supabase user and an email in `ADMIN_ALLOWED_EMAILS`.
- **Authorization:** PostgreSQL RLS permits data access only to authenticated users with the `administrator` role in Supabase app metadata or `profiles`.
- **Database:** Supabase PostgreSQL with project-scoped tables, foreign keys, indexes, timestamps, and cascade rules.
- **Storage:** private `chatbot-documents` and `chatbot-branding` Supabase Storage buckets.
- **Retrieval foundation:** pgvector column and a project-filtered `match_document_chunks` function. Public browser access is revoked.
- **Deployment target:** Vercel for Next.js and hosted Supabase for database, auth, and storage.

Later phases add ingestion, OpenAI embeddings and Responses API streaming, the SSRF-safe crawler, embeddable widget, conversations, and analytics. See [PLAN.md](./PLAN.md).

## Prerequisites

- Node.js 20.9 or newer
- npm 10 or newer
- A Supabase project
- Supabase CLI (recommended for local migrations)
- An OpenAI API key for Phases 2–3

## Local installation

```bash
git clone <repository>
cd klabs-website-chatbot
npm install
cp .env.example .env.local
```

Fill in the Supabase values and administrator allowlist, then run:

```bash
npm run dev
```

Open `http://localhost:3000`. The root route sends users to the protected dashboard or login page.

## Supabase setup

1. Create a Supabase project and record its project URL and anonymous key.
2. Disable public user registration in **Authentication → Providers → Email**. Administrators must be created by a trusted operator.
3. Apply migrations:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```

4. Create an administrator in the Supabase dashboard under **Authentication → Users**.
5. Set that user’s app metadata to:

   ```json
   { "role": "administrator" }
   ```

   If the user existed before the migration, also set `public.profiles.role` to `administrator`. New users receive a profile automatically.
6. Add the same email to `ADMIN_ALLOWED_EMAILS`. This independent server-side allowlist prevents an otherwise valid Supabase account from entering the dashboard.
7. Confirm that the migration created the private `chatbot-documents` and `chatbot-branding` buckets.

The migration enables `pgcrypto` and `vector`. `document_chunks.embedding` uses 1,536 dimensions, matching the example configuration. If a different embedding dimension is selected, update both the migration typmod/function signature and `OPENAI_EMBEDDING_DIMENSIONS` before applying the migration.

For local Supabase:

```bash
supabase start
supabase db reset
```

`supabase db reset` applies migrations and then `supabase/seed.sql`. The demo seed waits for an administrator and safely skips itself when one does not exist.

## Environment variables

Copy `.env.example` to `.env.local`. Never commit `.env.local` or real credentials.

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Browser-safe | Canonical dashboard/widget base URL; locally `http://localhost:3000`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe | Supabase anonymous key. RLS still applies. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Trusted public endpoints and ingestion jobs in later phases. Never import into client code. |
| `SUPABASE_DATABASE_URL` | Server/operations only | Direct PostgreSQL connection for operational tooling. |
| `OPENAI_API_KEY` | Server only | Embeddings and Responses API access. |
| `OPENAI_CHAT_MODEL` | Server only | Chat model name; code must not hardcode it. |
| `OPENAI_EMBEDDING_MODEL` | Server only | Embedding model name. |
| `OPENAI_EMBEDDING_DIMENSIONS` | Server only | Vector dimension; must match the migration. |
| `ADMIN_ALLOWED_EMAILS` | Server only | Comma-separated, case-insensitive administrator allowlist. |
| `CRON_SECRET` | Server only | Authenticates scheduled internal work. |
| `INGESTION_SECRET` | Server only | Authenticates trusted ingestion workers. |
| `RATE_LIMIT_PROVIDER` | Server only | `memory` locally; Redis-compatible provider in production. |
| `UPSTASH_REDIS_REST_URL` | Server only | Production Upstash REST endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | Server only | Production Upstash REST credential. |
| `DEFAULT_MAX_RETRIEVAL_RESULTS` | Server only | Maximum initial vector matches. |
| `DEFAULT_SIMILARITY_THRESHOLD` | Server only | Minimum accepted cosine similarity. |
| `DEFAULT_MAX_CONTEXT_TOKENS` | Server only | Maximum retrieved context sent to the model. |
| `DEFAULT_MAX_OUTPUT_TOKENS` | Server only | Default assistant output ceiling. |

The app validates environment values when the relevant Supabase client is created. A missing or malformed public Supabase value produces a development-safe configuration error; secrets are never included in browser bundles.

## Administrator workflow

1. Sign in at `/login` with an approved Supabase email/password account.
2. Select **Create project**.
3. Enter the client website, supported languages, initial bot name, welcome message, colour, and optional contact details.
4. Open the generated project workspace.
5. Edit details, activate/pause the project, or archive it.

New projects start in `draft`. Later public endpoints will accept only `active` projects and approved domains.

## Database isolation and security

- Every client-owned table contains `project_id`.
- RLS is enabled on every application table; anonymous users receive no direct table policies.
- The public widget key is random and unique but is only an identifier, never a database credential.
- `match_document_chunks` filters both chunks and sources by the supplied project and requires an administrator for direct authenticated calls. Later server-only public chat handlers use trusted service access after validating active status, domain, rate limits, and public key.
- Uploaded documents and branding assets are private. Administrators access them through authenticated policies; public URLs are not created.
- The service-role key, database URL, OpenAI key, and internal identifiers must never be sent to the widget.
- Client content is treated as untrusted reference text. Later answer prompts will place protected instructions outside retrieved content.

## Development and verification

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

`test:e2e` is wired for Playwright; full browser scenarios arrive with the knowledge/chat/widget phases when those user journeys exist. Unit tests currently cover project validation, protocol restrictions, administrator allowlisting, RLS coverage, private buckets, and project-scoped vector search.

## Knowledge ingestion (Phase 2)

The protected Knowledge route is already project-scoped. Phase 2 will add manual text/FAQ input and PDF/DOCX/TXT/Markdown uploads, then extract, clean, hash, chunk, embed, and store content. Original documents use the private `chatbot-documents` bucket. Unchanged hashes will skip redundant embeddings.

## Website ingestion (Phase 4)

The crawler will accept only validated HTTP(S) URLs, resolve DNS, block private/link-local/metadata addresses, revalidate redirects, obey limits, deduplicate same-domain pages, and remove navigation/script/footer noise. It is intentionally not part of the Phase 1 foundation.

## Widget installation (Phase 5)

The installation route will generate:

```html
<script
  src="https://chat.klabs.co/widget.js"
  data-chatbot-key="PUBLIC_PROJECT_KEY"
  async>
</script>
```

The future widget will call controlled server endpoints only. It will not query Supabase tables directly or contain secrets.

## Vercel deployment

1. Push the repository to GitHub and import it into Vercel.
2. Set all `.env.example` variables for Preview and Production as appropriate.
3. Use the default Next.js build command, `npm run build`.
4. Apply Supabase migrations before activating any project.
5. Add the production host (for example `chat.klabs.co`) in Vercel Domains and configure the DNS record Vercel provides.
6. Add the production URL to Supabase Authentication URL configuration.
7. Keep `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DATABASE_URL`, `OPENAI_API_KEY`, and secrets server-only.

## Known limitations

- Phase 1 does not ingest or embed content, call OpenAI, crawl websites, or serve a public widget.
- Source and conversation totals are live, but they remain zero until those later-phase data flows are used.
- Search UI is visually prepared but disabled until server-side filtering is added.
- Full Playwright flows require a configured Supabase test project and arrive with later phases.
- Authentication currently uses email/password; magic-link authentication can be enabled without public registration in a later hardening pass.

## Troubleshooting

- **Redirected to login after signing in:** confirm the exact email is present in `ADMIN_ALLOWED_EMAILS` and the user’s app metadata/profile role is `administrator`.
- **Projects cannot be loaded:** apply the migration and verify RLS role metadata.
- **Invalid Supabase URL during development:** set all three `NEXT_PUBLIC_*` variables in `.env.local`, then restart the development server.
- **Vector dimension error:** make the migration’s `vector(1536)` and `OPENAI_EMBEDDING_DIMENSIONS` match before inserting embeddings.
- **Storage upload denied:** verify the bucket name, authenticated session, administrator role, and storage policies from the migration.
- **Build differs from local:** use a supported Node version and run `npm ci` from the committed lockfile.
