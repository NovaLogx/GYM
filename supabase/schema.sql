create extension if not exists "pgcrypto";

do $$
begin
  create type user_role as enum ('superadmin', 'admin', 'cashier');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type profile_status as enum ('active', 'inactive');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type product_status as enum ('active', 'out_of_stock', 'discontinued');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type inventory_movement_type as enum ('initial', 'purchase', 'sale', 'adjustment');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type cash_register_status as enum ('open', 'closed', 'reviewed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type cash_movement_type as enum ('sale', 'manual_income', 'expense', 'adjustment');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type payment_method as enum ('cash', 'transfer', 'other');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type sale_status as enum ('completed', 'voided');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type alert_status as enum ('active', 'resolved');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text not null,
  role user_role not null default 'cashier',
  status profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  barcode text unique,
  category_id uuid not null references public.categories(id),
  sale_price numeric(12, 2) not null check (sale_price > 0),
  purchase_cost numeric(12, 2) not null check (purchase_cost >= 0),
  status product_status not null default 'active',
  supplier_name text,
  expiration_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id),
  current_quantity integer not null default 0 check (current_quantity >= 0),
  min_quantity integer not null default 0 check (min_quantity >= 0),
  ideal_quantity integer not null default 0 check (ideal_quantity >= 0),
  inventory_date date not null default current_date,
  week_start date not null default (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day'))::date,
  week_end date not null default (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day') + interval '5 day')::date,
  updated_at timestamptz not null default now()
);

alter table public.inventory
  add column if not exists inventory_date date not null default current_date;

alter table public.inventory
  add column if not exists week_start date not null default (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day'))::date;

alter table public.inventory
  add column if not exists week_end date not null default (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day') + interval '5 day')::date;

create table if not exists public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references public.profiles(id),
  closed_by uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  initial_amount numeric(12, 2) not null default 0 check (initial_amount >= 0),
  cash_total numeric(12, 2) not null default 0,
  transfer_total numeric(12, 2) not null default 0,
  other_total numeric(12, 2) not null default 0,
  expense_total numeric(12, 2) not null default 0,
  expected_total numeric(12, 2) generated always as (initial_amount + cash_total + other_total - expense_total) stored,
  counted_amount numeric(12, 2),
  difference numeric(12, 2),
  status cash_register_status not null default 'open',
  notes text,
  constraint counted_amount_required_when_closed check (
    status = 'open' or counted_amount is not null
  )
);

create unique index if not exists one_open_cash_register
  on public.cash_registers ((status))
  where status = 'open';

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number bigint generated always as identity,
  cash_register_id uuid not null references public.cash_registers(id),
  user_id uuid not null references public.profiles(id),
  payment_method payment_method not null,
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  total_cost numeric(12, 2) not null check (total_cost >= 0),
  gross_profit numeric(12, 2) not null,
  status sale_status not null default 'completed',
  void_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  subtotal numeric(12, 2) not null,
  profit numeric(12, 2) not null
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  user_id uuid not null references public.profiles(id),
  sale_id uuid references public.sales(id),
  movement_type inventory_movement_type not null,
  quantity_change integer not null,
  previous_quantity integer not null check (previous_quantity >= 0),
  new_quantity integer not null check (new_quantity >= 0),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_registers(id),
  user_id uuid not null references public.profiles(id),
  sale_id uuid references public.sales(id),
  movement_type cash_movement_type not null,
  payment_method payment_method,
  amount numeric(12, 2) not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  title text not null,
  description text,
  status alert_status not null default 'active',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  action text not null,
  entity_name text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.cash_registers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.cash_movements enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_logs enable row level security;
