export function driveFileIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const idParam = url.match(/[?&]id=([^&\s]+)/);
  if (idParam) return idParam[1];
  const dPath = url.match(/\/d\/([^/?#\s]+)/);
  if (dPath) return dPath[1];
  const fileIdParam = url.match(/[?&]fileId=([^&\s]+)/);
  if (fileIdParam) return fileIdParam[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(url.trim())) return url.trim();
  return null;
}

export async function deleteDriveFileByUrl(url: string | null | undefined): Promise<void> {
  const id = driveFileIdFromUrl(url);
  if (!id) return;
  try {
    await fetch(`/api/storage?source=drive&fileId=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
  } catch {
    // best effort — orphaned Drive files can be cleared from the Storage page
  }
}