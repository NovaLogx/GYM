create policy "public can read categories"
on public.categories
for select
to anon, authenticated
using (true);

create policy "public can read products"
on public.products
for select
to anon, authenticated
using (true);

create policy "public can read inventory"
on public.inventory
for select
to anon, authenticated
using (true);

