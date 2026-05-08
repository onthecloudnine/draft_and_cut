import { requireUser } from "@/lib/auth/session";
import { getUploadOptions } from "@/lib/data/upload";
import { UploadForm } from "./upload-form";

export default async function UploadPage({
  searchParams
}: {
  searchParams: Promise<{ projectId?: string; sceneId?: string }>;
}) {
  const [{ projectId, sceneId }, user] = await Promise.all([searchParams, requireUser()]);
  const options = await getUploadOptions(user.id);

  return (
    <div className="grid gap-6 p-5 sm:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Subir nueva version</h1>
        <p className="mt-2 text-sm text-slate-400">
          Arrastra un MP4 de la escena completa preparado para revision web. El archivo se sube directo a S3.
        </p>
      </div>
      <UploadForm initialProjectId={projectId} initialSceneId={sceneId} options={options} />
    </div>
  );
}
