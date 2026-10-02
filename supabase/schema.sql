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


-- 管理者アカウント管理
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null default '',
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.admin_accounts enable row level security;
revoke all on public.admin_accounts from anon, authenticated;

create or replace function public.admin_actor_ok(
  p_username text,
  p_password text
)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists(
    select 1
      from public.admin_accounts
     where username = lower(trim(p_username))
       and active = true
       and password_hash = crypt(p_password, password_hash)
  );
$$;

create or replace function public.list_admin_accounts(
  p_actor_username text,
  p_actor_password text
)
returns table (
  id uuid,
  username text,
  display_name text,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_login_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_actor_ok(p_actor_username, p_actor_password) then
    raise exception '管理者認証に失敗しました';
  end if;

  return query
    select a.id, a.username, a.display_name, a.active,
           a.created_at, a.updated_at, a.last_login_at
      from public.admin_accounts a
     order by a.active desc, a.username asc;
end;
$$;

create or replace function public.create_admin_account(
  p_actor_username text,
  p_actor_password text,
  p_username text,
  p_display_name text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id uuid;
  clean_username text := lower(trim(p_username));
begin
  if not public.admin_actor_ok(p_actor_username, p_actor_password) then
    raise exception '管理者認証に失敗しました';
  end if;

  if length(clean_username) < 3 or length(clean_username) > 50
     or clean_username !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'ユーザー名は3〜50文字の英数字・._-で入力してください';
  end if;

  if length(p_password) < 8 or length(p_password) > 72 then
    raise exception 'パスワードは8〜72文字で入力してください';
  end if;

  if exists(select 1 from public.admin_accounts where username = clean_username) then
    raise exception 'そのユーザー名はすでに使用されています';
  end if;

  insert into public.admin_accounts(username, display_name, password_hash)
  values(clean_username, trim(p_display_name), crypt(p_password, gen_salt('bf', 12)))
  returning id into new_id;

  return jsonb_build_object(
    'id', new_id,
    'username', clean_username,
    'display_name', trim(p_display_name),
    'active', true
  );
end;
$$;

create or replace function public.update_admin_account(
  p_actor_username text,
  p_actor_password text,
  p_id uuid,
  p_display_name text,
  p_password text default null,
  p_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.admin_accounts%rowtype;
  active_admin_count integer;
begin
  if not public.admin_actor_ok(p_actor_username, p_actor_password) then
    raise exception '管理者認証に失敗しました';
  end if;

  select * into target
    from public.admin_accounts
   where id = p_id
   for update;

  if target.id is null then
    raise exception '対象の管理者アカウントが見つかりません';
  end if;

  if p_password is not null
     and (length(p_password) < 8 or length(p_password) > 72) then
    raise exception 'パスワードは8〜72文字で入力してください';
  end if;

  if p_active = false and target.active then
    select count(*) into active_admin_count
      from public.admin_accounts
     where active = true;

    if active_admin_count <= 1 then
      raise exception '最後の有効な管理者は無効化できません';
    end if;
  end if;

  update public.admin_accounts
     set display_name = trim(coalesce(p_display_name, target.display_name)),
         password_hash = case
           when p_password is null then password_hash
           else crypt(p_password, gen_salt('bf', 12))
         end,
         active = coalesce(p_active, active),
         updated_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.delete_admin_account(
  p_actor_username text,
  p_actor_password text,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_active boolean;
  active_admin_count integer;
begin
  if not public.admin_actor_ok(p_actor_username, p_actor_password) then
    raise exception '管理者認証に失敗しました';
  end if;

  select active into target_active
    from public.admin_accounts
   where id = p_id
   for update;

  if target_active is null then
    raise exception '対象の管理者アカウントが見つかりません';
  end if;

  if target_active then
    select count(*) into active_admin_count
      from public.admin_accounts
     where active = true;

    if active_admin_count <= 1 then
      raise exception '最後の有効な管理者は削除できません';
    end if;
  end if;

  delete from public.admin_accounts where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke all on function public.admin_actor_ok(text, text) from public;
revoke all on function public.list_admin_accounts(text, text) from public;
revoke all on function public.create_admin_account(text, text, text, text, text) from public;
revoke all on function public.update_admin_account(text, text, uuid, text, text, boolean) from public;
revoke all on function public.delete_admin_account(text, text, uuid) from public;

grant execute on function public.admin_actor_ok(text, text) to anon, authenticated;
grant execute on function public.list_admin_accounts(text, text) to anon, authenticated;
grant execute on function public.create_admin_account(text, text, text, text, text) to anon, authenticated;
grant execute on function public.update_admin_account(text, text, uuid, text, text, boolean) to anon, authenticated;
grant execute on function public.delete_admin_account(text, text, uuid) to anon, authenticated;
