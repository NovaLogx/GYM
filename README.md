# BODY FIT Software / GYM

Primera base funcional para el sistema POS, inventario, caja y monitoreo del gimnasio.

## Estado actual

Esta version inicial corre sin instalaciones externas porque el entorno actual no tiene `npm` disponible. La app funciona como prototipo operativo en navegador con almacenamiento local (`localStorage`) y esta lista para migrar sus operaciones a Supabase en la siguiente fase.

## Como abrir

Abre el archivo:

```text
index.html
```

en Chrome, Edge o Safari.

## Modulos incluidos

- Monitoreo general del negocio.
- Registro de productos e inventario.
- Alertas de productos bajos o agotados.
- Apertura y cierre de caja.
- Registro de ventas rapidas.
- Pantalla de conexion con Supabase.
- Importacion local del archivo Menu CAF.
- Movimientos recientes.
- Validaciones basicas para evitar inventario negativo y ventas sin caja abierta.

## Siguiente paso tecnico

Cuando `npm` este disponible, migrar esta base a:

- React + Vite + TypeScript.
- Tailwind CSS + componentes reutilizables.
- Supabase Auth.
- Supabase PostgreSQL con RLS.

## Base de datos

El archivo `supabase/schema.sql` contiene el modelo inicial para crear tablas de perfiles, categorias, productos, inventario, caja, ventas, movimientos, alertas y auditoria.

El archivo `supabase/menu-caf-seed.sql` carga categorias, productos, precios y costos base extraidos de `Sources/MENU DE CAFT..docx`.

El archivo `supabase/read-policies.sql` habilita lectura del catalogo e inventario desde la app con la llave publica `anon`.

El archivo `supabase/inventory-week-fields.sql` agrega fechas semanales al inventario: fecha de inventario, lunes de inicio y sabado de cierre.

## Conexion con Supabase

El proyecto Supabase configurado en la app es:

```text
https://jsettiedrwawrfbeiiei.supabase.co
```

Para completar la conexion:

1. En Supabase, abre Project Settings > API.
2. Copia la llave `anon public`.
3. En la app, abre la pestaña Conexion.
4. Pega la llave y usa Guardar y probar.

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

Los productos importados desde documentos de menu se cargan con cantidad inicial `0` cuando el archivo no trae existencias.
