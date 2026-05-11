import { notFound } from "next/navigation";
import { I18nProvider } from "@/lib/i18n/client";
import { connectDb } from "@/lib/db/mongoose";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { Project } from "@/models/Project";
import { JoinProjectForm } from "./join-project-form";

export default async function JoinProjectPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  await connectDb();

  const project = await Project.findOne({ slug: projectSlug }).select("title slug").lean();

  if (!project) {
    notFound();
  }

  const [dictionary, locale] = await Promise.all([getDictionary(), getLocale()]);

  return (
    <I18nProvider dictionary={dictionary} locale={locale}>
      <JoinProjectForm projectSlug={project.slug} projectTitle={project.title} />
    </I18nProvider>
  );
}
