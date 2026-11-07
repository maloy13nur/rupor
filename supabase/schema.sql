-- ============================================================
-- Рупор — полная схема Supabase (идемпотентная)
-- Запускать в SQL Editor. Порядок важен.
-- ============================================================

-- ── Типы ────────────────────────────────────────────────────
do $$ begin
  create type public.member_role as enum ('OWNER','ADMIN','MEMBER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.friendship_status as enum ('pending','accepted','blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.channel_type as enum ('TEXT','VOICE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_status as enum ('online','idle','dnd','offline');
exception when duplicate_object then null; end $$;

-- ── profiles ─────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null,
  display_name text not null default '',
  avatar_url   text,
  status       public.user_status not null default 'offline',
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-zA-Z0-9_]{3,32}$')
);

create unique index if not exists profiles_username_lower_uq
  on public.profiles (lower(username));

-- ── servers ──────────────────────────────────────────────────
create table if not exists public.servers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 100),
  icon_url    text,
  owner_id    uuid not null references auth.users (id) on delete restrict,
  invite_code text not null unique
              default substr(replace(gen_random_uuid()::text,'-',''),1,8),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── members ──────────────────────────────────────────────────
create table if not exists public.members (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      public.member_role not null default 'MEMBER',
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create index if not exists members_user_idx on public.members (user_id);

-- ── channels ─────────────────────────────────────────────────
create table if not exists public.channels (
  id         uuid primary key default gen_random_uuid(),
  server_id  uuid not null references public.servers (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  topic      text,
  type       public.channel_type not null default 'TEXT',
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists channels_server_idx
  on public.channels (server_id, position);

-- ── messages ─────────────────────────────────────────────────
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references public.channels (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  content      text not null check (char_length(content) between 1 and 4000),
  client_nonce uuid,
  edited_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists messages_channel_page_idx
  on public.messages (channel_id, created_at desc);

create unique index if not exists messages_client_nonce_uq
  on public.messages (channel_id, client_nonce)
  where client_nonce is not null;

alter table public.messages replica identity full;

-- ── friendships ──────────────────────────────────────────────
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint no_self_friend check (requester_id <> addressee_id)
);

drop index if exists public.friendships_pair_uq;
create unique index if not exists friendships_pair_uq
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

alter table public.friendships drop constraint if exists canonical_order;
alter table public.friendships replica identity full;

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status);

-- ── dm_channels ───────────────────────────────────────────────
create table if not exists public.dm_channels (
  id            uuid primary key default gen_random_uuid(),
  friendship_id uuid not null unique references public.friendships (id) on delete cascade,
  participant_a uuid not null references public.profiles (id) on delete cascade,
  participant_b uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint dm_canonical_order check (participant_a < participant_b),
  constraint dm_no_self         check (participant_a <> participant_b)
);

alter table public.dm_channels replica identity full;

-- ── dm_messages ───────────────────────────────────────────────
create table if not exists public.dm_messages (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references public.dm_channels (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  content      text not null check (char_length(content) between 1 and 4000),
  client_nonce uuid,
  edited_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists dm_messages_channel_page_idx
  on public.dm_messages (channel_id, created_at desc);

create unique index if not exists dm_messages_client_nonce_uq
  on public.dm_messages (channel_id, client_nonce)
  where client_nonce is not null;

alter table public.dm_messages replica identity full;

-- ── voice_sessions ────────────────────────────────────────────
create table if not exists public.voice_sessions (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references public.channels (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  livekit_room text not null,
  joined_at    timestamptz not null default now()
);

create unique index if not exists voice_sessions_channel_user_uq
  on public.voice_sessions (channel_id, user_id);

alter table public.voice_sessions replica identity full;

-- ============================================================
-- Вспомогательные функции (security definer, фиксированный search_path)
-- ============================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists servers_touch on public.servers;
create trigger servers_touch before update on public.servers
  for each row execute function public.touch_updated_at();

drop trigger if exists friendships_touch on public.friendships;
create trigger friendships_touch before update on public.friendships
  for each row execute function public.touch_updated_at();

-- Создатель профиля при регистрации
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_username text;
begin
  v_username := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if v_username !~ '^[a-zA-Z0-9_]{3,32}$' then
    v_username := 'user_' || substr(replace(new.id::text,'-',''),1,12);
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(v_username)) then
    raise exception 'USERNAME_TAKEN' using errcode = '23505';
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, v_username,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', v_username), 32))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Создатель сервера сразу OWNER в members
create or replace function public.handle_new_server()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (server_id, user_id, role)
  values (new.id, new.owner_id, 'OWNER');
  return new;
end $$;

drop trigger if exists on_server_created on public.servers;
create trigger on_server_created
  after insert on public.servers
  for each row execute function public.handle_new_server();

-- Защита от смены owner без прав
create or replace function public.guard_server_owner()
returns trigger language plpgsql as $$
begin
  if new.owner_id <> old.owner_id
     and auth.uid() is not null
     and auth.uid() <> old.owner_id then
    raise exception 'ONLY_OWNER_CAN_TRANSFER' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists servers_guard_owner on public.servers;
create trigger servers_guard_owner before update on public.servers
  for each row execute function public.guard_server_owner();

-- Защита роли OWNER от изменения
create or replace function public.guard_member_owner()
returns trigger language plpgsql as $$
begin
  if old.role = 'OWNER' and (new.role <> 'OWNER' or new.user_id <> old.user_id) then
    raise exception 'OWNER_ROLE_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists members_guard_owner on public.members;
create trigger members_guard_owner before update on public.members
  for each row execute function public.guard_member_owner();

-- ── RLS-хелперы (security definer чтобы не было рекурсии) ───
-- DROP перед CREATE: CREATE OR REPLACE не может менять имена параметров,
-- а в уже развёрнутой БД функции могли быть объявлены иначе.
drop function if exists public.can_post(uuid) cascade;
drop function if exists public.is_dm_participant(uuid) cascade;
drop function if exists public.channel_server(uuid) cascade;
drop function if exists public.is_member(uuid) cascade;
drop function if exists public.is_server_admin(uuid) cascade;
drop function if exists public.is_server_owner(uuid) cascade;

create or replace function public.is_member(p_server_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.members
    where server_id = p_server_id and user_id = auth.uid()
  )
$$;

create or replace function public.is_server_admin(p_server_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.members
    where server_id = p_server_id and user_id = auth.uid()
      and role in ('OWNER','ADMIN')
  )
$$;

create or replace function public.is_server_owner(p_server_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.members
    where server_id = p_server_id and user_id = auth.uid() and role = 'OWNER'
  )
$$;

create or replace function public.channel_server(p_channel_id uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select server_id from public.channels where id = p_channel_id
$$;

create or replace function public.can_post(p_channel_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_member(public.channel_server(p_channel_id))
$$;

create or replace function public.is_dm_participant(p_dm_channel_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.dm_channels
    where id = p_dm_channel_id
      and (participant_a = auth.uid() or participant_b = auth.uid())
  )
$$;

-- ── RPC ──────────────────────────────────────────────────────

-- Вступление в сервер по коду (единственный способ попасть в members)
create or replace function public.join_server(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_server uuid;
begin
  select id into v_server from public.servers where invite_code = p_code;
  if not found then raise exception 'SERVER_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.members (server_id, user_id, role)
  values (v_server, auth.uid(), 'MEMBER')
  on conflict do nothing;
  return v_server;
end $$;

-- Отправка заявки в друзья
create or replace function public.send_friend_request(p_addressee_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_addressee_id = auth.uid() then
    raise exception 'SELF_FRIEND' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.friendships
    where least(requester_id,addressee_id) = least(auth.uid(),p_addressee_id)
      and greatest(requester_id,addressee_id) = greatest(auth.uid(),p_addressee_id)
  ) then
    raise exception 'ALREADY_EXISTS' using errcode = '23505';
  end if;
  insert into public.friendships (requester_id, addressee_id)
  values (auth.uid(), p_addressee_id)
  returning id into v_id;
  return v_id;
end $$;

-- Открытие DM (только между принятыми друзьями)
create or replace function public.open_dm(p_other_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_friendship uuid;
  v_dm uuid;
  v_a uuid := least(auth.uid(), p_other_id);
  v_b uuid := greatest(auth.uid(), p_other_id);
begin
  select id into v_friendship
  from public.friendships
  where least(requester_id,addressee_id) = v_a
    and greatest(requester_id,addressee_id) = v_b
    and status = 'accepted';
  if not found then raise exception 'NOT_FRIENDS' using errcode = '42501'; end if;

  select id into v_dm from public.dm_channels where friendship_id = v_friendship;
  if found then return v_dm; end if;

  insert into public.dm_channels (friendship_id, participant_a, participant_b)
  values (v_friendship, v_a, v_b)
  returning id into v_dm;
  return v_dm;
end $$;

-- Проверка доступности ника
create or replace function public.is_username_available(p_username text)
returns boolean language sql security definer set search_path = public stable as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(p_username)
  )
$$;

grant execute on function public.is_username_available(text) to anon;

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles     enable row level security;
alter table public.servers      enable row level security;
alter table public.members      enable row level security;
alter table public.channels     enable row level security;
alter table public.messages     enable row level security;
alter table public.friendships  enable row level security;
alter table public.dm_channels  enable row level security;
alter table public.dm_messages  enable row level security;
alter table public.voice_sessions enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- servers
drop policy if exists servers_select on public.servers;
create policy servers_select on public.servers
  for select to authenticated using (public.is_member(id) or owner_id = auth.uid());

drop policy if exists servers_insert_own on public.servers;
create policy servers_insert_own on public.servers
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists servers_update_admin on public.servers;
create policy servers_update_admin on public.servers
  for update to authenticated
  using (public.is_server_admin(id)) with check (public.is_server_admin(id));

drop policy if exists servers_delete_owner on public.servers;
create policy servers_delete_owner on public.servers
  for delete to authenticated using (public.is_server_owner(id));

-- members
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (user_id = auth.uid() or public.is_member(server_id));

drop policy if exists members_update_owner on public.members;
create policy members_update_owner on public.members
  for update to authenticated
  using (public.is_server_owner(server_id)) with check (public.is_server_owner(server_id));

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete to authenticated
  using (public.is_server_owner(server_id) or (user_id = auth.uid() and role <> 'OWNER'));

-- channels
drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
  for select to authenticated using (public.is_member(server_id));

drop policy if exists channels_insert_admin on public.channels;
create policy channels_insert_admin on public.channels
  for insert to authenticated with check (public.is_server_admin(server_id));

drop policy if exists channels_update_admin on public.channels;
create policy channels_update_admin on public.channels
  for update to authenticated
  using (public.is_server_admin(server_id)) with check (public.is_server_admin(server_id));

drop policy if exists channels_delete_admin on public.channels;
create policy channels_delete_admin on public.channels
  for delete to authenticated using (public.is_server_admin(server_id));

-- messages
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.is_member(public.channel_server(channel_id)));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_post(channel_id));

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages
  for delete to authenticated using (author_id = auth.uid());

-- friendships
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists friendships_update_addressee on public.friendships;
create policy friendships_update_addressee on public.friendships
  for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- dm_channels
drop policy if exists dm_channels_select on public.dm_channels;
create policy dm_channels_select on public.dm_channels
  for select to authenticated
  using (participant_a = auth.uid() or participant_b = auth.uid());

-- dm_messages
drop policy if exists dm_messages_select on public.dm_messages;
create policy dm_messages_select on public.dm_messages
  for select to authenticated using (public.is_dm_participant(channel_id));

drop policy if exists dm_messages_insert on public.dm_messages;
create policy dm_messages_insert on public.dm_messages
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_dm_participant(channel_id));

drop policy if exists dm_messages_update_own on public.dm_messages;
create policy dm_messages_update_own on public.dm_messages
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists dm_messages_delete_own on public.dm_messages;
create policy dm_messages_delete_own on public.dm_messages
  for delete to authenticated using (author_id = auth.uid());

-- voice_sessions
drop policy if exists voice_sessions_select on public.voice_sessions;
create policy voice_sessions_select on public.voice_sessions
  for select to authenticated
  using (public.is_member(public.channel_server(channel_id)));

drop policy if exists voice_sessions_insert on public.voice_sessions;
create policy voice_sessions_insert on public.voice_sessions
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(public.channel_server(channel_id)));

drop policy if exists voice_sessions_delete on public.voice_sessions;
create policy voice_sessions_delete on public.voice_sessions
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- Realtime
-- ============================================================

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.dm_messages;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.dm_channels;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.voice_sessions;
exception when others then null; end $$;
