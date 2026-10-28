# M3TV Store backend (Supabase)

The Store works without this (curated apps in `m3tv/catalog.json`). This adds **community apps**:
accounts (username, email, password) and publishing an app (name, https website, description, icon).

There is **no server function to deploy**. The launcher checks the website on the TV before upload
(`m3tv/store_check.py`), and the database repeats the simple rules.

## Set up

1. Create a free project at <https://supabase.com>.
2. SQL Editor: run `supabase/migrations/0001_m3tv_store.sql`, then `supabase/migrations/0002_client_publish.sql`.
3. Optional: Authentication → Providers → Email → turn off "Confirm email" so new accounts can sign in at once.
4. Put the Project URL and the **anon public** key in `m3tv/store-config.json`:
   ```json
   { "url": "https://abcd1234.supabase.co", "anon_key": "eyJ..." }
   ```
   Never put the `service_role` key anywhere in the launcher or the repo.

## What is checked

On the TV, before anything is uploaded:

| Result | When |
| --- | --- |
| **blocked** | link shortener, `http://`, IP/local address, random-looking name, address or description, name doesn't relate to the website, imitates a known brand, scam wording, website unreachable |
| **pending** (you approve it) | page can't be read, redirects to another domain, piracy wording |
| **approved** | nothing found |

In the database (cannot be skipped): https only, link shorteners, your `blocked_domains` list, random-looking
names/addresses, 3 apps per user per day, icons only in the user's own folder.

**Honest limit:** the website-vs-name check runs on the TV, so someone who modifies their own launcher
could skip it. The database rules, reports (3 reports hide an app) and the pending queue are the backstop.

Review and moderate from the SQL editor:

```sql
select slug, name, url, flags, report_count from apps where status = 'pending';
update apps set status = 'approved' where slug = '...';
update apps set status = 'blocked' where slug = '...';
insert into blocked_domains values ('bad-site.example', 'scam');
```

## Tests

```sh
python3 -m unittest discover -s tests
```
