create extension if not exists "pgcrypto";

do $$
begin
  create type supplement_inventory_movement_type as enum ('initial', 'purchase', 'sale', 'adjustment', 'damage', 'loss', 'expiration', 'correction');
exception when duplicate_object then null;
end $$;

alter type supplement_inventory_movement_type add value if not exists 'damage';
alter type supplement_inventory_movement_type add value if not exists 'loss';
alter type supplement_inventory_movement_type add value if not exists 'expiration';
alter type supplement_inventory_movement_type add value if not exists 'correction';

do $$
begin
  create type supplement_plan_status as enum ('draft', 'planning', 'approved', 'ordered', 'received', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type supplement_project_status as enum ('draft', 'active', 'paused', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type supplement_projection_scenario as enum ('conservative', 'base', 'expansive');
exception when duplicate_object then null;
end $$;

create table if not exists public.supplement_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category text not null,
  sku text unique,
  barcode text unique,
  description text,
  image_url text,
  purchase_cost numeric(12, 2) not null default 0 check (purchase_cost >= 0),
  transport_unit_cost numeric(12, 2) not null default 0 check (transport_unit_cost >= 0),
  tax_unit_cost numeric(12, 2) not null default 0 check (tax_unit_cost >= 0),
  commission_unit_cost numeric(12, 2) not null default 0 check (commission_unit_cost >= 0),
  other_unit_cost numeric(12, 2) not null default 0 check (other_unit_cost >= 0),
  additional_unit_cost numeric(12, 2) not null default 0 check (additional_unit_cost >= 0),
  total_unit_cost numeric(12, 2) not null default 0 check (total_unit_cost >= 0),
  sale_price numeric(12, 2) not null default 0 check (sale_price >= 0),
  target_margin_percent numeric(6, 2) not null default 30 check (target_margin_percent >= 0 and target_margin_percent < 100),
  current_stock integer not null default 0 check (current_stock >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  supplier_name text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supplement_products
  add column if not exists transport_unit_cost numeric(12, 2) not null default 0 check (transport_unit_cost >= 0);

alter table public.supplement_products
  add column if not exists tax_unit_cost numeric(12, 2) not null default 0 check (tax_unit_cost >= 0);

alter table public.supplement_products
  add column if not exists commission_unit_cost numeric(12, 2) not null default 0 check (commission_unit_cost >= 0);

alter table public.supplement_products
  add column if not exists other_unit_cost numeric(12, 2) not null default 0 check (other_unit_cost >= 0);

create table if not exists public.supplement_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.supplement_products(id),
  user_id uuid references public.profiles(id),
  movement_type supplement_inventory_movement_type not null,
  quantity integer not null,
  previous_stock integer not null check (previous_stock >= 0),
  new_stock integer not null check (new_stock >= 0),
  reason text,
  observations text,
  user_name text,
  profit numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.supplement_sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.supplement_products(id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  total_cost numeric(12, 2) not null default 0 check (total_cost >= 0),
  profit numeric(12, 2) not null default 0,
  margin_percentage numeric(6, 2) not null default 0,
  payment_method text not null default 'cash',
  customer_name text,
  notes text,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text
);

create table if not exists public.supplement_order_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status supplement_plan_status not null default 'draft',
  supplier_name text,
  budget numeric(12, 2) not null default 0 check (budget >= 0),
  expected_sale numeric(12, 2) not null default 0 check (expected_sale >= 0),
  expected_profit numeric(12, 2) not null default 0,
  planned_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplement_order_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.supplement_order_plans(id) on delete cascade,
  product_id uuid not null references public.supplement_products(id),
  planned_quantity integer not null check (planned_quantity > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  unit_sale_price numeric(12, 2) not null default 0 check (unit_sale_price >= 0),
  total_cost numeric(12, 2) not null default 0 check (total_cost >= 0),
  projected_sale numeric(12, 2) not null default 0 check (projected_sale >= 0),
  projected_profit numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.supplement_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status supplement_project_status not null default 'draft',
  objective text,
  start_date date,
  end_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplement_project_cycles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.supplement_projects(id) on delete cascade,
  name text not null,
  starts_at date,
  ends_at date,
  invested_capital numeric(12, 2) not null default 0 check (invested_capital >= 0),
  projected_revenue numeric(12, 2) not null default 0 check (projected_revenue >= 0),
  projected_profit numeric(12, 2) not null default 0,
  actual_revenue numeric(12, 2) not null default 0 check (actual_revenue >= 0),
  actual_profit numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplement_projections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.supplement_projects(id) on delete set null,
  cycle_id uuid references public.supplement_project_cycles(id) on delete set null,
  scenario supplement_projection_scenario not null default 'base',
  projected_units integer not null default 0 check (projected_units >= 0),
  projected_revenue numeric(12, 2) not null default 0 check (projected_revenue >= 0),
  projected_profit numeric(12, 2) not null default 0,
  actual_units integer not null default 0 check (actual_units >= 0),
  actual_revenue numeric(12, 2) not null default 0 check (actual_revenue >= 0),
  actual_profit numeric(12, 2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplement_products_category_idx on public.supplement_products(category);
create index if not exists supplement_products_brand_idx on public.supplement_products(brand);
create index if not exists supplement_products_active_idx on public.supplement_products(is_active);
create index if not exists supplement_inventory_movements_product_idx on public.supplement_inventory_movements(product_id, created_at desc);
create index if not exists supplement_sales_product_idx on public.supplement_sales(product_id, created_at desc);
create index if not exists supplement_sales_status_idx on public.supplement_sales(status, created_at desc);
create index if not exists supplement_order_plan_items_plan_idx on public.supplement_order_plan_items(plan_id);
create index if not exists supplement_projects_status_idx on public.supplement_projects(status);
create index if not exists supplement_projections_project_idx on public.supplement_projections(project_id);

alter table public.supplement_products enable row level security;
alter table public.supplement_inventory_movements enable row level security;
alter table public.supplement_sales enable row level security;
alter table public.supplement_order_plans enable row level security;
alter table public.supplement_order_plan_items enable row level security;
alter table public.supplement_projects enable row level security;
alter table public.supplement_project_cycles enable row level security;
alter table public.supplement_projections enable row level security;

drop policy if exists "supplement_products_public_read" on public.supplement_products;
create policy "supplement_products_public_read" on public.supplement_products
  for select using (true);

drop policy if exists "supplement_products_public_write" on public.supplement_products;
create policy "supplement_products_public_write" on public.supplement_products
  for all using (true) with check (true);

drop policy if exists "supplement_inventory_public_read" on public.supplement_inventory_movements;
create policy "supplement_inventory_public_read" on public.supplement_inventory_movements
  for select using (true);

drop policy if exists "supplement_inventory_public_write" on public.supplement_inventory_movements;
create policy "supplement_inventory_public_write" on public.supplement_inventory_movements
  for all using (true) with check (true);

drop policy if exists "supplement_sales_public_access" on public.supplement_sales;
create policy "supplement_sales_public_access" on public.supplement_sales
  for all using (true) with check (true);

drop policy if exists "supplement_plans_public_access" on public.supplement_order_plans;
create policy "supplement_plans_public_access" on public.supplement_order_plans
  for all using (true) with check (true);

drop policy if exists "supplement_plan_items_public_access" on public.supplement_order_plan_items;
create policy "supplement_plan_items_public_access" on public.supplement_order_plan_items
  for all using (true) with check (true);

drop policy if exists "supplement_projects_public_access" on public.supplement_projects;
create policy "supplement_projects_public_access" on public.supplement_projects
  for all using (true) with check (true);

drop policy if exists "supplement_cycles_public_access" on public.supplement_project_cycles;
create policy "supplement_cycles_public_access" on public.supplement_project_cycles
  for all using (true) with check (true);

drop policy if exists "supplement_projections_public_access" on public.supplement_projections;
create policy "supplement_projections_public_access" on public.supplement_projections
  for all using (true) with check (true);

create or replace function public.register_supplement_sale(
  p_sale_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_price numeric,
  p_payment_method text,
  p_customer_name text default null,
  p_notes text default null,
  p_created_by uuid default null
) returns public.supplement_sales
language plpgsql
security definer
as $$
declare
  v_product public.supplement_products%rowtype;
  v_sale public.supplement_sales%rowtype;
  v_subtotal numeric(12, 2);
  v_total_cost numeric(12, 2);
  v_profit numeric(12, 2);
begin
  select * into v_product
  from public.supplement_products
  where id = p_product_id and is_active = true
  for update;

  if not found then
    raise exception 'Producto no disponible';
  end if;

  if p_quantity <= 0 then
    raise exception 'Cantidad invalida';
  end if;

  if v_product.current_stock < p_quantity then
    raise exception 'Stock insuficiente. Disponible: % unidades.', v_product.current_stock;
  end if;

  v_subtotal := p_quantity * p_unit_price;
  v_total_cost := p_quantity * v_product.total_unit_cost;
  v_profit := v_subtotal - v_total_cost;

  insert into public.supplement_sales (
    id, product_id, product_name, quantity, unit_cost, unit_price, subtotal,
    total_cost, profit, margin_percentage, payment_method, customer_name,
    notes, status, created_by
  ) values (
    p_sale_id, p_product_id, v_product.name, p_quantity, v_product.total_unit_cost,
    p_unit_price, v_subtotal, v_total_cost, v_profit,
    case when v_subtotal = 0 then 0 else (v_profit / v_subtotal) * 100 end,
    p_payment_method, nullif(p_customer_name, ''), nullif(p_notes, ''),
    'completed', p_created_by
  )
  returning * into v_sale;

  update public.supplement_products
  set current_stock = current_stock - p_quantity,
      updated_at = now()
  where id = p_product_id;

  insert into public.supplement_inventory_movements (
    product_id, user_id, movement_type, quantity, previous_stock, new_stock,
    reason, observations, profit
  ) values (
    p_product_id, p_created_by, 'sale', -p_quantity, v_product.current_stock,
    v_product.current_stock - p_quantity, 'Venta suplemento ' || p_sale_id,
    p_notes, v_profit
  );

  return v_sale;
end;
$$;

create or replace function public.cancel_supplement_sale(
  p_sale_id uuid,
  p_reason text
) returns public.supplement_sales
language plpgsql
security definer
as $$
declare
  v_sale public.supplement_sales%rowtype;
  v_product public.supplement_products%rowtype;
begin
  select * into v_sale
  from public.supplement_sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;

  if v_sale.status = 'cancelled' then
    return v_sale;
  end if;

  select * into v_product
  from public.supplement_products
  where id = v_sale.product_id
  for update;

  update public.supplement_sales
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = p_reason
  where id = p_sale_id
  returning * into v_sale;

  if found then
    update public.supplement_products
    set current_stock = current_stock + v_sale.quantity,
        updated_at = now()
    where id = v_sale.product_id;

    insert into public.supplement_inventory_movements (
      product_id, movement_type, quantity, previous_stock, new_stock,
      reason, observations, profit
    ) values (
      v_sale.product_id, 'correction', v_sale.quantity,
      coalesce(v_product.current_stock, 0),
      coalesce(v_product.current_stock, 0) + v_sale.quantity,
      'Anulacion de venta de suplemento', p_reason, -v_sale.profit
    );
  end if;

  return v_sale;
end;
$$;
