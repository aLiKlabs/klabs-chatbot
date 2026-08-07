# K-Labs Reusable Website AI Chatbot

K-Labs’ multi-project, knowledge-grounded website chatbot platform. The existing dark Next.js dashboard and embeddable widget remain the frontend. Laravel is now the secure API and application backend, with MySQL as the authoritative database and Laravel private storage for uploaded documents.

## Architecture

- **Dashboard and widget:** Next.js App Router, React, TypeScript, Tailwind CSS.
- **Backend API:** Laravel 13 under `backend/`.
- **Database:** MySQL 8.4 with UUID project-scoped tables and foreign keys.
- **Authentication:** Laravel Sanctum API tokens stored in a secure HTTP-only Next.js cookie.
- **Authorization:** Laravel middleware, administrator roles, an independent email allowlist, and an internal service key for widget/server requests.
- **Storage:** Laravel’s private local disk (`backend/storage/app/private`) by default. It can be switched to S3 through Laravel filesystem configuration.
- **Knowledge processing:** The Next.js server extracts/chunks content and calls the Laravel API for private files, transactional chunk replacement, embeddings, retrieval, and usage records.
- **AI:** OpenAI Responses and Embeddings APIs, with deterministic mock embeddings for free local testing.

Supabase is no longer required at runtime.

## Requirements

- PHP 8.3+
- Composer 2
- Laravel CLI
- MySQL 8+
- Node.js 20.9+
- npm 10+

## 1. Configure MySQL and Laravel

Create a dedicated database and user in MySQL. Do not use the MySQL root account in the application:

```sql
CREATE DATABASE klabs_chatbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'klabs_chatbot'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-strong-password';
GRANT ALL PRIVILEGES ON klabs_chatbot.* TO 'klabs_chatbot'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Copy and configure Laravel:

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
```

Set these values in `backend/.env`:

```dotenv
DB_DATABASE=klabs_chatbot
DB_USERNAME=klabs_chatbot
DB_PASSWORD=replace-with-a-strong-password
ADMIN_ALLOWED_EMAILS=you@klabs.co
ADMIN_EMAIL=you@klabs.co
ADMIN_PASSWORD=replace-with-your-admin-password
LARAVEL_INTERNAL_KEY=the-same-random-64-character-value-used-by-nextjs
```

Then create the schema and administrator:

```bash
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8000
```

## 2. Configure and run the dashboard

From the project root:

```bash
cp .env.example .env.local
npm install
```

Generate a secure shared internal key (for example, `openssl rand -hex 32`) and place the same value in both `backend/.env` and `.env.local`. Do not commit either file.

Set:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
LARAVEL_API_URL=http://127.0.0.1:8000
LARAVEL_INTERNAL_KEY=the-same-value-used-in-backend-env
ADMIN_ALLOWED_EMAILS=you@klabs.co
```

Keep the existing OpenAI and retrieval settings, then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Laravel must also be running on port 8000.

## Free local testing

Set `MOCK_EMBEDDINGS=true` in `.env.local`. Document extraction, private storage, chunking, MySQL persistence, project-scoped retrieval, the dashboard tester, and the public widget can then be exercised without OpenAI API charges.

## Database schema

Laravel migrations create:

- users, profiles, and Sanctum access tokens;
- projects, appearance, instructions, and approved domains;
- knowledge sources, pages, chunks, and ingestion jobs;
- conversations, messages, feedback, leads, and usage events.

Embedding vectors are stored as JSON in MySQL. Laravel performs project-filtered cosine similarity for semantic retrieval. This keeps MySQL compatibility without requiring PostgreSQL/pgvector.

## Security

- The browser never receives MySQL credentials, the Laravel internal key, or the OpenAI key.
- Admin access requires a valid Sanctum token, administrator role, and allowlisted email.
- Public widget requests use controlled Next.js endpoints; the Next.js server uses the Laravel internal key.
- The data gateway allowlists tables, validates columns, restricts operators, and is unavailable anonymously.
- Uploads are private, path-normalized, limited to 20 MB, and downloaded only through authenticated/internal Laravel routes.
- Every client-owned record is scoped by `project_id`.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build

cd backend
./vendor/bin/pint --test
php artisan test
```

## Deployment

Deploy the Next.js frontend and Laravel API separately. Laravel can run on a VPS, Laravel Forge, Laravel Cloud, or another PHP host with MySQL. Set `LARAVEL_API_URL` to the private/public HTTPS API URL, use matching internal keys, configure CORS to the dashboard origin, run `php artisan migrate --force`, and use S3-compatible private storage when multiple Laravel instances are deployed.
