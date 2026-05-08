# Plan de proyecto: plataforma web de revision y versionado de animacion 3D

## 1. Vision del producto

Construir una plataforma web reutilizable para producciones audiovisuales que permita revisar videos comprimidos por escena o plano, versionarlos, compararlos contra un guion tecnico versionado y registrar feedback preciso por frame.

El primer caso de uso sera la pelicula "Uky y Lola en Tierra del Fuego", pero la arquitectura debe soportar multiples proyectos.

Decisiones base:

- Aplicacion web, sin app de escritorio.
- Sin compresion ni transcodificacion online.
- Videos subidos ya preparados para revision web.
- Upload directo desde navegador a Amazon S3 mediante URLs firmadas.
- Persistencia de metadata, versiones, comentarios y guion tecnico en MongoDB.

## 2. Alcance del MVP

El MVP debe validar el flujo central de revision:

1. Administrar un proyecto inicial.
2. Importar un guion tecnico CSV.
3. Listar escenas y planos.
4. Subir videos MP4 ya comprimidos.
5. Versionar automaticamente cada entrega.
6. Guardar el archivo en S3 y la metadata en MongoDB.
7. Revisar una version en reproductor web.
8. Crear comentarios asociados a frame/timecode.
9. Mostrar marcadores de comentarios en timeline.
10. Consultar informacion del guion tecnico junto al video.

Fuera del MVP inicial:

- Comparacion visual entre versiones.
- Dibujo/anotaciones sobre frame.
- Resumen de feedback por IA.
- Notificaciones externas.
- Dashboard avanzado de produccion.
- Transcodificacion o validacion profunda de codec en servidor.

## 3. Arquitectura inicial

### Stack

- Next.js con App Router.
- React.
- TypeScript estricto.
- NextAuth/Auth.js para login, sesiones y proteccion de rutas.
- MongoDB.
- Amazon S3.
- Tailwind CSS.
- API Routes de Next.js para el backend inicial.
- Deploy en Vercel.

### Estructura sugerida

```txt
app/
  page.tsx
  login/
  projects/
  projects/[projectId]/
  scenes/[sceneId]/
  review/[videoVersionId]/
  upload/
  admin/script/
api/
  auth/[...nextauth]/
  projects/
  scenes/
  shots/
  uploads/init/
  uploads/[uploadId]/complete/
  videos/
  comments/
  script-versions/
components/
  video/
  comments/
  script/
  upload/
  layout/
lib/
  auth/
    auth-options.ts
    permissions.ts
  db/
  s3/
  validation/
  timecode/
models/
  User.ts
  Account.ts
  Session.ts
  VerificationToken.ts
  ProjectMembership.ts
  Project.ts
  Scene.ts
  Shot.ts
  ScriptVersion.ts
  VideoVersion.ts
  Comment.ts
  CommentReply.ts
  AuditLog.ts
types/
```

### Variables de entorno

```env
MONGODB_URI=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
NEXT_PUBLIC_MAX_UPLOAD_MB=500
```

Si se usa Auth.js v5, los nombres equivalentes pueden ser `AUTH_URL` y `AUTH_SECRET`; la implementacion debe elegir una version concreta y documentarla en `.env.example`.

En produccion, las credenciales directas de AWS deben reemplazarse idealmente por roles/IAM del entorno de despliegue cuando la infraestructura lo permita. En Vercel, si se usan access keys, deben guardarse solo como Environment Variables del proyecto y con permisos minimos sobre el bucket.

### Autenticacion y sesiones

La autenticacion inicial se implementara con NextAuth/Auth.js dentro de Next.js.

Decisiones MVP:

- Login web desde `/login`.
- Sesiones protegidas para todas las pantallas internas.
- Middleware para redirigir usuarios no autenticados.
- Roles aplicados desde base de datos, no hardcodeados en frontend.
- Adaptador MongoDB para persistir usuarios, cuentas y sesiones cuando aplique.
- Autorizacion centralizada en `lib/auth/permissions.ts`.

Proveedores posibles:

- MVP cerrado: `CredentialsProvider` con usuarios creados por administrador.
- Alternativa produccion: Google OAuth o proveedor corporativo si el equipo ya lo usa.

