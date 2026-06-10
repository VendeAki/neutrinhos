-- Neutrinhos Carinhosos MVP schema
-- Execute este arquivo no SQL editor do Supabase após criar o projeto.
-- A estrutura nasce single-guild, mas os comentários indicam onde adicionar guild_id
-- quando o MVP evoluir para SaaS multi-guild.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'member' check (role in ('admin', 'leader', 'member')),
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  character_name text unique not null,
  level int check (level is null or level > 0),
  vocation text,
  world text,
  guild_rank text,
  status text not null default 'member' check (status in ('member', 'leader', 'vice_leader', 'enemy', 'ally', 'neutral', 'blacklist')),
  main_character boolean not null default false,
  owner_name text,
  discord_name text,
  notes text,
  last_seen_online timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- Futuro SaaS multi-guild: adicionar guild_id uuid references guilds(id)
);

create table if not exists public.character_tags (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  tag text not null check (tag in ('main', 'maker', 'bomb', 'trusted', 'enemy', 'hunted', 'blacklist', 'war_target')),
  created_at timestamptz not null default now(),
  unique (character_id, tag)
);

create table if not exists public.deaths (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references public.characters(id) on delete set null,
  character_name text not null,
  death_time timestamptz not null,
  level int check (level is null or level > 0),
  killed_by text,
  is_pvp boolean not null default false,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) default auth.uid(),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists characters_name_idx on public.characters using gin (to_tsvector('simple', character_name));
create index if not exists characters_status_idx on public.characters(status);
create index if not exists characters_vocation_idx on public.characters(vocation);
create index if not exists character_tags_character_id_idx on public.character_tags(character_id);
create index if not exists deaths_character_id_idx on public.deaths(character_id);
create index if not exists deaths_death_time_idx on public.deaths(death_time desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_characters_updated_at on public.characters;
create trigger set_characters_updated_at
before update on public.characters
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.can_manage_guild()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() in ('admin', 'leader'), false);
$$;

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.character_tags enable row level security;
alter table public.deaths enable row level security;
alter table public.activity_logs enable row level security;

-- Profiles: usuários autenticados leem perfis para resolver roles; cada usuário atualiza apenas seu próprio display_name.
drop policy if exists "authenticated profiles read" on public.profiles;
create policy "authenticated profiles read" on public.profiles for select to authenticated using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Characters: members visualizam; admin/leader gerenciam.
drop policy if exists "authenticated characters read" on public.characters;
create policy "authenticated characters read" on public.characters for select to authenticated using (true);

drop policy if exists "leaders manage characters" on public.characters;
create policy "leaders manage characters" on public.characters for all to authenticated using (public.can_manage_guild()) with check (public.can_manage_guild());

-- Tags seguem as mesmas permissões dos personagens.
drop policy if exists "authenticated tags read" on public.character_tags;
create policy "authenticated tags read" on public.character_tags for select to authenticated using (true);

drop policy if exists "leaders manage tags" on public.character_tags;
create policy "leaders manage tags" on public.character_tags for all to authenticated using (public.can_manage_guild()) with check (public.can_manage_guild());

-- Deaths: members visualizam; admin/leader inserem e corrigem registros manuais.
drop policy if exists "authenticated deaths read" on public.deaths;
create policy "authenticated deaths read" on public.deaths for select to authenticated using (true);

drop policy if exists "leaders manage deaths" on public.deaths;
create policy "leaders manage deaths" on public.deaths for all to authenticated using (public.can_manage_guild()) with check (public.can_manage_guild());

-- Activity logs: todos autenticados leem; inserções vêm do frontend autenticado.
drop policy if exists "authenticated logs read" on public.activity_logs;
create policy "authenticated logs read" on public.activity_logs for select to authenticated using (true);

drop policy if exists "authenticated logs insert" on public.activity_logs;
create policy "authenticated logs insert" on public.activity_logs for insert to authenticated with check (actor_user_id = auth.uid());

-- Seed opcional para testar a interface da guild Neutrinhos Carinhosos.
insert into public.characters (character_name, level, vocation, world, guild_rank, status, main_character, owner_name, discord_name, notes, last_seen_online)
values
  ('Neutrino Fofo', 412, 'Elite Knight', 'Quelibra', 'Leader', 'leader', true, 'Nino', 'nino#0001', 'Tank principal da Neutrinhos Carinhosos.', now() - interval '2 hours'),
  ('Carinho Arcano', 355, 'Master Sorcerer', 'Quelibra', 'Member', 'member', true, 'Lua', 'lua#0002', 'Dano mágico para hunts e war.', now() - interval '1 day'),
  ('Druidinho Paz', 298, 'Elder Druid', 'Quelibra', 'Vice Leader', 'vice_leader', true, 'Paz', 'paz#0003', 'Suporte e UH.', now() - interval '5 hours'),
  ('Maker Neutro', 88, 'Paladin', 'Quelibra', 'Maker', 'neutral', false, 'Nino', null, 'Maker para runas.', now() - interval '8 days'),
  ('Enemy Sem Carinho', 501, 'Royal Paladin', 'Quelibra', null, 'enemy', false, null, null, 'Alvo monitorado.', now() - interval '3 days')
on conflict (character_name) do nothing;

insert into public.character_tags (character_id, tag)
select id, tag
from public.characters
cross join lateral (
  values
    (case when character_name = 'Neutrino Fofo' then 'main' end),
    (case when character_name = 'Carinho Arcano' then 'trusted' end),
    (case when character_name = 'Maker Neutro' then 'maker' end),
    (case when character_name = 'Enemy Sem Carinho' then 'enemy' end),
    (case when character_name = 'Enemy Sem Carinho' then 'war_target' end)
) as tags(tag)
where tag is not null
on conflict (character_id, tag) do nothing;

insert into public.deaths (character_id, character_name, death_time, level, killed_by, is_pvp, source)
select id, character_name, now() - interval '6 hours', level, 'a grim reaper', false, 'manual'
from public.characters
where character_name = 'Carinho Arcano'
on conflict do nothing;
