# K-Labs Website Chatbot Implementation Plan

This repository is delivered incrementally so each phase remains deployable and testable.

## Phase 1 — Foundation

- [x] Inspect repository and select npm (no existing lockfile; requested workflow uses npm).
- [x] Initialize Next.js App Router with strict TypeScript and Tailwind CSS.
- [x] Add validated environment configuration and Supabase browser/server clients.
- [x] Add secure administrator login, allowlist enforcement, protected routes, and sign-out.
- [x] Add complete initial PostgreSQL schema, pgvector support, indexes, triggers, and RLS.
- [x] Implement project create, edit, pause/resume, archive, and project navigation.
- [x] Add responsive dashboard states and accessible UI primitives.
- [x] Add unit tests and pass lint, typecheck, tests, and production build.

Deliverable: an approved K-Labs administrator can authenticate and manage isolated chatbot projects.

## Phase 2 — Knowledge ingestion

- [x] Manual text and FAQ sources.
- [x] PDF, DOCX, TXT, and Markdown uploads to private storage.
- [x] Extraction, cleaning, semantic chunking, hashing, embeddings, job states, and reprocessing.

## Phase 3 — Retrieval chatbot (current)

- [x] Project-scoped vector retrieval and bounded context.
- [x] Responses API answer generation with safe fallback behaviour.
- [x] Conversation and message storage by project.
- [x] Fully functional administrator Testing page and private retrieval debug panel.
- [x] Development-only grounded local response mode for testing without API charges.

## Phase 4 — Website crawler

- SSRF-safe crawling, robots/sitemap handling, content extraction, deduplication, limits, and crawl previews.

## Phase 5 — Embeddable widget

- Isolated asynchronous widget, configuration endpoint, streaming chat, English/Arabic, RTL, feedback, contact actions, and installation code.

## Phase 6 — Conversations and analytics

- Transcript browser, unanswered questions, feedback, leads, per-project analytics, and usage/cost reporting.

## Phase 7 — Hardening

- Production rate limiting, domain enforcement, security/e2e coverage, accessibility, performance, logging, deployment verification, and operational documentation.

## Guardrails

- No public registration, subscriptions, billing, marketplace, or customer accounts.
- Every client-owned record is project-scoped and protected by RLS.
- Browser code never receives service-role or OpenAI credentials.
- Public keys identify active widgets but never authorize direct database access.
- AI answers use retrieved project knowledge only and fall back safely when unsupported.
