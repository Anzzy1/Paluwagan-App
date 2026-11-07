# Paluwagan 💰

An online paluwagan (Filipino rotating savings circle). Built with Expo (SDK 58) and Supabase.

There are no paper slips or notebooks. Paluwagan provides:
- a **provably fair Digital Bunot** (draw)
- **proof-of-payment receipts**
- **auto-reminders**
- a **Tiwala Score** for every member

The app never holds money. Members pay each other directly through GCash, Maya or a bank, and the app keeps the record.

## Features

| | |
|---|---|
| **Verifiable draw** | Commit–reveal randomisation. A SHA-256 commitment to a secret seed is published when the circle locks; the seed is revealed at the draw, and any member can recompute the payout order on their own device. |
| **Proof of payment** | Members upload a receipt; the payout recipient confirms each transfer (two-sided sign-off). |
| **Reminders** | Push notifications 3 days before, 1 day before, on the due date, and when overdue, plus one-tap nudges from the admin or recipient. |
| **Trust Score** | An on-time payment record across all circles, shown to admins on join requests. |
| **Turn swaps** | Swap payout rounds with another member (their consent + admin approval). |
| **Split slots** | Two members share one slot, each contributing and receiving half. |
| **Ipon (personal savings)** | Save on your own: goals with a target date and savings plan (daily / weekly / payday / monthly), deposit and withdrawal log, on-track status, weekly streak. A goal can also count a circle's contributions. |
| **Ipon AI** | Chat with Ipon, an AI money buddy that reads your circles, dues, payouts and ipon to give advice that fits you. Also: AI savings plans per goal and a one-tap “Ipon’s take” insight. Powered by Claude via a Supabase Edge Function. |
| **Flexible schedules** | Hulog (contributions) daily, weekly, semi-monthly (15th and end of month), monthly, or custom (every N days). |
| **Sahod schedule** | Payouts can run on their own schedule, e.g. daily hulog with a weekly or kinsenas sahod. Each circle sets how often the pot goes out and the first sahod date. |
| **Date history** | In managed circles, open any past date to see who missed paying, check them off when they catch up, and track the total still unpaid. |
| **Join password** | Every online circle has a password (bcrypt-hashed, 5 tries per 15 minutes). Members join with the code, invite link or QR code, plus the password. |
| **Circle agreement** | Members accept the rules in-app; name and timestamp are recorded. |
| **Scam safeguards** | Warns when a circle mentions interest or returns; circles are invite-only. |
| **Responsive** | Mobile layout with bottom navigation; desktop/laptop layout with a sidebar, multi-column pages and dialogs. Light and dark mode. |
| **Demo mode** | “Explore the demo” on the sign-in screen opens the full app with sample data — no account needed. |

## Setup

1. **Install:** `npm install`
2. **Create a Supabase project** (free tier) at supabase.com.
3. **Run the migrations:** in **SQL Editor**, run `supabase/migrations/0001_init.sql`, then `0002_english_messages.sql`, then `0003_ipon.sql`, then `0004_schedule_password.sql`, then `0005_payout_schedule.sql`, then `0006_avatars.sql`, then `0007_delete_circle.sql`.
4. **Email OTP codes:** go to Authentication → Email Templates → *Magic Link* and add `{{ .Token }}` to the template so users receive a 6-digit code.
   - Phone login is optional and needs an SMS provider (e.g. Twilio) under Authentication → Providers → Phone.
5. **Env:** copy `.env.example` to `.env.local` and fill in your Project URL and publishable key (Settings → API).
6. **Run:** `npx expo start --web` for the browser (http://localhost:8081), or `npx expo start` and open in **Expo Go** on your phone.

### Ipon AI (optional)
The AI runs in the `ai` Edge Function, so the Claude API key never ships in the app.
1. Get an API key at https://platform.claude.com.
2. Deploy and set the secret:
   ```bash
   supabase functions deploy ai
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```
The app sends a text snapshot of the user's own data (circles, dues, goals, deposits, recent activity) with each request; chat history stays on the device. Model: `claude-opus-5-5`, with server-side refusal fallback enabled.

### Push reminders (optional)
Push notifications need a **development build**, because Expo Go on Android doesn't support remote push in SDK 53+.
1. Run `npx eas-cli@latest init`. This adds `extra.eas.projectId` to the app config.
2. Run `npx eas-cli@latest build --profile development`.
3. Deploy the function and set its secret:
   ```bash
   supabase functions deploy push
   supabase secrets set CRON_SECRET=<random-string>
   ```
4. Schedule the daily reminder. In the SQL editor, enable `pg_cron` and `pg_net`, then run:
   ```sql
   select cron.schedule('paluwagan-reminders', '0 1 * * *',  -- 9:00 AM Manila
     $$ select net.http_post(
          url := 'https://<project-ref>.supabase.co/functions/v1/push',
          headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<random-string>'),
          body := '{"mode":"reminders"}'::jsonb) $$);
   ```

## Tests

```bash
npm test            # Digital Bunot: determinism, permutation, fairness, verify
npm run test:sql    # Full lifecycle against real Postgres in Docker (RLS, draw, rounds, swaps, storage)
npx tsc --noEmit && npx eslint src
```

The JS shuffle (`src/lib/draw.ts`) and the SQL shuffle (`public.seeded_shuffle`) are checked against the same fixed vector, so the Verify button always agrees with the server.

## Architecture

```
src/app/                 Expo Router screens
  (auth)/                onboarding, login, OTP verify
  setup.tsx              first-run profile
  (app)/(tabs)/          Home · Circles · Ipon · Activity · Profile (custom floating tab bar)
  (app)/goal/[id].tsx    ipon goal: deposits, plan, AI smart plan
  (app)/assistant.tsx    Ipon AI chat
  (app)/circle/[id]/     detail, draw, swaps, round/[roundId]
  (app)/create.tsx       4-step create wizard
  (app)/join.tsx         code / QR join with Kasunduan
src/components/          UI kit (Card, Button, Sheet, ProgressRing, Confetti…) + circle panels
src/lib/                 supabase client, auth, TanStack Query hooks, realtime sync, draw algorithm
supabase/migrations/     schema, RLS, SECURITY DEFINER RPCs, storage bucket
supabase/functions/push  reminders + nudge (Expo Push API)
supabase/tests/          Postgres-in-Docker lifecycle test
```

All writes that involve business rules go through `SECURITY DEFINER` RPCs: `create_circle`, `request_join`, `review_member`, `pair_hati`, `lock_circle`, `run_draw`, `submit_proof`, `review_contribution`, `request_swap` and `respond_swap`. Clients can only read the rows of circles they belong to.
