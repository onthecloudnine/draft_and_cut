import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client, getUploadBucket } from "@/lib/s3/client";

export async function maybeGetSignedObjectUrl(s3Key: string) {
  if (!process.env.AWS_REGION || !process.env.AWS_S3_BUCKET) {
    return null;
  }

  try {
    return await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: getUploadBucket(),
        Key: s3Key
      }),
      { expiresIn: 60 * 30 }
    );
  } catch {
    return null;
  }
}
