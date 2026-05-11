import { PutObjectCommand, type ObjectCannedACL } from "@aws-sdk/client-s3";
import { getUploadBucket } from "@/lib/s3/client";

export function getUploadAcl() {
  const acl = process.env.AWS_S3_UPLOAD_ACL?.trim();

  return acl && acl !== "none" ? acl : "";
}

export function buildPutObjectUpload(input: { key: string; contentType: string }) {
  const acl = getUploadAcl();
  const uploadHeaders: Record<string, string> = {};

  if (acl) {
    uploadHeaders["x-amz-acl"] = acl;
  }

  return {
    command: new PutObjectCommand({
      Bucket: getUploadBucket(),
      Key: input.key,
      ContentType: input.contentType,
      ...(acl ? { ACL: acl as ObjectCannedACL } : {})
    }),
    uploadHeaders
  };
}
