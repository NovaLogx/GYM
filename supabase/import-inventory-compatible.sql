-- BODY FIT - Importacion compatible de inventario actual.
-- Pega TODO este archivo en Supabase SQL Editor y ejecuta Run.
-- No registra ventas, no suma caja y no afecta reportes financieros.

create extension if not exists "pgcrypto";

alter table public.products
  add column if not exists image_url text,
  add column if not exists purchase_cost_total numeric(12, 2);

alter table public.inventory
  add column if not exists inventory_date date not null default current_date,
  add column if not exists week_start date not null default (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day'))::date,
  add column if not exists week_end date not null default (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day') + interval '5 day')::date;

create unique index if not exists idx_bodyfit_categories_name_unique
  on public.categories (lower(trim(name)));

insert into public.categories (name)
select category_name
from (values ('Aguas'), ('Hidratantes'), ('Energizantes')) as seed(category_name)
where not exists (
  select 1
  from public.categories categories
  where lower(trim(categories.name)) = lower(trim(seed.category_name))
);

with product_seed(name, sku, category, quantity, min_quantity, ideal_quantity, purchase_cost_total, purchase_cost, sale_price, image_url) as (
  values
    ('Agua litro', 'AGUA-LITRO', 'Aguas', 12, 4, 12, 20000, 1666, 3500, './assets/product-images/agua-litro-current.jpg'),
    ('Agua personal', 'AGUA-PERSONAL', 'Aguas', 24, 8, 24, 26000, 1083, 2500, './assets/product-images/agua-personal.png'),
    ('Vive 100', 'VIVE-100', 'Hidratantes', 6, 2, 6, 13000, 2166, 3000, './assets/product-images/vive100-current.jpg'),
    ('Amper', 'AMPER', 'Energizantes', 6, 2, 6, 17000, 2833, 4000, './assets/product-images/amper-current.jpg'),
    ('Squash', 'SQUASH', 'Hidratantes', 12, 4, 12, 31000, 2583, 3500, './assets/product-images/squash-current.jpg')
),
matched_categories as (
  select distinct on (lower(trim(name)))
    id,
    name
  from public.categories
  order by lower(trim(name)), created_at asc
),
upserted_products as (
  insert into public.products (name, sku, category_id, sale_price, purchase_cost, purchase_cost_total, status, supplier_name, image_url)
  select
    product_seed.name,
    product_seed.sku,
    matched_categories.id,
    product_seed.sale_price,
    product_seed.purchase_cost,
    product_seed.purchase_cost_total,
    'active'::product_status,
    'Inventario actual',
    product_seed.image_url
  from product_seed
  join matched_categories on lower(trim(matched_categories.name)) = lower(trim(product_seed.category))
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
  select id
  from public.products
  where status = 'discontinued'::product_status
);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;

drop policy if exists "bodyfit anon read categories" on public.categories;
drop policy if exists "bodyfit anon read products" on public.products;
drop policy if exists "bodyfit anon read inventory" on public.inventory;
drop policy if exists "bodyfit anon write categories" on public.categories;
drop policy if exists "bodyfit anon write products" on public.products;
drop policy if exists "bodyfit anon write inventory" on public.inventory;
drop policy if exists "bodyfit anon update products" on public.products;
drop policy if exists "bodyfit anon update inventory" on public.inventory;

create policy "bodyfit anon read categories" on public.categories for select to anon using (true);
create policy "bodyfit anon read products" on public.products for select to anon using (true);
create policy "bodyfit anon read inventory" on public.inventory for select to anon using (true);
create policy "bodyfit anon write categories" on public.categories for insert to anon with check (true);
create policy "bodyfit anon write products" on public.products for insert to anon with check (true);
create policy "bodyfit anon write inventory" on public.inventory for insert to anon with check (true);
create policy "bodyfit anon update products" on public.products for update to anon using (true) with check (true);
create policy "bodyfit anon update inventory" on public.inventory for update to anon using (true) with check (true);

select
  products.name,
  products.sku,
  categories.name as category,
  inventory.current_quantity as quantity,
  products.purchase_cost_total,
  products.purchase_cost,
  products.sale_price,
  products.status,
  products.image_url
from public.products products
join public.categories categories on categories.id = products.category_id
join public.inventory inventory on inventory.product_id = products.id
where products.sku in ('AGUA-LITRO', 'AGUA-PERSONAL', 'VIVE-100', 'AMPER', 'SQUASH')
order by products.name;
