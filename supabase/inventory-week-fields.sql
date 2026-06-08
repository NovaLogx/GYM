alter table public.inventory
  add column if not exists inventory_date date not null default current_date;

alter table public.inventory
  add column if not exists week_start date not null default (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day'))::date;

alter table public.inventory
  add column if not exists week_end date not null default (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day') + interval '5 day')::date;

update public.inventory
set
  inventory_date = coalesce(inventory_date, current_date),
  week_start = coalesce(week_start, (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day'))::date),
  week_end = coalesce(week_end, (current_date - ((extract(isodow from current_date)::integer - 1) * interval '1 day') + interval '5 day')::date),
  updated_at = now();

