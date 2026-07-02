# Budget Pilot — your own copy

This is a standalone version of the budget tracker, wired to a Supabase database
you create and own instead of Claude's storage. Same UI, same features — the
data now lives in your own project, reachable from any device you log in from.

## 1. Create your Supabase project (free)

1. Go to https://supabase.com and sign up / sign in.
2. Create a new project. Pick any name and a strong database password (save it somewhere).
3. Wait ~2 minutes for it to provision.

## 2. Create the database table

1. In your Supabase project, open **SQL Editor** (left sidebar) → **New query**.
2. Paste the contents of `supabase/schema.sql` (included in this project) and click **Run**.
3. This creates one table (`ledger_data`) with security rules so only you can ever read or write your own rows — even though the app uses a public API key.

## 3. Get your API keys

1. In Supabase, go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. In this project folder, copy `.env.example` to a new file named `.env`:
   ```
   cp .env.example .env
   ```
4. Paste your URL and anon key into `.env`.

## 4. Run it locally

```
npm install
npm run dev
```

Open the local URL it prints. Sign up with any email + password (this creates
your login — it's separate from your Supabase account login). Confirm the
email if Supabase asks for it, then sign in.

## 5. Deploy it (same flow as TawfiqBuilds)

1. Push this folder to a new GitHub repo.
2. Go to https://vercel.com, import the repo.
3. In Vercel's project settings, add the same two environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. You'll get a URL you can open from your phone or laptop — sign in with the same account either place, and your data stays in sync because it's all reading from the same Supabase table.

## What's actually yours here

- The code — it's just files, no lock-in to Claude or anyone else.
- The database — a real Postgres database inside a Supabase project under your own account. You can export it, query it directly, or migrate off Supabase entirely later if you want (it's plain Postgres).
- Free tier covers this comfortably — a single-user tracker logging a few purchases a day is nowhere near Supabase's free limits.

## If you want to skip auth for now

The current setup requires signing up/in because that's what makes the data
private to you once it's hosted on a public URL. If you'd rather test locally
without setting up login first, tell Claude — the auth layer can be swapped
for a single hardcoded user ID temporarily, but that's not safe to deploy
publicly since anyone with the URL could read/edit your data.

## Multi-user and password reset notes

Multiple people can use the same deployed app URL. Supabase stores each
person's ledger rows with their own `auth.users.id`, and the Row Level Security
policies in `supabase/schema.sql` keep those rows private per account.

The sign-in screen includes a forgot-password flow. In Supabase, make sure
Authentication > URL Configuration includes your local and deployed app URLs so
reset links return to the app correctly.
