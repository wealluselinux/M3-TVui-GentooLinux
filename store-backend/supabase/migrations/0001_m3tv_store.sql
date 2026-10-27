-- M3TV Store: community apps.  Run once in the Supabase SQL editor.
-- Accounts use Supabase Auth (username, email, password). Apps are only ever inserted by the
-- `submit-app` Edge Function (service role) AFTER the automatic checks, so clients can't skip them.

create extension if not exists pgcrypto;

-- ---------- profiles (public username) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles are public" on public.profiles for select using (true);
-- no insert/update policies: the trigger below creates it, usernames can't be changed by clients

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'user' || substr(new.id::text, 1, 8)));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.username_available(name text) returns boolean
language sql security definer set search_path = public stable as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- apps ----------
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  name text not null check (char_length(name) between 2 and 40),
  url text not null check (url ~ '^https://' and char_length(url) <= 300),
  domain text not null,
  description text not null default '' check (char_length(description) <= 400),
  category text not null default 'More',
  icon_path text not null,
  hue int not null default 285 check (hue between 0 and 359),
  status text not null default 'pending' check (status in ('approved','pending','blocked')),
  reasons text[] not null default '{}',
  flags text[] not null default '{}',
  report_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists apps_status_idx on public.apps (status, created_at desc);
alter table public.apps enable row level security;
-- Owners may read their own apps (any status) to see the verdict. Everyone else sees nothing here;
-- the public reads the `store_apps` view, which only exposes approved apps.
create policy "owners read own apps" on public.apps for select using (auth.uid() = owner);
create policy "owners delete own apps" on public.apps for delete using (auth.uid() = owner);
-- no insert/update policy on purpose: only the service role (the Edge Function) writes.

create or replace view public.store_apps as
  select a.id, a.slug, a.name, a.url, a.description, a.category, a.icon_path, a.hue, a.created_at,
         p.username as publisher
  from public.apps a join public.profiles p on p.id = a.owner
  where a.status = 'approved';
grant select on public.store_apps to anon, authenticated;

-- ---------- reports ----------
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  app_id uuid not null references public.apps(id) on delete cascade,
  reporter uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 300),
  created_at timestamptz not null default now(),
  unique (app_id, reporter)
);
alter table public.reports enable row level security;
create policy "signed-in users report" on public.reports for insert to authenticated
  with check (auth.uid() = reporter);

-- Three different people reporting an app hides it again until someone reviews it.
create or replace function public.on_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.reports where app_id = new.app_id;
  update public.apps set report_count = n,
    status = case when n >= 3 and status = 'approved' then 'pending' else status end,
    flags = case when n >= 3 then array_append(flags, 'Reported by several people') else flags end
  where id = new.app_id;
  return new;
end $$;
drop trigger if exists reports_after_insert on public.reports;
create trigger reports_after_insert after insert on public.reports
  for each row execute function public.on_report();

-- ---------- blocked domains (you add rows; the Edge Function reads them) ----------
create table if not exists public.blocked_domains (domain text primary key, note text);
alter table public.blocked_domains enable row level security;  -- no policies: service role only

-- ---------- icons (public read, written by the Edge Function) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-icons', 'app-icons', true, 524288, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- ---------- approving a pending app (run in the SQL editor) ----------
--   update public.apps set status = 'approved' where slug = 'the-slug';
-- ---------- blocking ----------
--   update public.apps set status = 'blocked' where slug = 'the-slug';
--   insert into public.blocked_domains values ('bad-site.example', 'scam');
