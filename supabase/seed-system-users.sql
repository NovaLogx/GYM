-- BODY FIT Software - usuarios base del sistema
-- Ejecutar cuando la pantalla de login no muestre usuarios desde Supabase.

alter table public.profiles
  add column if not exists password text,
  add column if not exists pin text;

alter table public.profiles enable row level security;

drop policy if exists "anon read profiles" on public.profiles;
drop policy if exists "anon write profiles" on public.profiles;
drop policy if exists "anon update profiles" on public.profiles;
drop policy if exists "anon delete profiles" on public.profiles;

create policy "anon read profiles" on public.profiles for select to anon using (true);
create policy "anon write profiles" on public.profiles for insert to anon with check (true);
create policy "anon update profiles" on public.profiles for update to anon using (true) with check (true);
create policy "anon delete profiles" on public.profiles for delete to anon using (true);

update public.profiles
set status = 'inactive'::profile_status,
    pin = null,
    updated_at = now()
where lower(trim(full_name)) = 'super admin';

with default_users(full_name, role, status, password) as (
  values
    ('Super Administrador', 'superadmin'::user_role, 'active'::profile_status, 'Superadmin'),
    ('Administrador', 'admin'::user_role, 'active'::profile_status, null),
    ('Operador', 'cashier'::user_role, 'active'::profile_status, null)
),
updated_users as (
  update public.profiles profiles
  set
    role = default_users.role,
    status = default_users.status,
    password = coalesce(default_users.password, profiles.password),
    pin = null,
    updated_at = now()
  from default_users
  where lower(trim(profiles.full_name)) = lower(trim(default_users.full_name))
  returning profiles.full_name
)
insert into public.profiles (full_name, role, status, password, pin)
select default_users.full_name, default_users.role, default_users.status, default_users.password, null
from default_users
where not exists (
  select 1
  from public.profiles profiles
  where lower(trim(profiles.full_name)) = lower(trim(default_users.full_name))
);

select
  full_name,
  role,
  status,
  case when password is null or password = '' then 'sin contraseña' else 'configurada' end as password_estado
from public.profiles
where lower(trim(full_name)) in ('super administrador', 'administrador', 'operador', 'super admin')
order by full_name;
