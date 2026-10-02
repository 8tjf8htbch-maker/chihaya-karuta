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


-- 管理者アカウント
-- パスワードは平文では保存せず、pgcryptoのcrypt/bcryptでハッシュ化します。
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

-- 初期管理者。既存の固定ログイン情報を管理者アカウントへ移行するための初期値です。
insert into public.admin_accounts (username, display_name, password_hash)
values ('admin', '初期管理者', crypt('kokupyon', gen_salt('bf', 12)))
on conflict (username) do nothing;

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
  actor_ok boolean;
  new_id uuid;
begin
  select exists(
    select 1 from public.admin_accounts
     where username = lower(trim(p_actor_username))
       and active = true
       and password_hash = crypt(p_actor_password, password_hash)
  ) into actor_ok;

  if not actor_ok then
    raise exception '管理者認証に失敗しました';
  end if;

  if length(trim(p_username)) < 3 or length(trim(p_username)) > 50 then
    raise exception 'ユーザー名は3〜50文字で入力してください';
  end if;
  if trim(p_username) !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'ユーザー名は英数字、ピリオド、アンダースコア、ハイフンのみ使用できます';
  end if;
  if length(p_password) < 8 or length(p_password) > 72 then
    raise exception 'パスワードは8〜72文字で入力してください';
  end if;
  if exists(select 1 from public.admin_accounts where username=lower(trim(p_username))) then
    raise exception 'そのユーザー名はすでに使用されています';
  end if;

  insert into public.admin_accounts(username,display_name,password_hash)
  values(lower(trim(p_username)),trim(p_display_name),crypt(p_password,gen_salt('bf',12)))
  returning id into new_id;

  return jsonb_build_object('id',new_id,'username',lower(trim(p_username)),'display_name',trim(p_display_name),'active',true);
end;
$$;

revoke all on function public.create_admin_account(text,text,text,text,text) from public;
grant execute on function public.create_admin_account(text,text,text,text,text) to anon, authenticated;
