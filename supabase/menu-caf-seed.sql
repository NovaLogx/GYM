with category_seed(name) as (
  values
    ('Shakes de Proteina'),
    ('Shots Energeticos'),
    ('Preparados'),
    ('Wraps'),
    ('Snacks'),
    ('Bebidas'),
    ('Energizantes'),
    ('Hidratacion')
)
insert into public.categories (name)
select name from category_seed
on conflict (name) do nothing;

with product_seed(name, sku, category_name, sale_price, purchase_cost, min_quantity, ideal_quantity) as (
  values
    ('Proteina calorica', 'CAF-PROT-CAL', 'Shakes de Proteina', 10000, 4643, 5, 20),
    ('Proteina hipo calorica', 'CAF-PROT-HIPO', 'Shakes de Proteina', 12000, 5200, 5, 20),
    ('Shot energetico C4', 'CAF-SHOT-C4', 'Shots Energeticos', 5000, 2333, 10, 60),
    ('Creatina CR7 shot', 'CAF-SHOT-CR7', 'Shots Energeticos', 2000, 929, 10, 70),
    ('Cafeina shot', 'CAF-SHOT-CAF', 'Shots Energeticos', 1000, 500, 10, 90),
    ('BCAA shot', 'CAF-SHOT-BCAA', 'Shots Energeticos', 3000, 1600, 10, 50),
    ('Glutamina shot', 'CAF-SHOT-GLUT', 'Shots Energeticos', 2000, 900, 10, 50),
    ('Colageno shot', 'CAF-SHOT-COL', 'Shots Energeticos', 1500, 767, 10, 60),
    ('Ashwagandha shot', 'CAF-SHOT-ASH', 'Shots Energeticos', 1500, 650, 10, 100),
    ('Parfait', 'CAF-PARFAIT', 'Preparados', 8000, 4333, 3, 12),
    ('Wrap pollo', 'CAF-WRAP-POLLO', 'Wraps', 12000, 6000, 3, 10),
    ('Wrap atun', 'CAF-WRAP-ATUN', 'Wraps', 12000, 6000, 3, 10),
    ('Wrap carne', 'CAF-WRAP-CARNE', 'Wraps', 12000, 6000, 3, 10),
    ('Bocadillo', 'CAF-SNACK-BOCADILLO', 'Snacks', 500, 238, 10, 21),
    ('Frutos secos', 'CAF-SNACK-FRUTOS', 'Snacks', 2500, 1700, 5, 10),
    ('Agua Litro', 'CAF-BEB-AGUA-L', 'Bebidas', 3500, 1833, 6, 12),
    ('Agua Personal', 'CAF-BEB-AGUA-P', 'Bebidas', 2500, 1146, 12, 24),
    ('Agua con Gas', 'CAF-BEB-AGUA-GAS', 'Bebidas', 1500, 833, 6, 12),
    ('Bolsa Agua', 'CAF-BEB-BOLSA-AGUA', 'Bebidas', 500, 200, 20, 100),
    ('Amper', 'CAF-BEB-AMPER', 'Energizantes', 4500, 2833, 6, 12),
    ('Speed', 'CAF-BEB-SPEED', 'Energizantes', 3000, 1708, 12, 24),
    ('Vive 100', 'CAF-BEB-VIVE100', 'Energizantes', 3500, 1833, 6, 12),
    ('Red Bull', 'CAF-BEB-REDBULL', 'Energizantes', 10000, 7000, 4, 8),
    ('Squash', 'CAF-BEB-SQUASH', 'Hidratacion', 3500, 2167, 6, 12),
    ('Electrolit', 'CAF-BEB-ELECTROLIT', 'Hidratacion', 10000, 7000, 6, 12),
    ('Gatorade', 'CAF-BEB-GATORADE', 'Hidratacion', 5000, 3250, 6, 12)
),
inserted_products as (
  insert into public.products (name, sku, category_id, sale_price, purchase_cost, status)
  select
    product_seed.name,
    product_seed.sku,
    categories.id,
    product_seed.sale_price,
    product_seed.purchase_cost,
    'out_of_stock'::product_status
  from product_seed
  join public.categories on categories.name = product_seed.category_name
  on conflict (sku) do update set
    name = excluded.name,
    category_id = excluded.category_id,
    sale_price = excluded.sale_price,
    purchase_cost = excluded.purchase_cost,
    updated_at = now()
  returning id, sku
)
insert into public.inventory (product_id, current_quantity, min_quantity, ideal_quantity, inventory_date, week_start, week_end)
select
  inserted_products.id,
  0,
  product_seed.min_quantity,
  product_seed.ideal_quantity,
  current_date,
  (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day'))::date,
  (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day') + interval '5 day')::date
from inserted_products
join product_seed on product_seed.sku = inserted_products.sku
on conflict (product_id) do update set
  min_quantity = excluded.min_quantity,
  ideal_quantity = excluded.ideal_quantity,
  inventory_date = excluded.inventory_date,
  week_start = excluded.week_start,
  week_end = excluded.week_end,
  updated_at = now();
