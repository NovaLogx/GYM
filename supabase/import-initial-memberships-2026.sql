-- BODY FIT Software - importacion inicial de membresias actuales.
-- Ejecutar despues de production-supabase-migration.sql.
-- No genera movimientos de caja ni reportes de ingreso.

with memberships_to_import(full_name, start_date, end_date) as (
  values
    ('Doraly Bustos', '2026-05-09'::date, '2026-06-09'::date),
    ('Yorly Tatiana Rojas', '2026-05-01'::date, '2026-06-01'::date),
    ('Maria Alvares', '2026-05-04'::date, '2026-06-04'::date),
    ('Katerine Millan', '2026-05-04'::date, '2026-06-09'::date),
    ('Heidy Narvaez', '2026-05-04'::date, '2026-06-04'::date),
    ('Carolina Buitrago', '2026-05-04'::date, '2026-06-04'::date),
    ('Sandra Mendoza', '2026-05-04'::date, '2026-06-04'::date),
    ('Sandy Herrera', '2026-05-04'::date, '2026-06-04'::date),
    ('Natalia Moreno', '2026-05-05'::date, '2026-06-05'::date),
    ('Maria Antonia Gamba', '2026-05-05'::date, '2026-06-05'::date),
    ('Jenifer Franco', '2026-05-05'::date, '2026-06-05'::date),
    ('Miguel Angel Nene', '2026-05-05'::date, '2026-06-05'::date),
    ('Edwin Quina', '2026-05-06'::date, '2026-06-06'::date),
    ('Estefania Gonzalez', '2026-05-07'::date, '2026-06-07'::date),
    ('Anisali Ortiz', '2026-05-07'::date, '2026-06-07'::date),
    ('Patricia Pedraza', '2026-05-07'::date, '2026-06-07'::date),
    ('Andres Rojas', '2026-05-07'::date, '2026-06-07'::date),
    ('Jeferson Rico', '2026-05-08'::date, '2026-06-08'::date),
    ('Nolberto Vaquero', '2026-05-08'::date, '2026-06-08'::date),
    ('Daniela Marquéz', '2026-05-08'::date, '2026-06-08'::date),
    ('Sergio Brand', '2026-05-11'::date, '2026-05-26'::date),
    ('Alejandra Ramirez', '2026-05-11'::date, '2026-06-11'::date),
    ('Sebastian', '2026-05-11'::date, '2026-06-11'::date),
    ('Kevin Bethancourth', '2026-05-08'::date, '2026-06-08'::date),
    ('Orfani Durán', '2026-05-12'::date, '2026-06-12'::date),
    ('Lorena Restrepo', '2026-05-12'::date, '2026-06-12'::date),
    ('Yineida Montes', '2026-05-09'::date, '2026-06-09'::date),
    ('Karol Rodriguez', '2026-05-13'::date, '2026-06-13'::date),
    ('Yulieth Fori', '2026-05-13'::date, '2026-06-13'::date),
    ('Sheril Restrepo', '2026-05-13'::date, '2026-06-13'::date),
    ('Andrea Campos', '2026-05-12'::date, '2026-06-12'::date),
    ('Alix Buitrago', '2026-05-13'::date, '2026-06-13'::date),
    ('Yurani Muñoz Calderon', '2026-05-13'::date, '2026-06-13'::date),
    ('Nataly Camacho', '2026-05-11'::date, '2026-06-11'::date),
    ('Dayana Valencia', '2026-05-13'::date, '2026-06-13'::date),
    ('Marly Vargas', '2026-05-13'::date, '2026-06-13'::date),
    ('Nora Tapiero', '2026-05-10'::date, '2026-06-10'::date),
    ('Magali Rojas', '2026-05-16'::date, '2026-06-16'::date),
    ('Karol Rojas', '2026-05-20'::date, '2026-06-20'::date),
    ('Marlodis Plazas', '2026-05-14'::date, '2026-06-14'::date),
    ('Alejandra Ordoñez', '2026-05-14'::date, '2026-06-14'::date),
    ('Yeimith Torres Motta', '2026-05-15'::date, '2026-06-15'::date),
    ('Yuliana Campo Serna', '2026-05-15'::date, '2026-06-15'::date),
    ('Monica Lozano', '2026-05-15'::date, '2026-06-15'::date),
    ('Deryi Parra', '2026-05-18'::date, '2026-06-18'::date),
    ('Estefania', '2026-05-18'::date, '2026-06-18'::date),
    ('Yeimy Sogamoso', '2026-05-19'::date, '2026-06-19'::date),
    ('Daniela Tapiero', '2026-05-19'::date, '2026-06-19'::date),
    ('Jhoana Varela', '2026-05-19'::date, '2026-06-19'::date),
    ('Camila Tapias', '2026-05-19'::date, '2026-06-19'::date),
    ('Dalila Andrea España', '2026-05-20'::date, '2026-06-20'::date),
    ('Merly Balbuena', '2026-05-20'::date, '2026-06-20'::date),
    ('Nuvia Muñeton', '2026-05-24'::date, '2026-06-24'::date),
    ('Valeria Arias', '2026-05-20'::date, '2026-06-20'::date),
    ('Albeiro Arias', '2026-05-20'::date, '2026-06-20'::date),
    ('Estela Cortes', '2026-05-20'::date, '2026-06-20'::date),
    ('Leidy Michel Bedoya Martinez', '2026-05-20'::date, '2026-06-20'::date),
    ('Alisson B. Garcia Martinez', '2026-05-20'::date, '2026-06-20'::date),
    ('Thaliana Castro', '2026-05-20'::date, '2026-06-20'::date),
    ('Laura Grajales', '2026-05-20'::date, '2026-06-20'::date),
    ('Yarelis Romero', '2026-05-20'::date, '2026-06-20'::date),
    ('Angie Castañeda', '2026-05-21'::date, '2026-06-21'::date),
    ('Carol Lopez', '2026-05-21'::date, '2026-06-21'::date),
    ('Ludibia Castro', '2026-05-25'::date, '2026-06-25'::date),
    ('Alejandra Hurtatiz', '2026-05-25'::date, '2026-06-25'::date),
    ('Natalia Villa', '2026-05-29'::date, '2026-06-29'::date),
    ('Marly', '2026-05-25'::date, '2026-06-25'::date),
    ('Delly Durán', '2026-05-25'::date, '2026-06-25'::date),
    ('Andrea Castañeda', '2026-05-25'::date, '2026-06-25'::date),
    ('Erika Saldaña', '2026-05-26'::date, '2026-06-26'::date),
    ('Carlos Garzon', '2026-05-25'::date, '2026-06-25'::date),
    ('Yoimarí Galeano', '2026-05-25'::date, '2026-06-25'::date),
    ('Adriana V.', '2026-05-26'::date, '2026-06-26'::date),
    ('Dani Quiñonez', '2026-04-15'::date, '2026-05-15'::date),
    ('Dani Quiñones', '2026-05-15'::date, '2026-05-29'::date),
    ('Elizeth', '2026-05-27'::date, '2026-06-27'::date),
    ('Angie Janchez', '2026-05-28'::date, '2026-06-28'::date),
    ('Jimmy Vargas', '2026-05-27'::date, '2026-06-27'::date)
),
upserted_clients as (
  insert into public.clients (full_name, normalized_name)
  select
    full_name,
    lower(regexp_replace(trim(full_name), '\s+', ' ', 'g'))
  from memberships_to_import
  on conflict (normalized_name) do update set
    full_name = excluded.full_name,
    updated_at = now()
  returning id, normalized_name
)
insert into public.memberships (client_id, plan, start_date, end_date, status, price, is_initial_import)
select
  upserted_clients.id,
  'Mensual',
  memberships_to_import.start_date,
  memberships_to_import.end_date,
  case when memberships_to_import.end_date < current_date then 'vencida' else 'activa' end,
  50000,
  true
from memberships_to_import
join upserted_clients
  on upserted_clients.normalized_name = lower(regexp_replace(trim(memberships_to_import.full_name), '\s+', ' ', 'g'))
on conflict (client_id, start_date, end_date) do update set
  status = excluded.status,
  price = excluded.price,
  is_initial_import = true,
  updated_at = now();
