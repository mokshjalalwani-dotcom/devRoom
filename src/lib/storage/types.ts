/**
 * src/lib/storage/types.ts
 * Storage provider interface – swap Supabase → R2 by implementing this.
 */
export interface SignedUploadResult {
  signedUrl: string
  path: string
  token: string
}

export interface StorageProvider {
  /**
   * Generate a signed URL for uploading a file to the storage backend.
   * @param bucket   Bucket name
   * @param path     Object path within the bucket
   * @param ttlSecs  Signed URL expiry in seconds
   */
  createUploadUrl(bucket: string, path: string, ttlSecs: number): Promise<SignedUploadResult>

  /**
   * Generate a short-lived signed download URL.
   * @param bucket  Bucket name
   * @param path    Object path
   * @param ttlSecs Expiry in seconds (default 60)
   */
  createDownloadUrl(bucket: string, path: string, ttlSecs?: number): Promise<string>

  /**
   * Delete one or more objects.
   * @param bucket Bucket name
   * @param paths  Array of object paths to remove
   */
  deleteObjects(bucket: string, paths: string[]): Promise<void>

  /**
   * List objects under a prefix.
   * @param bucket Bucket name
   * @param prefix Path prefix (e.g. room ID)
   */
  listObjects(bucket: string, prefix: string): Promise<string[]>
}
