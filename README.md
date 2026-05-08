# Draft & Cut

Plataforma web para revision y versionado de animacion 3D.

## Stack inicial

- Next.js App Router
- React + TypeScript estricto
- NextAuth/Auth.js con login por credenciales
- MongoDB/Mongoose
- Amazon S3 con URLs firmadas
- Tailwind CSS
- Deploy preparado para Vercel

## Configuracion local

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env` desde `.env.example` y configurar:

```env
MONGODB_URI=
AUTH_URL=http://localhost:3000
AUTH_SECRET=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
NEXT_PUBLIC_MAX_UPLOAD_MB=500
```

3. Cargar datos iniciales:

```bash
npm run seed
```

El seed importa por defecto `guion_tecnico_uky_lola_planos.csv` desde la raiz del proyecto. Puedes cambiar la ruta con `SEED_SCRIPT_CSV_PATH`.

4. Iniciar desarrollo:

```bash
npm run dev
```

## Primer usuario

El seed crea un administrador con:

- Email: valor de `SEED_ADMIN_EMAIL` o `admin@example.com`.
- Password: valor de `SEED_ADMIN_PASSWORD` o `change-me-before-production`.

Cambia la contrasena antes de usar un entorno compartido.

## Vercel

La app esta preparada para Vercel, con estas consideraciones:

- MongoDB debe estar en un servicio externo, idealmente MongoDB Atlas.
- Las variables de entorno deben configurarse por entorno: Development, Preview y Production.
- `AUTH_URL` debe usar el dominio real de produccion.
- El bucket S3 debe permitir CORS para los dominios Vercel autorizados.
- Los videos no pasan por Vercel: se suben directo desde el navegador a S3 mediante URL firmada.

## Rutas MVP

- `/login`: acceso.
- `/projects`: listado de proyectos.
- `/projects/[projectId]`: escenas del proyecto.
- `/scenes/[sceneId]`: planos y versiones recientes.
- `/upload`: subida directa a S3.
- `/review/[videoVersionId]`: reproductor, timeline y comentarios por frame.
