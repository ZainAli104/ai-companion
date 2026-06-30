# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SaaS AI Companion app: users create custom AI characters and chat with them. Each chat turn runs an LLM (Replicate Llama-2-13b) augmented with per-companion conversation memory backed by Upstash Redis (recent history) and Pinecone (vector search over seeded background). Built on Next.js 14 App Router.

## Commands

```shell
npm run dev          # dev server (localhost:3000)
npm run build        # production build (runs prisma generate via postinstall)
npm run lint         # next lint
npx prisma db push   # sync schema to the Postgres DB (no migrations dir)
npx prisma generate  # regenerate client after schema edits
node scripts/seed.ts # seed the Category table — run once on a fresh DB
```

There is no test suite. The DB is Postgres (Neon) despite the README mentioning MySQL.

## Architecture

### Route groups (App Router)
Three layout groups under `app/`, each with its own `layout.tsx`:
- `(auth)` — Clerk sign-in/sign-up pages
- `(root)` — main dashboard, companion create/edit form, settings (subscription)
- `(chat)` — the chat UI for a single companion

`middleware.ts` runs Clerk `authMiddleware` over everything; only `/api/webhook` is a public route. Most pages are server components that query Prisma directly (no fetch to own API).

### The chat / memory pipeline — `app/api/chat/[chatId]/route.ts`
This is the core of the app. Per request it:
1. Rate-limits via `lib/rate-limit.ts` (Upstash, 10 req / 10s, keyed on `req.url + user.id`).
2. Persists the user message to the `Message` table (Prisma `companion.update` with nested create).
3. Uses `MemoryManager` (`lib/memory.ts`) to: seed Redis history from `companion.seed` if empty, append the new user line, read the last 30 lines, and run a Pinecone `similaritySearch` (top 3, filtered by `fileName = <companionId>.txt`) to pull `relevantHistory`.
4. Composes a single prompt string (companion `instructions` + `relevantHistory` + `recentChatHistory`) and invokes the Replicate Llama-2 model, streaming via `LangChainStream` / `StreamingTextResponse` from the `ai` package.
5. Cleans the response (strips commas, takes first line), writes it back to Redis history and the `Message` table, returns it as a stream.

`MemoryManager` is a singleton; Redis keys are `${companionName}-${modelName}-${userId}` where `companionName` is actually the companion **id**.

### Subscription / billing (Stripe)
- `lib/payment-gateway/subscription.ts` `checkSubscription()` — gates "create companion" on an active sub (price set + period end + 1 day grace). Free tier = chat only.
- `app/api/stripe/route.ts` GET — returns a Stripe billing-portal URL if the user has a customer id, otherwise a Checkout session ($9.99/mo "Companion Pro"), with `userId` in metadata.
- `app/api/webhook/route.ts` — Stripe webhook; on `checkout.session.completed` creates the `UserSubscription` row, on `invoice.payment_succeeded` updates the period end. Must stay a public route (see middleware).

### Data model (`prisma/schema.prisma`)
`Category 1—* Companion 1—* Message`, plus a standalone `UserSubscription` keyed by Clerk `userId`. `Message.companionId` cascades on delete. `Companion.seed` is the seed conversation text used to bootstrap memory.

## Conventions
- Path alias `@/*` maps to the repo root (e.g. `@/lib/prismadb`).
- `lib/prismadb.ts` exports a global Prisma singleton — always import this, never `new PrismaClient()`.
- API routes return bare `NextResponse` strings with status codes and log errors as `console.log("[ROUTE_TAG]", err)`.
- UI is shadcn/ui (`components/ui`, see `components.json`) + Tailwind; client state via Zustand (e.g. `hooks/use-pro-modal.tsx`).

## External services (all via env vars)
Clerk (auth), Replicate (LLM), OpenAI (embeddings only, for Pinecone), Pinecone (vector store), Upstash Redis (history + rate limit), Cloudinary (companion images), Stripe (billing), Postgres (`DATABASE_URL`). See README for the full `.env` list.