La primera implementacion puede partir con credenciales para controlar acceso rapido al equipo de produccion, dejando el modelo preparado para OAuth.

### Deploy en Vercel

La aplicacion debe estar preparada para publicarse en Vercel desde el MVP.

Consideraciones:

- Usar rutas API serverless de Next.js.
- No depender de escritura persistente en filesystem local.
- No subir videos al backend, porque Vercel tiene limites de payload y timeout.
- Usar S3 presigned URLs para archivos grandes.
- Configurar `NEXTAUTH_URL` con el dominio de Vercel en produccion.
- Configurar variables por entorno: Development, Preview y Production.
- Configurar CORS del bucket S3 para permitir uploads desde los dominios de Vercel autorizados.
- Mantener MongoDB en un servicio externo compatible con serverless, por ejemplo MongoDB Atlas.
- Reutilizar conexion MongoDB en runtime serverless para evitar exceso de conexiones.

## 4. Modelo de dominio

Entidades principales:

- `User`: identidad de usuario autenticado.
- `ProjectMembership`: rol del usuario dentro de un proyecto.
- `Project`: produccion audiovisual y configuracion base, incluido FPS oficial.
- `Scene`: unidad narrativa, estado y referencias a versiones actuales.
- `Shot`: unidad tecnica del guion tecnico dentro de una escena.
- `ScriptVersion`: version editable/publicable del guion tecnico.
- `VideoVersion`: archivo subido, metadata tecnica, estado y version incremental.
- `Comment`: feedback asociado a frame exacto, version de video y version de guion.
- `CommentReply`: respuestas a comentarios.
- `AuditLog`: trazabilidad de acciones relevantes.

Relaciones clave:

- Un usuario puede pertenecer a varios proyectos con roles distintos.
- Un proyecto tiene muchas escenas.
- Una escena tiene muchos planos.
- Un plano puede tener muchas versiones de video.
- Una version de video queda asociada a una version de guion.
- Los comentarios pertenecen a una version especifica de video.
- Al publicar una nueva version de guion, la anterior pasa a `superseded`.

## 5. Flujo tecnico de subida

El archivo nunca pasa por el backend.

```txt
Frontend -> API /uploads/init -> crea videoVersion uploading y URL firmada
Frontend -> S3 -> sube archivo directo
Frontend -> API /uploads/:uploadId/complete -> confirma upload
Backend -> MongoDB -> marca videoVersion ready_for_review
```

Validaciones frontend:

- Archivo obligatorio.
- Extension `.mp4`.
- MIME type `video/mp4`.
- Peso menor o igual al maximo configurado.
- Proyecto, escena y etapa obligatorios.
- Si el alcance es `shot`, plano obligatorio.
- Duracion y resolucion detectables mediante metadata del video.
- FPS tomado desde configuracion del proyecto.

Validaciones backend:

- Usuario autorizado.
- Proyecto y escena existentes.
- Plano existente cuando aplica.
- Etapa y alcance dentro de enums permitidos.
- Tamano dentro de limite configurado.
- Version incremental calculada en servidor.
- S3 key generada por servidor.

## 6. Pantallas principales

### Login

Primera pantalla publica de la aplicacion.

Debe incluir:

- Formulario de acceso.
- Mensajes de error claros.
- Redireccion al ultimo destino solicitado despues de iniciar sesion.
- Cierre de sesion disponible desde el layout interno.

Todas las demas pantallas del MVP deben requerir sesion activa.

### Panel de proyectos

Para el MVP puede mostrar un unico proyecto, pero la UI debe estar preparada para multiples proyectos.

Contenido:

- Titulo del proyecto.
- Descripcion.
- FPS oficial.
- Estado/resumen de escenas.

### Panel de escenas

Contenido:

- Numero de escena.
- Titulo.
- Estado.
- Ultima version de video.
- Comentarios abiertos.
- Ultima actualizacion.

Acciones:

- Abrir revision.
- Subir nueva version.
- Ver historial.

### Subida de video

Debe permitir:

- Seleccionar proyecto.
- Seleccionar escena.
- Elegir alcance: escena completa o plano especifico.
- Seleccionar plano si corresponde.
- Seleccionar etapa de produccion.
- Arrastrar archivo MP4.
- Mostrar metadata detectada.
- Agregar notas.
- Subir directo a S3.
- Confirmar version en backend.

