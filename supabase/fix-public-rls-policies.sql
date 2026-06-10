alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.cash_registers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.cash_movements enable row level security;
alter table public.clients enable row level security;
alter table public.memberships enable row level security;

drop policy if exists "bodyfit anon read profiles" on public.profiles;
drop policy if exists "bodyfit anon write profiles" on public.profiles;
drop policy if exists "bodyfit anon update profiles" on public.profiles;
drop policy if exists "bodyfit anon delete profiles" on public.profiles;
create policy "bodyfit anon read profiles" on public.profiles for select to anon using (true);
create policy "bodyfit anon write profiles" on public.profiles for insert to anon with check (true);
create policy "bodyfit anon update profiles" on public.profiles for update to anon using (true) with check (true);
create policy "bodyfit anon delete profiles" on public.profiles for delete to anon using (true);

drop policy if exists "bodyfit anon read categories" on public.categories;
drop policy if exists "bodyfit anon write categories" on public.categories;
drop policy if exists "bodyfit anon update categories" on public.categories;
create policy "bodyfit anon read categories" on public.categories for select to anon using (true);
create policy "bodyfit anon write categories" on public.categories for insert to anon with check (true);
create policy "bodyfit anon update categories" on public.categories for update to anon using (true) with check (true);

drop policy if exists "bodyfit anon read products" on public.products;
drop policy if exists "bodyfit anon write products" on public.products;
drop policy if exists "bodyfit anon update products" on public.products;
drop policy if exists "bodyfit anon delete products" on public.products;
create policy "bodyfit anon read products" on public.products for select to anon using (true);
create policy "bodyfit anon write products" on public.products for insert to anon with check (true);
create policy "bodyfit anon update products" on public.products for update to anon using (true) with check (true);
create policy "bodyfit anon delete products" on public.products for delete to anon using (true);

drop policy if exists "bodyfit anon read inventory" on public.inventory;
drop policy if exists "bodyfit anon write inventory" on public.inventory;
drop policy if exists "bodyfit anon update inventory" on public.inventory;
create policy "bodyfit anon read inventory" on public.inventory for select to anon using (true);
create policy "bodyfit anon write inventory" on public.inventory for insert to anon with check (true);
create policy "bodyfit anon update inventory" on public.inventory for update to anon using (true) with check (true);

drop policy if exists "bodyfit anon read cash_registers" on public.cash_registers;
drop policy if exists "bodyfit anon write cash_registers" on public.cash_registers;
drop policy if exists "bodyfit anon update cash_registers" on public.cash_registers;
drop policy if exists "bodyfit anon delete cash_registers" on public.cash_registers;
create policy "bodyfit anon read cash_registers" on public.cash_registers for select to anon using (true);
create policy "bodyfit anon write cash_registers" on public.cash_registers for insert to anon with check (true);
create policy "bodyfit anon update cash_registers" on public.cash_registers for update to anon using (true) with check (true);
create policy "bodyfit anon delete cash_registers" on public.cash_registers for delete to anon using (true);

drop policy if exists "bodyfit anon read sales" on public.sales;
drop policy if exists "bodyfit anon write sales" on public.sales;
drop policy if exists "bodyfit anon update sales" on public.sales;
create policy "bodyfit anon read sales" on public.sales for select to anon using (true);
create policy "bodyfit anon write sales" on public.sales for insert to anon with check (true);
create policy "bodyfit anon update sales" on public.sales for update to anon using (true) with check (true);

drop policy if exists "bodyfit anon read sale_items" on public.sale_items;
drop policy if exists "bodyfit anon write sale_items" on public.sale_items;
create policy "bodyfit anon read sale_items" on public.sale_items for select to anon using (true);
create policy "bodyfit anon write sale_items" on public.sale_items for insert to anon with check (true);

drop policy if exists "bodyfit anon read inventory_movements" on public.inventory_movements;
drop policy if exists "bodyfit anon write inventory_movements" on public.inventory_movements;
create policy "bodyfit anon read inventory_movements" on public.inventory_movements for select to anon using (true);
create policy "bodyfit anon write inventory_movements" on public.inventory_movements for insert to anon with check (true);

drop policy if exists "bodyfit anon read cash_movements" on public.cash_movements;
drop policy if exists "bodyfit anon write cash_movements" on public.cash_movements;
create policy "bodyfit anon read cash_movements" on public.cash_movements for select to anon using (true);
create policy "bodyfit anon write cash_movements" on public.cash_movements for insert to anon with check (true);

drop policy if exists "bodyfit anon read clients" on public.clients;
drop policy if exists "bodyfit anon write clients" on public.clients;
drop policy if exists "bodyfit anon update clients" on public.clients;
drop policy if exists "bodyfit anon delete clients" on public.clients;
create policy "bodyfit anon read clients" on public.clients for select to anon using (true);
create policy "bodyfit anon write clients" on public.clients for insert to anon with check (true);
create policy "bodyfit anon update clients" on public.clients for update to anon using (true) with check (true);
create policy "bodyfit anon delete clients" on public.clients for delete to anon using (true);

drop policy if exists "bodyfit anon read memberships" on public.memberships;
drop policy if exists "bodyfit anon write memberships" on public.memberships;
drop policy if exists "bodyfit anon update memberships" on public.memberships;
drop policy if exists "bodyfit anon delete memberships" on public.memberships;
create policy "bodyfit anon read memberships" on public.memberships for select to anon using (true);
create policy "bodyfit anon write memberships" on public.memberships for insert to anon with check (true);
create policy "bodyfit anon update memberships" on public.memberships for update to anon using (true) with check (true);
create policy "bodyfit anon delete memberships" on public.memberships for delete to anon using (true);
