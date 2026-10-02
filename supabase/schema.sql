-- 國大練習 Shared Data / Supabase
-- Run this once in the Supabase SQL Editor.

create table if not exists public.app_state (
  id bigint primary key,
  revision bigint not null default 0,
  state jsonb not null default jsonb_build_object(
    'players', '[]'::jsonb,
    'practices', '[]'::jsonb,
    'currentPracticeId', null
  ),
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "public can read app state" on public.app_state;
create policy "public can read app state"
  on public.app_state
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.app_state from anon, authenticated;
grant select on public.app_state to anon, authenticated;

insert into public.app_state (id, revision, state)
values (
  1,
  0,
  jsonb_build_object(
    'players', '[]'::jsonb,
    'practices', '[]'::jsonb,
    'currentPracticeId', null
  )
)
on conflict (id) do nothing;

create or replace function public.save_app_state(
  p_base_revision bigint,
  p_state jsonb
)
returns table (
  ok boolean,
  conflict boolean,
  revision bigint,
  state jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_revision bigint;
  current_state jsonb;
begin
  select s.revision, s.state
    into current_revision, current_state
    from public.app_state s
   where s.id = 1
   for update;

  if current_revision is null then
    insert into public.app_state(id, revision, state)
    values (1, 1, p_state)
    on conflict (id) do nothing;

    select s.revision, s.state
      into current_revision, current_state
      from public.app_state s
     where s.id = 1
     for update;
  end if;

  if current_revision <> p_base_revision then
    return query
      select false, true, current_revision, current_state;
    return;
  end if;

  update public.app_state
     set revision = current_revision + 1,
         state = p_state,
         updated_at = now()
   where id = 1;

  return query
    select true, false, current_revision + 1, p_state;
end;
$$;

revoke all on function public.save_app_state(bigint, jsonb) from public;
grant execute on function public.save_app_state(bigint, jsonb) to anon, authenticated;

alter table public.app_state replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;
