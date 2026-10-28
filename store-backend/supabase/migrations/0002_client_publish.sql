-- 0002: apps are now checked on the TV before upload, so no Edge Function is needed.
-- This lets signed-in users add their own apps and repeats the cheap safety rules in the database.
-- Run once in the Supabase SQL editor (after 0001).

drop policy if exists "owners insert own apps" on public.apps;
create policy "owners insert own apps" on public.apps for insert to authenticated
  with check (auth.uid() = owner and status in ('approved', 'pending') and report_count = 0);

create or replace function public.check_new_app() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  host text;
  reg text;
  lbl text;
  part text;
  recent int;
begin
  host := lower(substring(new.url from '^https://([^/:?#@]+)'));
  if host is null or position('.' in host) = 0 or host ~ '^[0-9.]+$' or host = 'localhost' then
    raise exception 'That is not a valid public https website address.';
  end if;
  reg := regexp_replace(host, '^.*\.([^.]+\.[^.]+)$', '\1');
  lbl := split_part(reg, '.', 1);

  if reg = any (array['bit.ly','t.co','tinyurl.com','goo.gl','is.gd','ow.ly','buff.ly','cutt.ly','rebrand.ly',
                      'shorturl.at','tiny.cc','rb.gy','lnkd.in','s.id','v.gd','t.ly','shorte.st','adf.ly','bl.ink','soo.gd','clck.ru','qr.net']) then
    raise exception 'Link shorteners are not allowed. Use the real website address.';
  end if;
  if exists (select 1 from public.blocked_domains where domain = reg) then
    raise exception 'This website is on the blocklist.';
  end if;

  for part in select unnest(string_to_array(lbl, '-')) loop
    if char_length(part) >= 5 and (part !~ '[aeiouy]'
       or part ~ '[^aeiouy][^aeiouy][^aeiouy][^aeiouy][^aeiouy][^aeiouy]'
       or part ~ '(.)\1\1\1'
       or part ~ '(qwert|asdf|zxcv|hjkl)') then
      raise exception 'The website address looks like random characters.';
    end if;
  end loop;
  for part in select regexp_split_to_table(lower(new.name), '[^a-z0-9]+') loop
    if char_length(part) >= 5 and (part !~ '[aeiouy]'
       or part ~ '[^aeiouy][^aeiouy][^aeiouy][^aeiouy][^aeiouy][^aeiouy]'
       or part ~ '(.)\1\1\1'
       or part ~ '(qwert|asdf|zxcv|hjkl)') then
      raise exception 'The app name looks like random letters.';
    end if;
  end loop;

  if new.icon_path not like new.owner::text || '/%' then
    raise exception 'Invalid icon path.';
  end if;

  select count(*) into recent from public.apps where owner = new.owner and created_at > now() - interval '1 day';
  if recent >= 3 then
    raise exception 'You can publish 3 apps per day. Try again tomorrow.';
  end if;

  new.domain := reg;
  new.reasons := array[]::text[];
  new.report_count := 0;
  return new;
end $$;

drop trigger if exists apps_before_insert on public.apps;
create trigger apps_before_insert before insert on public.apps
  for each row execute function public.check_new_app();

-- icons: each user may upload only into their own folder
drop policy if exists "users upload own icons" on storage.objects;
create policy "users upload own icons" on storage.objects for insert to authenticated
  with check (bucket_id = 'app-icons' and (storage.foldername(name))[1] = auth.uid()::text);
