# Despliegue BODY FIT Software

## 1. Subir codigo a GitHub

Desde una terminal normal:

```bash
cd "/Users/anubizctr/Documents/GYM CDC/Software"
git init -b main
git remote add origin https://github.com/NovaLogx/GYM.git
git add .
git commit -m "Initial BODY FIT Software deployment"
git branch dev
git push -u origin main dev
```

Si GitHub dice que el remoto ya tiene commits:

```bash
git pull origin main --allow-unrelated-histories
git push -u origin main dev
```

## 2. Configurar Vercel

Proyecto: `gym`

Configuracion recomendada:

- Framework Preset: `Other`
- Root Directory: carpeta raiz del repo
- Build Command: vacio
- Output Directory: `.`
- Install Command: vacio
- Production Branch: `main`

El archivo `vercel.json` ya deja lista la app para que cualquier ruta cargue `index.html`.

## 3. Variables de Supabase

La app ya tiene configurada la URL:

```text
https://jsettiedrwawrfbeiiei.supabase.co
```

En produccion se debe usar solo la llave publica `anon`.

No usar ni subir la llave `service_role`.

## 4. Base de datos Supabase

Ejecutar en Supabase SQL Editor, en este orden:

1. `supabase/schema.sql`
2. `supabase/inventory-week-fields.sql`
3. `supabase/read-policies.sql`
4. Seeds necesarios de inventario si aplica.

## 5. Dominio Cloudflare

En Vercel:

1. Project Settings
2. Domains
3. Agregar el subdominio elegido, por ejemplo:

```text
gym.novalogix.org
```

En Cloudflare:

1. DNS
2. Crear registro CNAME
3. Nombre: `gym`
4. Target: `cname.vercel-dns.com`
5. Proxy: DNS only al inicio

Cuando Vercel valide el dominio, activar SSL y probar.

## 6. Prueba final

Validar en vivo:

- Inicio carga correctamente.
- Inventario muestra productos.
- Ventas descuenta stock.
- Caja abre/cierra.
- Membresias registran ingresos cuando corresponda.
- Reportes muestran movimientos.
- Supabase responde correctamente desde Configuracion/Conexion.

