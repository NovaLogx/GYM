-- BODY FIT Software - migracion de produccion Supabase
-- Ejecutar en Supabase SQL Editor sobre el proyecto jsettiedrwawrfbeiiei.
-- Esta migracion no borra ventas ni movimientos. Solo completa estructura,
-- carga el inventario actual y deja preparados permisos para la app web.

create extension if not exists "pgcrypto";

alter table public.products
  add column if not exists image_url text,
  add column if not exists purchase_cost_total numeric(12, 2);

alter table public.profiles
  add column if not exists password text,
  add column if not exists pin text;

alter table public.inventory
  add column if not exists inventory_date date not null default current_date,
  add column if not exists week_start date not null default (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day'))::date,
  add column if not exists week_end date not null default (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day') + interval '5 day')::date;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  normalized_name text not null unique,
  phone text,
  email text,
  document_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  plan text not null default 'Mensual',
  start_date date not null,
  end_date date not null,
  status text not null default 'activa',
  price numeric(12, 2) not null default 50000,
  payment_method text,
  notes text,
  is_initial_import boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, start_date, end_date)
);

alter table public.cash_movements
  add column if not exists type text,
  add column if not exists category text,
  add column if not exists payment_method_text text,
  add column if not exists related_table text,
  add column if not exists related_id uuid,
  add column if not exists is_initial_import boolean not null default false,
  add column if not exists occurred_at timestamptz not null default now();

create index if not exists idx_clients_normalized_name on public.clients(normalized_name);
create index if not exists idx_memberships_client_id on public.memberships(client_id);
create index if not exists idx_memberships_end_date on public.memberships(end_date);
create index if not exists idx_memberships_status on public.memberships(status);
create index if not exists idx_cash_movements_occurred_at on public.cash_movements(occurred_at);
create index if not exists idx_cash_movements_category_text on public.cash_movements(category);
create unique index if not exists idx_cash_movements_related_unique
  on public.cash_movements(related_table, related_id, category)
  where related_table is not null and related_id is not null and category is not null;

alter table public.clients enable row level security;
alter table public.memberships enable row level security;

drop policy if exists "anon read clients" on public.clients;
drop policy if exists "anon insert clients" on public.clients;
drop policy if exists "anon update clients" on public.clients;
drop policy if exists "anon delete clients" on public.clients;
create policy "anon read clients" on public.clients for select to anon using (true);
create policy "anon insert clients" on public.clients for insert to anon with check (true);
create policy "anon update clients" on public.clients for update to anon using (true) with check (true);
create policy "anon delete clients" on public.clients for delete to anon using (true);

drop policy if exists "anon read memberships" on public.memberships;
drop policy if exists "anon insert memberships" on public.memberships;
drop policy if exists "anon update memberships" on public.memberships;
drop policy if exists "anon delete memberships" on public.memberships;
create policy "anon read memberships" on public.memberships for select to anon using (true);
create policy "anon insert memberships" on public.memberships for insert to anon with check (true);
create policy "anon update memberships" on public.memberships for update to anon using (true) with check (true);
create policy "anon delete memberships" on public.memberships for delete to anon using (true);

drop policy if exists "anon write profiles" on public.profiles;
drop policy if exists "anon update profiles" on public.profiles;
drop policy if exists "anon delete profiles" on public.profiles;
drop policy if exists "anon read profiles" on public.profiles;
create policy "anon read profiles" on public.profiles for select to anon using (true);
create policy "anon write profiles" on public.profiles for insert to anon with check (true);
create policy "anon update profiles" on public.profiles for update to anon using (true) with check (true);
create policy "anon delete profiles" on public.profiles for delete to anon using (true);

drop policy if exists "anon write categories" on public.categories;
drop policy if exists "anon update categories" on public.categories;
create policy "anon write categories" on public.categories for insert to anon with check (true);
create policy "anon update categories" on public.categories for update to anon using (true) with check (true);

drop policy if exists "anon write products" on public.products;
drop policy if exists "anon update products" on public.products;
drop policy if exists "anon delete products" on public.products;
create policy "anon write products" on public.products for insert to anon with check (true);
create policy "anon update products" on public.products for update to anon using (true) with check (true);
create policy "anon delete products" on public.products for delete to anon using (true);

drop policy if exists "anon write inventory" on public.inventory;
drop policy if exists "anon update inventory" on public.inventory;
create policy "anon write inventory" on public.inventory for insert to anon with check (true);
create policy "anon update inventory" on public.inventory for update to anon using (true) with check (true);

