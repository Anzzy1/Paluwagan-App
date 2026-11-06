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
| 🎲 **Digital Bunot** | Commit-reveal draw. A SHA-256 hash of a secret seed is published when the circle is locked. The seed is revealed at the draw, and any member can re-run the shuffle on their phone to verify it. |
| 🧾 **Proof of payment** | Members upload a GCash/Maya screenshot. The **recipient confirms** receipt, so both sides sign off. |
| 🔔 **Paalala** | Push reminders 3 days before, 1 day before, on the due date, and when overdue. The admin or recipient can send a one-tap nudge. |
| 🌟 **Tiwala Score** | Trust score based on on-time payment history across all circles. It shows on join requests. |
| 🔁 **Palit-Slot** | Swap turns. Requires the other member to agree and the admin to approve. |
| 🤝 **Hati-Slot** | Two people share one slot, each paying half and receiving half. |
| 🎯 **Ipon Goals** | Link a savings goal to a circle and track progress and the countdown to your payout. |
| 📅 **Kinsenas schedule** | Weekly, monthly, or every 15th and end of month (matches PH paydays). |
| 📜 **Digital Kasunduan** | Members agree to the rules in-app. Their name and timestamp are recorded. |
| 🛡️ **Scam guard** | Warns when a circle's rules mention "tubo", interest or returns. Circles are invite-only. |
| 🌗 | Taglish/English toggle, dark mode, haptics, confetti. |

## Setup

1. **Install:** `npm install`
2. **Create a Supabase project** (free tier) at supabase.com.
3. **Run the migration:** paste `supabase/migrations/0001_init.sql` into **SQL Editor → Run**.
4. **Email OTP codes:** go to Authentication → Email Templates → *Magic Link* and add `{{ .Token }}` to the template so users receive a 6-digit code.
   - Phone login is optional and needs an SMS provider (e.g. Twilio) under Authentication → Providers → Phone.
5. **Env:** copy `.env.example` to `.env.local` and fill in your Project URL and publishable key (Settings → API).
6. **Run:** `npx expo start`, then open the app in **Expo Go** on your phone.

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
  (app)/(tabs)/          Home · Circles · Activity · Profile (custom floating tab bar)
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
