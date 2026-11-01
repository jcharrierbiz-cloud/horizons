-- Synchronisation d'Horizons : un document JSON par compte, réservé au propriétaire.
-- Appliquée au projet Supabase « horizons » (région eu-west-3, Paris).
create schema if not exists horizons_private;
revoke all on schema horizons_private from public, anon, authenticated;

-- Le propriétaire : le premier compte dont l'adresse est confirmée. Une seule ligne possible.
create table public.horizons_owner (
  user_id uuid primary key references auth.users(id) on delete cascade,
  singleton boolean not null default true unique check (singleton),
  created_at timestamptz not null default now()
);
alter table public.horizons_owner enable row level security;
create policy "le propriétaire se voit" on public.horizons_owner
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.horizons_owner from anon, authenticated;
grant select on public.horizons_owner to authenticated;

-- Le document : seul le propriétaire peut en avoir un (clé étrangère), et seulement le sien (RLS).
create table public.horizons_docs (
  user_id uuid primary key references public.horizons_owner(user_id) on delete cascade,
  doc jsonb not null,
  rev bigint not null default 1 check (rev > 0),
  device text not null default '' check (char_length(device) <= 80),
  updated_at timestamptz not null default now(),
  constraint horizons_docs_size check (pg_column_size(doc) <= 5242880)
);
alter table public.horizons_docs enable row level security;
create policy "lire son document" on public.horizons_docs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "créer son document" on public.horizons_docs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "modifier son document" on public.horizons_docs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.horizons_docs from anon, authenticated;
grant select, insert, update on public.horizons_docs to authenticated;

-- Chaque écriture avance la révision d'exactement un : une écriture faite sur une version périmée est refusée.
create or replace function horizons_private.touch_doc() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.rev <> old.rev + 1 then
    raise exception 'révision attendue %, reçue %', old.rev + 1, new.rev using errcode = '40001';
  end if;
  new.user_id := old.user_id;
  new.updated_at := now();
  return new;
end $$;
create trigger horizons_docs_touch before update on public.horizons_docs
  for each row execute function horizons_private.touch_doc();

create or replace function horizons_private.claim_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and not exists (select 1 from public.horizons_owner) then
    insert into public.horizons_owner (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function horizons_private.claim_owner() from public, anon, authenticated;
revoke all on function horizons_private.touch_doc() from public, anon, authenticated;
grant usage on schema horizons_private to supabase_auth_admin;
grant execute on function horizons_private.claim_owner() to supabase_auth_admin;

create trigger horizons_claim_owner_ins after insert on auth.users
  for each row execute function horizons_private.claim_owner();
create trigger horizons_claim_owner_upd after update of email_confirmed_at on auth.users
  for each row execute function horizons_private.claim_owner();
