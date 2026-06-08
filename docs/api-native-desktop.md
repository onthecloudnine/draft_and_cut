# API Native — Cliente Desktop

API para que un cliente desktop (o cualquier cliente externo) se autentique y traiga toda la información de los proyectos de TMKL.

- **Base URL:** la URL de despliegue de la app (en desarrollo: `http://localhost:3000`).
- **Autenticación:** JWT Bearer. Se obtiene con email + password vía login y se envía en cada request.
- **Formato:** JSON. Las respuestas de error tienen la forma `{ "error": "mensaje" }`.

> Las rutas `/api/native/*` se autentican solas (no dependen de la cookie de sesión del navegador), por eso un cliente desktop puede llamarlas directamente.

---

## 1. Autenticación

### `POST /api/native/auth/login`

Intercambia credenciales por un token JWT.

**Request**

```http
POST /api/native/auth/login
Content-Type: application/json

{
  "email": "usuario@ejemplo.cl",
  "password": "tu-password"
}
```

**Response `200`**

```json
{
  "tokenType": "Bearer",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-07-08T15:30:42.100Z",
  "expiresInSeconds": 2592000,
  "user": { "id": "...", "name": "Antonio", "email": "usuario@ejemplo.cl" }
}
```

- El token dura **30 días** (`expiresInSeconds`).
- Errores: `400` payload inválido, `401` email o password incorrectos.

### Usar el token

En todas las demás llamadas, enviar el header:

```http
Authorization: Bearer <token>
```

- Sin header o token inválido/expirado → `401`.
- Cuando el token expire, volver a llamar a `/login` para obtener uno nuevo.

---

## 2. Endpoints de datos

Todos requieren el header `Authorization: Bearer <token>`.

### `GET /api/native/manifest` — Sync completo (masivo)

Devuelve el manifest **completo de todos los proyectos** a los que el usuario tiene acceso, en una sola llamada. Pensado para la sincronización inicial del desktop.

```json
{
  "generatedAt": "2026-06-09T12:00:00.000Z",
  "projectCount": 2,
  "projects": [ { /* manifest de proyecto (ver §3) */ } ]
}
```

### `GET /api/native/projects/{projectId}/nle-manifest` — Un proyecto

Devuelve el manifest completo de **un** proyecto. Útil para refrescos puntuales sin traer todo de nuevo.

```json
{ "manifest": { /* manifest de proyecto (ver §3) */ } }
```

- `404` si el proyecto no existe; `401` si no tiene acceso.

### `GET /api/native/projects` — Listado liviano

Lista de proyectos del usuario con un resumen de escenas (sin URLs de media). Útil para una vista de índice.

```json
{
  "projects": [
    {
      "id": "...", "slug": "...", "title": "...", "description": "...",
      "fpsDefault": 24, "role": "admin", "sceneCount": 5,
      "scenes": [
        { "id": "...", "sceneNumber": "1", "title": "...", "status": "in_progress",
          "shotCount": 8, "videoCount": 12, "openCommentCount": 2, "updatedAt": "..." }
      ]
    }
  ]
}
```

---

## 3. Estructura del manifest de proyecto

