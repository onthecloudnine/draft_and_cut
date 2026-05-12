import "dotenv/config";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { connectDb } from "@/lib/db/mongoose";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";
import { VideoVersion } from "@/models/VideoVersion";

async function main() {
  await connectDb();

  const videos = await VideoVersion.find({
    thumbnailKey: { $ne: null, $exists: true }
  })
    .select("_id thumbnailKey")
    .lean();

  console.log(`Found ${videos.length} video versions with thumbnailKey set.`);

  if (videos.length === 0) {
    return;
  }

  const s3 = getS3Client();
  const bucket = getUploadBucket();
  let deleted = 0;
  let failed = 0;

  for (const video of videos) {
    if (!video.thumbnailKey) continue;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: video.thumbnailKey }));
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        `Failed to delete s3://${bucket}/${video.thumbnailKey}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  const result = await VideoVersion.updateMany(
    { thumbnailKey: { $ne: null, $exists: true } },
    { $set: { thumbnailKey: null } }
  );

  console.log(`S3: deleted ${deleted}, failed ${failed}.`);
  console.log(`MongoDB: cleared thumbnailKey on ${result.modifiedCount} documents.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