### Vista de revision

Pantalla principal del producto.

Debe incluir:

- Selector de escena/version.
- Reproductor web.
- Controles de frame anterior/siguiente.
- Tiempo actual.
- Frame actual.
- Timecode.
- Timeline con marcadores.
- Panel de guion tecnico del plano.
- Panel de comentarios.
- Formulario de comentario sobre el frame actual.

### Administracion de guion tecnico

MVP:

- Importar CSV.
- Crear `ScriptVersion`.
- Crear/actualizar `Shot`.
- Publicar version activa.
- Consultar planos por escena.

Fase posterior:

- Edicion completa desde UI.
- Exportacion CSV.
- Comparacion entre versiones de guion.

## 7. API inicial

Autenticacion:

- `GET/POST /api/auth/[...nextauth]`
- `GET /api/auth/session`

Estos endpoints quedan gestionados por NextAuth/Auth.js; no se implementaran endpoints manuales de login/logout salvo que exista una razon especifica.

Prioridad alta:

- `GET /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/projects/:projectId/scenes`
- `GET /api/scenes/:sceneId/shots`
- `POST /api/uploads/init`
- `POST /api/uploads/:uploadId/complete`
- `GET /api/scenes/:sceneId/videos`
- `GET /api/videos/:videoVersionId`
- `GET /api/videos/:videoVersionId/comments`
- `POST /api/videos/:videoVersionId/comments`
- `PATCH /api/comments/:commentId`
- `POST /api/script-versions/import-csv`
- `POST /api/script-versions/:scriptVersionId/publish`

Prioridad media:

- `POST /api/projects`
- `PATCH /api/projects/:projectId`
- `POST /api/projects/:projectId/scenes`
- `PATCH /api/scenes/:sceneId`
- `POST /api/scenes/:sceneId/shots`
- `PATCH /api/shots/:shotId`
- `POST /api/comments/:commentId/replies`
- `GET /api/projects/:projectId/script-versions`

## 8. Plan por fases

### Fase 0: Fundacion tecnica

Objetivo: dejar una base estable para construir el MVP.

Entregables:

- Proyecto Next.js con TypeScript estricto.
- Tailwind configurado.
- NextAuth/Auth.js configurado.
- Pantalla `/login`.
- Middleware de proteccion de rutas.
- Conexion MongoDB.
- Adaptador/modelos de autenticacion en MongoDB.
- Cliente S3.
- Variables de entorno documentadas.
- Modelos base.
- Helpers de timecode y calculo de frames.
- Seed inicial para proyecto "Uky y Lola en Tierra del Fuego".

Criterio de salida:

- La app inicia localmente.
- Un usuario puede iniciar y cerrar sesion.
- Las rutas internas redirigen a `/login` si no hay sesion.
- Puede conectarse a MongoDB.
- Existen modelos tipados.
- Se puede listar el proyecto inicial.

### Fase 1: Guion tecnico y navegacion base

Objetivo: tener estructura navegable de proyecto, escenas y planos.

Entregables:

- Importacion CSV de guion tecnico.
- Creacion de `ScriptVersion`.
- Creacion/listado de escenas.
- Creacion/listado de planos.
- Panel de escenas.
- Vista basica de detalle de escena.

Criterio de salida:

- Un administrador puede importar un CSV inicial.
- Las escenas y planos aparecen en UI.
- Cada plano queda asociado a una version de guion.

### Fase 2: Subida y versionado de videos

Objetivo: habilitar entregas web comprimidas con upload directo a S3.

Entregables:

- Formulario drag and drop.
- Deteccion de nombre, peso, duracion y resolucion.
- Validaciones de MP4 y limite de peso.
- API `/api/uploads/init`.
- Generacion de S3 key.
- Calculo de version incremental.
- URL firmada para subida.
- API `/api/uploads/:uploadId/complete`.
- Registro de `VideoVersion`.

Criterio de salida:

- Un usuario puede subir un MP4 directo a S3.
- MongoDB registra la version.
- La version queda `ready_for_review`.

### Fase 3: Revision y comentarios por frame