```jsonc
{
  "generatedAt": "ISO-8601",
  "mediaPolicy": {
    "delivery": "signed_url",
    "signedUrlTtlSeconds": 1800,      // las URLs de media vencen en 30 min
    "commitMediaToGit": false
  },
  "project": { "id", "slug", "title", "description", "fpsDefault", "resolution" },
  "scenes": [
    {
      "id", "sceneNumber", "title", "description", "literaryHeading",
      "location", "timeOfDay", "status", "fps",

      // Video a nivel escena (ej. animatic), con marcadores de comentarios
      "sceneScopedVideos": [
        {
          "id", "scope", "stage", "versionNumber", "fileName", "displayName",
          "reelName", "mimeType", "duration", "fps", "frameCount", "resolution",
          "fileSizeMb", "etag", "isFavorite", "status", "sourceTimecodeStart", "createdAt",
          "downloadUrl",        // URL firmada de S3 (puede ser null) — vence segun mediaPolicy
          "urlExpiresAt",
          "markers": [ { "id", "frame", "timeSeconds", "timecode", "note", "status", "priority" } ]
        }
      ],

      // Pistas de sonido por stem (dialogo, foley, music, incidental)
      "audioVersions": [
        { "id", "stem", "versionNumber", "fileName", "displayName", "reelName",
          "mimeType", "duration", "fileSizeMb", "status", "createdAt",
          "downloadUrl", "urlExpiresAt" }
      ],

      // Planos de la escena
      "shots": [
        {
          "id", "shotNumber", "shotType", "status", "description", "action",
          "camera", "sound", "requiredElements", "productionNotes",
          "startFrame", "endFrame", "durationFrames",

          // Versiones de video por plano (playblast/render)
          "videoVersions": [ { /* mismos campos que sceneScopedVideos, con markers */ } ],

          // Storyboard (imagenes) del plano
          "storyboardFrames": [
            { "id", "versionNumber", "fileName", "displayName", "reelName",
              "mimeType", "fileSizeMb", "width", "height", "status", "createdAt",
              "downloadUrl", "urlExpiresAt",
              "thumbnail": { "downloadUrl", "urlExpiresAt" } /* o null */ }
          ]
        }
      ],

      // Todos los comentarios de la escena (marcadores)
      "markers": [
        { "id", "videoVersionId", "shotId", "frame", "timeSeconds", "timecode",
          "note", "status", "priority" }
      ]
    }
  ]
}
```

### Sobre las URLs de media (`downloadUrl`)

- Son **URLs firmadas de S3** y **vencen** (ver `mediaPolicy.signedUrlTtlSeconds`, hoy 30 min).
- Para descargar/abrir un archivo, usa `downloadUrl` antes de que venza (`urlExpiresAt`).
- Si necesitas un archivo cuya URL ya venció, vuelve a pedir el manifest del proyecto (`/nle-manifest`) para obtener URLs frescas.
- `downloadUrl` puede ser `null` si el objeto aún no está disponible.

---

## 4. Ejemplos

### cURL

```bash
BASE="http://localhost:3000"

# 1) Login → token
TOKEN=$(curl -s -X POST "$BASE/api/native/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@ejemplo.cl","password":"tu-password"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2) Sync completo
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/native/manifest"

# 3) Un proyecto
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/native/projects/<PROJECT_ID>/nle-manifest"
```

### JavaScript / TypeScript

```ts
const BASE = "http://localhost:3000";

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/native/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json(); // { token, expiresAt, user, ... }
}

async function getAllProjects(token: string) {
  const res = await fetch(`${BASE}/api/native/manifest`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 401) throw new Error("Token inválido o expirado — vuelve a hacer login");
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json(); // { generatedAt, projectCount, projects: [...] }
}
```

### Python

```python
import requests

BASE = "http://localhost:3000"

def login(email, password):
    r = requests.post(f"{BASE}/api/native/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["token"]

def get_all_projects(token):
    r = requests.get(f"{BASE}/api/native/manifest", headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    return r.json()

token = login("usuario@ejemplo.cl", "tu-password")
data = get_all_projects(token)
print(data["projectCount"], "proyectos")
```

---

## 5. Códigos de error

| Código | Significado |
|--------|-------------|
| `200`  | OK |
| `400`  | Payload inválido / error de solicitud |
| `401`  | No autenticado: falta el token, es inválido, expiró, o credenciales incorrectas en login |
| `404`  | Recurso no encontrado (proyecto inexistente o sin acceso) |

---

## 6. Notas y limitaciones

- **Expiración:** el token dura 30 días. No hay refresh token; al expirar se vuelve a hacer login.
- **Revocación:** los tokens son *stateless* (JWT firmado), por lo que **no se pueden revocar individualmente** antes de su expiración. Si se necesita logout remoto / invalidar tokens robados, hay que agregar un registro de tokens o un `tokenVersion` por usuario (pendiente, no implementado).
- **Permisos:** cada usuario solo ve los proyectos a los que pertenece. `/api/native/manifest` ya filtra por acceso del usuario.
- **Rendimiento:** `/api/native/manifest` arma el manifest de todos los proyectos en una llamada (sync inicial). Para refrescos puntuales usa el endpoint por proyecto.
