# BODY FIT Software / GYM

Sistema POS, inventario, caja, membresias, reportes y monitoreo del gimnasio.

## Estado actual

La app usa Supabase como fuente de datos operativa. Productos, inventario, caja, ventas, movimientos, usuarios y membresias deben leerse y guardarse en la base de datos.

## Como abrir

En local, abre el archivo:

```text
index.html
```

en Chrome, Edge o Safari. Para produccion, desplegar en Vercel con las variables de entorno indicadas abajo.

## Modulos incluidos

- Monitoreo general del negocio.
- Registro de productos e inventario.
- Alertas de productos bajos o agotados.
- Apertura y cierre de caja.
- Registro de ventas rapidas.
- Estado de conexion con Supabase.
- Importacion/exportacion de archivos de inventario.
- Movimientos recientes.
- Validaciones basicas para evitar inventario negativo y ventas sin caja abierta.

## Base de datos

El archivo `supabase/schema.sql` contiene el modelo inicial para crear tablas de perfiles, categorias, productos, inventario, caja, ventas, movimientos, alertas y auditoria.

El archivo `supabase/production-supabase-migration.sql` completa la estructura de produccion, agrega imagenes/costos al inventario, crea `clients` y `memberships`, y carga los productos actuales.

El archivo `supabase/import-initial-memberships-2026.sql` carga las membresias iniciales sin sumarlas a caja ni reportes.

## Conexion con Supabase

El proyecto Supabase es:

```text
https://jsettiedrwawrfbeiiei.supabase.co
```

En Vercel configurar estas variables:

```text
SUPABASE_URL=https://jsettiedrwawrfbeiiei.supabase.co
SUPABASE_ANON_KEY=llave_anon_public
```

La app obtiene esas variables desde `/api/config.js`.

No uses la llave `service_role` en el navegador.

## MCP de Supabase

Este proyecto incluye `.mcp.json` con el servidor MCP de Supabase en modo lectura:

```text
https://mcp.supabase.com/mcp?project_ref=jsettiedrwawrfbeiiei&read_only=true
```

Para autenticarlo en Claude Code, ejecuta en una terminal normal:

```bash
claude /mcp
```

Luego selecciona `supabase` y completa `Authenticate`.

## Archivos de inventario

La app incluye un boton `Archivos de inventario` en la pestaña Inventario. Desde ahi se puede:

- Importar inventario desde CSV, Excel `.xlsx` o Word `.docx`.
- Actualizar productos existentes por SKU o nombre.
- Crear productos nuevos cuando no existan.
- Exportar el inventario actual en CSV.
- Mantener fecha de inventario por semana operativa de lunes a sabado.

El archivo inicial usado como referencia fue:

```text
Sources/MENU DE CAFT..docx
```

Los productos importados se guardan en Supabase y quedan disponibles para venta cuando tienen cantidad y estado activo.
