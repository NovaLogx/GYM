-- BODY FIT - Inventario actual
-- Importa solo los productos definidos actualmente y desactiva el resto.
-- No registra ventas, no suma caja y no afecta reportes financieros.

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
  select id
  from public.products
  where status = 'discontinued'::product_status
);

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
