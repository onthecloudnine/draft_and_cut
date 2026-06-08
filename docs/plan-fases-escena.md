# Plan: Fases por escena (imagen + sonido)

> Spec acordado para extender la vista de escena con varias "fases" de producción y pistas de sonido en paralelo. Plataforma: SaaS web (Next.js + MongoDB + S3). Se descartó ir a app nativa (Xcode/AVFoundation): contradice la tesis SaaS/colaborativa/cross-platform y resuelve un problema que v1 no tiene.

## Concepto central

La escena es una **secuencia de planos** (su línea de tiempo, definida por `startFrame`/`endFrame`/`durationFrames` de cada `Shot`). Cada **fase de imagen** rellena esos slots con un medio distinto, y en **paralelo** corren las **pistas de sonido** por stem. Cada fase tiene, por tanto, su propia línea de tiempo.

## Imagen — 4 fases (eje principal de navegación)

| Fase | Medio | Scope | Stages granulares (sub-selector) |
|---|---|---|---|
| Storyboard | 1 imagen por plano (versionada) | por plano | — |
| Animatic | 1 video de escena (planos por timecode) | escena | `animatic` |
| Playblast | video por plano | por plano | `layout` · `blocking` · `animation` |
| Render | video por plano | por plano | `lighting` · `render` · `final` |

- Se conservan los `productionStages` granulares existentes; las 4 fases los agrupan (2 niveles: pestaña de fase + sub-selector de stage).
- Reproducción **un plano a la vez** (selector de planos + player + comentarios por frame). El timeline muestra todos los planos como segmentos para navegar; los planos sin medio se muestran como hueco con botón "＋ subir".

## Sonido — pistas por stem (en paralelo)

- Stems: **diálogo · foley · música · ambiente**. Cada uno es una **pista continua de la escena**, a nivel escena (no por plano), **versionada**.
- Mapean al enum existente `sceneSoundOptions`: `dialogue` / `folley` / `music` / `incidental`. `Scene.soundOptions` define qué pistas mostrar por escena.
- **Madurez = número de versión** (sin estado extra tipo borrador/aprobado).
- **Mute/solo por pista** incluido en v1.
- Las pistas "llegan ya armadas" por categoría (el ensamble de sonido se hace fuera de la plataforma; aquí se suben pistas terminadas).

## Player

Un componente reutilizable `SequenceTimeline` para las 4 fases:
- Pista de video arriba (fuente = fase activa: un video continuo en Animatic; clips por plano en Playblast/Render; stills en Storyboard).
- Lanes de audio abajo (un lane por stem activo, con mute/solo).
- Selector de planos + comentarios por frame (reutiliza el sistema actual).

## Rendimiento (decisión por capas)

- **v1 = visualización + reproducción enfocada** (un medio a la vez). Liviano, bajo riesgo. Es el objetivo declarado: visualizar y ordenar el proyecto.
- **v2 = reproducción multipista sincronizada** (video + stems en sync vía Web Audio API, con reloj maestro y corrección de deriva). Mejora posterior.
- Salvaguardas: streaming por range requests, `preload="metadata"`, carga perezosa de imágenes/miniaturas, un solo decodificador de video activo a la vez, media ya optimizada para web (sin transcodificar en servidor).

## Datos (modelos)

- **Animatic:** sin cambios (`VideoVersion` con `scope: "scene"`).
- **Playblast/Render:** habilitar `VideoVersion` con `scope: "shot"` + `shotId` (el modelo y su índice único `(projectId, sceneId, shotId, scope, stage, versionNumber)` ya lo soportan). Hoy `uploads/init` fuerza `scope: "scene"`; hay que abrirlo.
- **Storyboard (modelo nuevo `StoryboardFrame`):** `{ projectId, sceneId, shotId, versionNumber, s3Key, thumbnailKey?, fileName, mimeType, fileSizeMb, width?, height?, uploadedBy, uploadId, etag, status }`, índice único `(shotId, versionNumber)`. Vigente = mayor `versionNumber`. No se reusa `VideoVersion` (exige campos de video).
- **Sonido (modelo nuevo `AudioVersion`):** `{ projectId, sceneId, scope: "scene", stem, versionNumber, s3Key, fileName, mimeType (audio/mpeg|wav|aac), duration, fileSizeMb, status, uploadedBy, uploadId, etag }`, índice único `(sceneId, stem, versionNumber)`.

## API

- `app/api/uploads/init`: aceptar `scope: "shot"` + `shotId`, versionando por `(shot, stage)`.
- Nuevo `app/api/scenes/[sceneId]/storyboard/` → `init` + `complete` (subida directa a S3, mimes `image/png|jpeg|webp`).
- Nuevo `app/api/scenes/[sceneId]/audio/` → `init` + `complete` (mimes de audio).
- `lib/data/scene-detail.ts`: incluir `storyboardFrames` y `audioVersions` en el payload.

## UI

- `PhaseSwitcher` (Nivel 1: las 4 fases) + sub-selector de stage granular (Playblast/Render).
- `StageView` que reemplaza el área central según la fase: `StoryboardGallery`, `AnimaticPlayer` (actual), `ShotVideoView`.
- Lanes de audio en el `SequenceTimeline`.
- Tabla de planos como vista transversal (muestra por plano qué medio existe en cada fase/stem).
- Replicar en `mobile-scene-detail.tsx`.
- i18n (es/en) para fases y stems faltantes (`storyboard`, `playblast`, etc.).

## Orden de implementación

1. Generalizar el player a `SequenceTimeline` (Animatic sigue igual; refactor sin cambio visible).
2. Playblast/Render: upload `scope:"shot"` + clips por plano + huecos en el timeline.
3. `PhaseSwitcher` (4 fases) + sub-selector de stage granular.
4. Storyboard: modelo `StoryboardFrame` + API + `StoryboardGallery`.
5. Pistas de audio: modelo `AudioVersion` + API + lanes (v1 enfocado, con mute/solo).
6. Tabla transversal + mobile + i18n.

## Notas / pendientes

- Comentarios sobre imagen (storyboard) quedan fuera de v1.
- Reproducción concatenada seamless entre clips de planos: v2.
- Offsets finos por pista de audio: v2.
