import { requireUser } from "@/lib/auth/session";
import { getUploadOptions } from "@/lib/data/upload";
import { getDictionary } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";
import { UploadForm } from "./upload-form";

export default async function UploadPage({
  searchParams
}: {
  searchParams: Promise<{ projectId?: string; sceneId?: string }>;
}) {
  const [{ projectId, sceneId }, user] = await Promise.all([searchParams, requireUser()]);
  const [options, dictionary] = await Promise.all([getUploadOptions(user.id), getDictionary()]);
  const t = (path: string) => translate(dictionary, path);

  return (
    <div className="grid gap-6 p-5 sm:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">{t("upload.pageTitle")}</h1>
        <p className="mt-2 text-sm text-slate-400">{t("upload.pageSubtitle")}</p>
      </div>
      <UploadForm initialProjectId={projectId} initialSceneId={sceneId} options={options} />
    </div>
  );
}
