select
  'products' as table_name,
  count(*) as total_rows,
  count(*) filter (where status = 'active') as active_rows
from public.products
union all
select
  'inventory' as table_name,
  count(*) as total_rows,
  count(*) filter (where current_quantity > 0) as active_rows
from public.inventory;

select
  products.name,
  products.sku,
  products.status,
  inventory.current_quantity,
  products.sale_price,
  products.purchase_cost,
  products.image_url
from public.products products
left join public.inventory inventory on inventory.product_id = products.id
where products.sku in ('AGUA-LITRO', 'AGUA-PERSONAL', 'VIVE-100', 'AMPER', 'SQUASH')
order by products.name;
