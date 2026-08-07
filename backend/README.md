# K-Labs Chatbot API

Laravel API for the K-Labs reusable website chatbot. It provides authentication, project and knowledge-base persistence, private document storage, retrieval, analytics, and the internal API used by the Next.js dashboard and public widget.

For the complete application overview and frontend setup, see the [root README](../README.md).

## Requirements

- PHP 8.3 or newer
- Composer 2
- MySQL 8 or newer
- Node.js 20.9+ and npm 10+ (required by the frontend in the parent directory)

## Installation

### 1. Create the database

Create a database and application user. Use a strong password in place of the example below.

```sql
CREATE DATABASE klabs_chatbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'klabs_chatbot'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-strong-password';
GRANT ALL PRIVILEGES ON klabs_chatbot.* TO 'klabs_chatbot'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 2. Install PHP dependencies and configure the environment

From this `backend` directory:

```bash
composer install
cp .env.example .env
php artisan key:generate
```

Edit `.env` and set at least these values:

```dotenv
APP_URL=http://127.0.0.1:8000
DB_DATABASE=klabs_chatbot
DB_USERNAME=klabs_chatbot
DB_PASSWORD=replace-with-a-strong-password

ADMIN_ALLOWED_EMAILS=you@klabs.co
ADMIN_EMAIL=you@klabs.co
ADMIN_PASSWORD=replace-with-a-strong-password

# Generate a long random value. It must exactly match the value in ../.env.local.
LARAVEL_INTERNAL_KEY=replace-with-at-least-32-random-characters
```

### 3. Create the schema and start the API

```bash
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8000
```

The API will be available at `http://127.0.0.1:8000`.

## Run the complete application

The API is designed to run alongside the Next.js frontend. In a second terminal, from the repository root:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set `LARAVEL_API_URL=http://127.0.0.1:8000` in the root `.env.local`, and copy the exact same `LARAVEL_INTERNAL_KEY` value from this API's `.env`. Full configuration details are in the [root README](../README.md).

## Useful commands

```bash
# Run backend tests
php artisan test

# Check code style
./vendor/bin/pint --test

# Apply code style fixes
./vendor/bin/pint

# Run database migrations
php artisan migrate
```

## Security notes

- Do not commit `.env`; use `.env.example` as the configuration template.
- `LARAVEL_INTERNAL_KEY`, database passwords, and OpenAI keys must remain private.
- Uploaded source documents are stored privately and are served only through authenticated or internal routes.
- Configure HTTPS, a production database user, and private object storage before deploying.
