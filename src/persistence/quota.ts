export interface QuotaInfo {
  used: number;      // bytes
  quota: number;     // bytes
  percentage: number; // 0-100
}

export async function checkStorageQuota(): Promise<QuotaInfo> {
  if (!navigator.storage?.estimate) {
    return { used: 0, quota: Infinity, percentage: 0 };
  }
  const estimate = await navigator.storage.estimate();
  const used = estimate.usage ?? 0;
  const quota = estimate.quota ?? Infinity;
  const percentage = quota === Infinity ? 0 : Math.round((used / quota) * 100);
  return { used, quota, percentage };
}

export const QUOTA_WARNING_THRESHOLD = 50 * 1024 * 1024; // 50MB

export function isNearQuota(info: QuotaInfo): boolean {
  return info.used >= QUOTA_WARNING_THRESHOLD;
}

export function isQuotaExceeded(info: QuotaInfo): boolean {
  return info.percentage >= 95;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
