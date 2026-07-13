import { S3Client } from "@aws-sdk/client-s3";

// El cliente S3 es stateless y reutilizable; construir uno por llamada (cientos
// por página al firmar URLs) es puro overhead. Se memoiza por región.
let cachedClient: S3Client | null = null;
let cachedRegion: string | null = null;

export function getS3Client() {
  const region = process.env.AWS_REGION;

  if (!region) {
    throw new Error("AWS_REGION is not configured");
  }

  if (cachedClient && cachedRegion === region) {
    return cachedClient;
  }

  cachedClient = new S3Client({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        : undefined
  });
  cachedRegion = region;
  return cachedClient;
}

export function getUploadBucket() {
  const bucket = process.env.AWS_S3_BUCKET;

  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is not configured");
  }

  return bucket;
}