Objetivo: completar el ciclo de feedback.

Entregables:

- Reproductor web.
- Calculo de frame actual.
- Calculo de timecode.
- Controles frame anterior/siguiente.
- Crear comentario en frame actual.
- Timeline con marcadores.
- Listado y filtros basicos de comentarios.
- Cambio de estado de comentario.
- Panel lateral de guion tecnico.

Criterio de salida:

- Un revisor puede reproducir, pausar, ubicar un frame y comentar.
- El comentario aparece en timeline.
- El comentario queda ligado a videoVersion, scene, shot y scriptVersion.

### Fase 4: Historial y estados de revision

Objetivo: hacer usable el versionado en produccion.

Entregables:

- Historial de versiones por escena/plano.
- Cambio de estado de video.
- Conteo de comentarios abiertos/resueltos por version.
- Filtros de comentarios por estado/asignado/prioridad.
- Roles iniciales funcionales con NextAuth/Auth.js y `ProjectMembership`.
- Proteccion de acciones por permisos en API.

Criterio de salida:

- Director y animador pueden seguir una iteracion completa de revision.
- Versiones anteriores siguen consultables.
- Los comentarios quedan preservados por version.

### Fase 4.5: Preparacion de despliegue Vercel

Objetivo: publicar una primera version segura y usable en entorno cloud.

Entregables:

- Proyecto conectado a Vercel.
- Variables configuradas para Preview y Production.
- Dominio de produccion configurado en `NEXTAUTH_URL`.
- MongoDB Atlas o servicio Mongo externo configurado.
- Bucket S3 con CORS para dominios autorizados.
- Revision de runtime de API Routes que usan AWS SDK y MongoDB.
- Smoke test en deployment Preview.

Criterio de salida:

- Login funciona en Vercel.
- Las rutas protegidas mantienen sesion.
- La app puede leer/escribir MongoDB desde Vercel.
- La subida directa a S3 funciona desde el dominio de Vercel.

### Fase 5: Produccion y mejoras

Objetivo: ampliar utilidad para seguimiento y coordinacion.

Entregables:

- Exportacion CSV de comentarios.
- Panel de avance por escena.
- Dashboard de produccion.
- Notificaciones externas.
- Comparacion de versiones.
- Anotaciones visuales sobre frame.
- Resumen de feedback por IA.

## 9. Backlog priorizado

### P0

- Crear base Next.js + TypeScript.
- Configurar NextAuth/Auth.js.
- Implementar login y logout.
- Proteger rutas internas con middleware.
- Conectar MongoDB.
- Definir modelos.
- Definir `User` y `ProjectMembership`.
- Crear seed de proyecto inicial.
- Importar guion tecnico CSV.
- Listar escenas/planos.
- Implementar subida directa a S3.
- Registrar `VideoVersion`.
- Reproducir version subida.
- Crear comentarios por frame.

### P1

- Historial de versiones.
- Estados de video.
- Filtros de comentarios.
- Respuestas a comentarios.
- Roles y permisos reales.
- Deploy Preview en Vercel.
- Configuracion S3 CORS para dominios Vercel.
- Auditoria de eventos clave.
- Exportacion CSV de comentarios.

### P2

- Comparacion entre versiones.
- Anotaciones visuales.
- Dashboard avanzado.
- Integraciones de notificacion.
- Resumen por IA.

## 10. Riesgos y mitigaciones

### Validacion real de codec H.264

Riesgo: el navegador puede detectar metadata basica, pero no siempre confirmar codec, CFR o keyframes.

Mitigacion MVP:

- Validar extension, MIME, duracion y resolucion.
- Mostrar advertencia clara del estandar requerido.
- Documentar preset de exportacion.

Mitigacion posterior:

- Validacion offline previa o servicio opcional de inspeccion metadata.

### Subidas grandes

Riesgo: archivos de cientos de MB pueden fallar con upload simple.

Mitigacion MVP:

- Limite configurable.
- Manejo de progreso y errores.

Mitigacion posterior:

- Multipart upload directo a S3.

### Versionado concurrente

Riesgo: dos usuarios suben a la vez y reciben el mismo numero de version.

Mitigacion:

