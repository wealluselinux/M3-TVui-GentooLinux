# M3TV Store backend (Supabase)

The launcher works without this: the built-in Store lists the curated apps in `m3tv/catalog.json`.
This backend adds **community apps**: people make an account (username, email, password), upload an
icon, a website, a name and a description, and the app is checked automatically before it appears.

## Set up (about 10 minutes)

1. Create a free project at <https://supabase.com>.
2. **SQL Editor** → paste `supabase/migrations/0001_m3tv_store.sql` → Run.
3. **Authentication → Providers → Email**: leave enabled. (Turn "Confirm email" off if you don't
   want a verification email; leaving it on is safer against fake accounts.)
4. Deploy the function (needs the [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy submit-app
   # optional, free: Google Safe Browsing key for known phishing/malware lists
   supabase secrets set SAFE_BROWSING_API_KEY=your_key
   ```
   Copy `verify.ts` next to `index.ts` (already there). The function runs with `--no-verify-jwt`
   **not** set: it checks the signed-in user itself.
5. In **Project Settings → API** copy the *Project URL* and the *anon public* key into
   `m3tv/store-config.json`:
   ```json
   { "url": "https://abcd1234.supabase.co", "anon_key": "eyJ..." }
   ```
   The anon key is meant to be public; the SQL policies are what protect the data.
   Never put the `service_role` key anywhere in the launcher.
6. `./update.sh` or `./reinstall.sh` on the TV machine, or set `store_url` / `store_anon_key` in
   `~/.config/m3-tvui/config.json`.

## What the automatic check does

| Result | Meaning | Examples |
| --- | --- | --- |
| **approved** | shown in the Store immediately | name matches the site, nothing suspicious |
| **pending** | hidden until you approve it | page can't be read, domain < 30 days old, redirects elsewhere, piracy wording, 3+ reports |
| **blocked** | rejected, publisher sees why | imitates Netflix/YouTube/etc., name doesn't match the site, `http://`, IP address, link shortener, private network address, scam wording, Safe Browsing hit, on your blocklist |

Approve or block from the SQL editor:

```sql
select slug, name, url, flags, report_count from apps where status = 'pending';
update apps set status = 'approved' where slug = '...';
update apps set status = 'blocked' where slug = '...';
insert into blocked_domains values ('bad-site.example', 'scam');
```

**Honest limits:** these are heuristics. They stop lazy scams, look-alike domains and mismatched
names, but a careful attacker can build a convincing site and wait. That is why unreadable and
suspicious apps go to *pending*, anyone signed in can report an app, and three reports hide it
again. Check the pending list now and then. Every community app also opens only as a website in
Firefox (it never runs code on the TV).

## Tests

```sh
node --test store-backend/tests/verify.test.ts    # Node 22.18+
```
