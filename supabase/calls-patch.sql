-- ============================================================
-- Рупор — патч: таблица звонков (calls)
-- Запускать после schema.sql
-- ============================================================

-- ── calls: состояние звонка 1-на-1 ──────────────────────────
do $$ begin
  create type public.call_status as enum ('ringing','active','ended','missed','declined');
exception when duplicate_object then null; end $$;

create table if not exists public.calls (
  id           uuid primary key default gen_random_uuid(),
  caller_id    uuid not null references public.profiles (id) on delete cascade,
  callee_id    uuid not null references public.profiles (id) on delete cascade,
  status       public.call_status not null default 'ringing',
  livekit_room text not null,
  started_at   timestamptz,
  ended_at     timestamptz,
  created_at   timestamptz not null default now(),
  constraint no_self_call check (caller_id <> callee_id)
);

create index if not exists calls_callee_idx on public.calls (callee_id, status);
create index if not exists calls_caller_idx on public.calls (caller_id, status);

alter table public.calls replica identity full;

-- ── RLS ──────────────────────────────────────────────────────
alter table public.calls enable row level security;

drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls
  for select to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid());

drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls
  for insert to authenticated
  with check (caller_id = auth.uid());

drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls
  for update to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid())
  with check (caller_id = auth.uid() or callee_id = auth.uid());

-- ── Realtime ─────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when others then null; end $$;

-- ── RPC: инициировать звонок ─────────────────────────────────
drop function if exists public.initiate_call(uuid) cascade;
drop function if exists public.answer_call(uuid) cascade;
drop function if exists public.end_call(uuid, text) cascade;

create or replace function public.initiate_call(p_callee_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid := gen_random_uuid();
  v_room text := 'call-' || replace(v_id::text, '-', '');
begin
  if p_callee_id = auth.uid() then
    raise exception 'SELF_CALL' using errcode = '23514';
  end if;
  -- Получатель должен существовать — иначе FK вернёт невнятную ошибку
  if not exists (select 1 from public.profiles where id = p_callee_id) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Не звоним если уже есть активный звонок с этим пользователем
  if exists (
    select 1 from public.calls
    where status in ('ringing','active')
      and ((caller_id = auth.uid() and callee_id = p_callee_id)
        or (caller_id = p_callee_id and callee_id = auth.uid()))
  ) then
    raise exception 'CALL_ALREADY_ACTIVE' using errcode = '23505';
  end if;

  insert into public.calls (id, caller_id, callee_id, livekit_room)
  values (v_id, auth.uid(), p_callee_id, v_room);

  return v_id;
end $$;

-- ── RPC: ответить на звонок ───────────────────────────────────
create or replace function public.answer_call(p_call_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_room text;
begin
  update public.calls
  set status = 'active', started_at = now()
  where id = p_call_id and callee_id = auth.uid() and status = 'ringing'
  returning livekit_room into v_room;
  if not found then raise exception 'CALL_NOT_FOUND' using errcode = 'P0002'; end if;
  return v_room;
end $$;

-- ── RPC: завершить/отклонить звонок ──────────────────────────
create or replace function public.end_call(p_call_id uuid, p_status text default 'ended')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('ended','declined','missed') then
    raise exception 'BAD_STATUS' using errcode = '22023';
  end if;
  update public.calls
  set status = p_status::public.call_status, ended_at = now()
  where id = p_call_id
    and (caller_id = auth.uid() or callee_id = auth.uid())
    and status in ('ringing','active');
end $$;