- Calcular version en backend.
- Usar indice unico por `projectId + sceneId + shotId/scope + stage + versionNumber`.
- Resolver colisiones reintentando incremento dentro de una operacion controlada.

### Timecode y frame exacto

Riesgo: diferencias por FPS, playback y video exportado en VFR.

Mitigacion:

- FPS oficial definido por proyecto.
- Requerir CFR.
- Calcular frame con `Math.round(currentTime * fps)`.
- Guardar `frame`, `timeSeconds`, `timecode` y `fps` en cada comentario.

### Seguridad de S3

Riesgo: URLs firmadas o keys mal generadas pueden exponer archivos.

Mitigacion:

- Generar keys solo en backend.
- URLs firmadas de corta duracion.
- Validar permisos antes de generar URL.
- No exponer credenciales AWS al frontend.

### Sesiones en Vercel

Riesgo: login funciona localmente, pero falla en Preview/Production por `NEXTAUTH_URL`, secretos o cookies.

Mitigacion:

- Definir `NEXTAUTH_SECRET` estable por entorno.
- Configurar `NEXTAUTH_URL` con el dominio correcto de produccion.
- Validar callbacks y redirects en Preview.
- Probar login/logout en deployment antes de avanzar a flujos de subida.

### MongoDB en runtime serverless

Riesgo: demasiadas conexiones desde funciones serverless.

Mitigacion:

- Usar MongoDB Atlas o servicio compatible con Vercel.
- Reutilizar el cliente MongoDB mediante cache global en `lib/db`.
- Evitar abrir una conexion nueva por request.

### Limites de Vercel para archivos grandes

Riesgo: timeouts o limites de payload si un archivo toca el backend.

Mitigacion:

- Mantener subida directa navegador -> S3.
- API Routes solo generan URLs firmadas y registran metadata.
- No usar Route Handlers para recibir archivos de video.

## 11. Criterios de aceptacion globales del MVP

- El usuario debe iniciar sesion para acceder a pantallas internas.
- La aplicacion permite trabajar con el proyecto inicial.
- Se puede importar un CSV de guion tecnico.
- Se pueden navegar escenas y planos.
- Se puede subir un MP4 con metadata tecnica visible.
- La subida va directo a S3.
- Cada subida crea una version incremental.
- La version queda disponible para revision.
- El reproductor muestra frame y timecode.
- Se puede comentar un frame especifico.
- Los comentarios aparecen como marcadores.
- El panel de revision muestra datos del guion tecnico asociado.
- La aplicacion puede desplegarse en Vercel con variables de entorno configuradas.

## 12. Orden recomendado de implementacion

1. Crear proyecto Next.js y configurar TypeScript/Tailwind.
2. Configurar NextAuth/Auth.js, login, logout y middleware.
3. Implementar conexion a MongoDB compatible con Vercel/serverless.
4. Crear modelos y enums compartidos.
5. Crear modelos de usuario, roles y membresia por proyecto.
6. Crear seed del proyecto inicial y usuario administrador inicial.
7. Implementar listado de proyecto, escenas y planos.
8. Implementar importacion CSV de guion tecnico.
9. Implementar formulario de subida y validaciones frontend.
10. Implementar S3 signed URLs.
11. Implementar confirmacion de upload y versionado.
12. Implementar reproductor y helpers de frame/timecode.
13. Implementar comentarios por frame.
14. Implementar timeline de marcadores.
15. Preparar deploy Preview en Vercel.
16. Implementar historial basico de versiones.
17. Endurecer permisos, errores y auditoria.

## 13. Primera iteracion concreta

La primera iteracion de desarrollo deberia producir:

- App Next.js inicial ejecutable.
- Layout base.
- Login con NextAuth/Auth.js.
- Middleware de rutas protegidas.
- Modelos MongoDB.
- Conexion DB.
- Cliente S3.
- `.env.example`.
- Seed del proyecto inicial y usuario administrador.
- Pantalla de escenas con datos reales desde MongoDB.
- Endpoint `GET /api/projects`.
- Endpoint `GET /api/projects/:projectId/scenes`.
- Configuracion lista para deploy en Vercel.

Esta iteracion reduce incertidumbre tecnica sin tocar todavia el flujo mas sensible: la subida directa a S3.