drop policy if exists "anon read cash_registers" on public.cash_registers;
drop policy if exists "anon write cash_registers" on public.cash_registers;
drop policy if exists "anon update cash_registers" on public.cash_registers;
drop policy if exists "anon delete cash_registers" on public.cash_registers;
create policy "anon read cash_registers" on public.cash_registers for select to anon using (true);
create policy "anon write cash_registers" on public.cash_registers for insert to anon with check (true);
create policy "anon update cash_registers" on public.cash_registers for update to anon using (true) with check (true);
create policy "anon delete cash_registers" on public.cash_registers for delete to anon using (true);

drop policy if exists "anon read sales" on public.sales;
drop policy if exists "anon write sales" on public.sales;
drop policy if exists "anon update sales" on public.sales;
create policy "anon read sales" on public.sales for select to anon using (true);
create policy "anon write sales" on public.sales for insert to anon with check (true);
create policy "anon update sales" on public.sales for update to anon using (true) with check (true);

drop policy if exists "anon read sale_items" on public.sale_items;
drop policy if exists "anon write sale_items" on public.sale_items;
create policy "anon read sale_items" on public.sale_items for select to anon using (true);
create policy "anon write sale_items" on public.sale_items for insert to anon with check (true);

drop policy if exists "anon read inventory_movements" on public.inventory_movements;
drop policy if exists "anon write inventory_movements" on public.inventory_movements;
create policy "anon read inventory_movements" on public.inventory_movements for select to anon using (true);
create policy "anon write inventory_movements" on public.inventory_movements for insert to anon with check (true);

drop policy if exists "anon read cash_movements" on public.cash_movements;
drop policy if exists "anon write cash_movements" on public.cash_movements;
create policy "anon read cash_movements" on public.cash_movements for select to anon using (true);
create policy "anon write cash_movements" on public.cash_movements for insert to anon with check (true);

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

insert into public.categories (name)
values ('Aguas'), ('Hidratantes'), ('Energizantes')
on conflict (name) do nothing;

with product_seed(name, sku, category, quantity, min_quantity, ideal_quantity, purchase_cost_total, purchase_cost, sale_price, image_url) as (
  values
    ('Agua litro', 'AGUA-LITRO', 'Aguas', 12, 4, 12, 20000, 1666, 3500, './assets/product-images/agua-litro-current.jpg'),
    ('Agua personal', 'AGUA-PERSONAL', 'Aguas', 24, 8, 24, 26000, 1083, 2500, './assets/product-images/agua-personal.png'),
    ('Vive 100', 'VIVE-100', 'Hidratantes', 6, 2, 6, 13000, 2166, 3000, './assets/product-images/vive100-current.jpg'),
    ('Amper', 'AMPER', 'Energizantes', 6, 2, 6, 17000, 2833, 4000, './assets/product-images/amper-current.jpg'),
    ('Squash', 'SQUASH', 'Hidratantes', 12, 4, 12, 31000, 2583, 3500, './assets/product-images/squash-current.jpg')
),
upserted_products as (
  insert into public.products (name, sku, category_id, sale_price, purchase_cost, purchase_cost_total, status, supplier_name, image_url)
  select
    product_seed.name,
    product_seed.sku,
    categories.id,
    product_seed.sale_price,
    product_seed.purchase_cost,
    product_seed.purchase_cost_total,
    'active'::product_status,
    'Inventario actual',
    product_seed.image_url
  from product_seed
  join public.categories categories on categories.name = product_seed.category
  on conflict (sku) do update set
    name = excluded.name,
    category_id = excluded.category_id,
    sale_price = excluded.sale_price,
    purchase_cost = excluded.purchase_cost,
    purchase_cost_total = excluded.purchase_cost_total,
    status = 'active'::product_status,
    supplier_name = excluded.supplier_name,
    image_url = excluded.image_url,
    updated_at = now()
  returning id, sku
)
insert into public.inventory (product_id, current_quantity, min_quantity, ideal_quantity, inventory_date, week_start, week_end)
select
  upserted_products.id,
  product_seed.quantity,
  product_seed.min_quantity,
  product_seed.ideal_quantity,
  current_date,
  (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day'))::date,
  (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day') + interval '5 day')::date
from upserted_products
join product_seed on product_seed.sku = upserted_products.sku
on conflict (product_id) do update set
  current_quantity = excluded.current_quantity,
  min_quantity = excluded.min_quantity,
  ideal_quantity = excluded.ideal_quantity,
  inventory_date = excluded.inventory_date,
  week_start = excluded.week_start,
  week_end = excluded.week_end,
  updated_at = now();

update public.products
set status = 'discontinued'::product_status, updated_at = now()
where sku not in ('AGUA-LITRO', 'AGUA-PERSONAL', 'VIVE-100', 'AMPER', 'SQUASH');

update public.inventory
set current_quantity = 0, updated_at = now()
where product_id in (
  select id from public.products
  where status = 'discontinued'::product_status
);
