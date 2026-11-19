-- Banco do app Foco Total (Supabase / Postgres)
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.profile_owners (
  profile_id uuid not null references public.profiles on delete cascade,
  uid uuid not null references auth.users on delete cascade,
  primary key (profile_id, uid)
);
create table if not exists public.days (
  profile_id uuid not null references public.profiles on delete cascade,
  date date not null,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (profile_id, date)
);
create table if not exists public.photos (
  id uuid primary key,
  profile_id uuid not null references public.profiles on delete cascade,
  date date not null,
  kind text not null,
  visibility text not null default 'private' check (visibility in ('group', 'private')),
  path text not null unique,
  weight numeric,
  created_at timestamptz not null default now()
);
create table if not exists public.messages (
  id uuid primary key,
  profile_id uuid not null references public.profiles on delete cascade,
  text text,
  photo_path text,
  created_at timestamptz not null default now()
);
create table if not exists public.push_subs (
  endpoint text primary key,
  profile_id uuid not null references public.profiles on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);
-- Só o servidor (funções) acessa estas duas:
create table if not exists public.strava_tokens (
  profile_id uuid primary key references public.profiles on delete cascade,
  athlete_id bigint, athlete_name text,
  access_token text, refresh_token text, expires_at bigint
);
create table if not exists public.reminder_log (
  profile_id uuid not null references public.profiles on delete cascade,
  key text not null, slot text not null,
  primary key (profile_id, key, slot)
);

create or replace function public.is_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile_owners where profile_id = pid and uid = auth.uid());
$$;

-- Criar perfil (quem cria vira dono)
create or replace function public.create_profile(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  insert into public.profiles (data) values (p_data) returning id into new_id;
  insert into public.profile_owners (profile_id, uid) values (new_id, auth.uid());
  return new_id;
end; $$;

-- Assumir um perfil pré-cadastrado que ainda não tem dono
create or replace function public.claim_profile(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  if exists (select 1 from public.profile_owners where profile_id = p_id and uid = auth.uid()) then return true; end if;
  if exists (select 1 from public.profile_owners where profile_id = p_id) then return false; end if;
  insert into public.profile_owners (profile_id, uid) values (p_id, auth.uid());
  return true;
end; $$;

alter table public.profiles enable row level security;
alter table public.profile_owners enable row level security;
alter table public.days enable row level security;
alter table public.photos enable row level security;
alter table public.messages enable row level security;
alter table public.push_subs enable row level security;
alter table public.strava_tokens enable row level security;
alter table public.reminder_log enable row level security;

create policy "ver perfis" on public.profiles for select to authenticated using (true);
create policy "editar meu perfil" on public.profiles for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
create policy "excluir meu perfil" on public.profiles for delete to authenticated using (public.is_owner(id));

create policy "ver meus vinculos" on public.profile_owners for select to authenticated using (uid = auth.uid());

create policy "ver dias" on public.days for select to authenticated using (true);
create policy "gravar meus dias" on public.days for insert to authenticated with check (public.is_owner(profile_id));
create policy "atualizar meus dias" on public.days for update to authenticated using (public.is_owner(profile_id)) with check (public.is_owner(profile_id));

create policy "ver fotos do grupo ou minhas" on public.photos for select to authenticated using (visibility = 'group' or public.is_owner(profile_id));
create policy "enviar minhas fotos" on public.photos for insert to authenticated with check (public.is_owner(profile_id));
create policy "editar minhas fotos" on public.photos for update to authenticated using (public.is_owner(profile_id)) with check (public.is_owner(profile_id));
create policy "excluir minhas fotos" on public.photos for delete to authenticated using (public.is_owner(profile_id));

create policy "ler chat" on public.messages for select to authenticated using (true);
create policy "escrever no chat" on public.messages for insert to authenticated with check (public.is_owner(profile_id));

create policy "minhas inscricoes push" on public.push_subs for all to authenticated using (public.is_owner(profile_id)) with check (public.is_owner(profile_id));

-- Fotos: armazenamento privado. Cada foto só abre para quem pode vê-la.
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;
create policy "fotos: ver" on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    position('/chat-' in name) > 0
    or public.is_owner(((storage.foldername(name))[1])::uuid)
    or exists (select 1 from public.photos p where p.path = name and p.visibility = 'group')
  )
);
create policy "fotos: enviar" on storage.objects for insert to authenticated with check (
  bucket_id = 'photos' and public.is_owner(((storage.foldername(name))[1])::uuid)
);
create policy "fotos: excluir" on storage.objects for delete to authenticated using (
  bucket_id = 'photos' and public.is_owner(((storage.foldername(name))[1])::uuid)
);

-- Tempo real
alter publication supabase_realtime add table public.profiles, public.days, public.photos, public.messages;

-- Perfil pré-cadastrado da Eyshilla (sem dono: o primeiro login dela assume o perfil)
insert into public.profiles (id, data) values ('00000000-0000-4000-8000-000000000001', '{"name":"Eyshilla Cristyna","age":26,"height":174,"sex":"F","activity":"intenso","startDate":"2026-11-23","startWeight":96.3,"goalWeight":75,"interim":{"date":"2026-12-28","min":88.8,"max":90.2},"kcalGoal":1600,"kcalTol":1800,"proteinGoal":160,"waterGoal":4000,"weeklyRate":0.8,"refCurve":[{"date":"2026-11-23","min":96.3,"max":96.3},{"date":"2026-11-30","min":93,"max":94},{"date":"2026-12-07","min":91.5,"max":92.8},{"date":"2026-12-14","min":90.5,"max":91.8},{"date":"2026-12-21","min":89.5,"max":91},{"date":"2026-12-28","min":88.8,"max":90.2}],"cardioGoal":[{"fromWeek":1,"min":45,"max":60},{"fromWeek":2,"min":70,"max":80}],"planId":"plan-eyshilla","plans":[],"reminders":{"weigh":{"on":true,"times":["07:00"]},"water":{"on":true,"every":2,"from":"08:00","to":"21:00"},"meals":{"on":true,"times":["08:00","12:15","14:15","18:45","21:30"]},"workout":{"on":true,"times":["14:45"]},"night":{"on":true,"times":["21:45"]},"photo":{"on":true,"times":["07:15"],"days":[0,1]},"chat":{"on":true}},"tz":"America/Sao_Paulo","color":"#db2777","createdAt":"2026-11-19T00:00:00.000Z"}'::jsonb)
on conflict (id) do nothing;
