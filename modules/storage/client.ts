import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent as HttpsAgent } from "node:https";

let _r2: S3Client | null = null;

export function getR2(): S3Client {
  if (_r2) return _r2;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.local",
    );
  }
  // Disable HTTPS keep-alive: socket reuse against Cloudflare R2 can hand out
  // sockets in a bad TLS state, surfacing as "bad record mac" (OpenSSL alert 20).
  // Forcing a fresh TLS handshake per request avoids that whole class of error.
  const requestHandler = new NodeHttpHandler({
    httpsAgent: new HttpsAgent({ keepAlive: false }),
  });
  _r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestHandler,
    maxAttempts: 4,
  });
  return _r2;
}

export function getBucket(): string {
  return process.env.R2_BUCKET ?? "bits-image";
}
