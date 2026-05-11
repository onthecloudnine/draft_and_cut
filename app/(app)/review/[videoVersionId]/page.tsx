import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { assertProjectPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/mongoose";
import { getReviewData } from "@/lib/data/review";
import { getDictionary } from "@/lib/i18n/server";
import { optionLabel, translate } from "@/lib/i18n/messages";
import { VideoVersion } from "@/models/VideoVersion";
import { ReviewWorkspace } from "./review-workspace";

export default async function ReviewPage({
  params
}: {
  params: Promise<{ videoVersionId: string }>;
}) {
  const { videoVersionId } = await params;
  const user = await requireUser();
  await connectDb();

  const video = await VideoVersion.findById(videoVersionId).select("projectId").lean();

  if (!video) {
    notFound();
  }

  await assertProjectPermission(user.id, String(video.projectId), "video:review");

  const [data, dictionary] = await Promise.all([getReviewData(videoVersionId), getDictionary()]);

  if (!data) {
    notFound();
  }
  const t = (path: string) => translate(dictionary, path);

  return (
    <div className="grid gap-2">
      <div className="border-b border-neutral-800 bg-black px-5 py-4 sm:px-7">
        <Link className="text-sm font-medium text-red-300 hover:text-red-200" href={`/scenes/${data.video.sceneId}`}>
          {t("review.backToScene")}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-50">
          {data.scene ? `${t("scene.scene")} ${data.scene.sceneNumber}` : t("review.titleFallback")} /{" "}
          {optionLabel(dictionary, "productionStages", data.video.stage)} v{data.video.versionNumber}
        </h1>
        <p className="mt-2 text-sm text-slate-400">{data.video.fileName}</p>
      </div>
      <ReviewWorkspace data={data} />
    </div>
  );
}
