export function isVideoEvidence(url: string): boolean {
  return /drive\.google\.com\/file\/d\//.test(url || "");
}

export function driveFileIdOf(url: string): string {
  const u = url || "";
  const path = u.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (path) return path[1];
  const query = u.match(/[?&]id=([^&#]+)/);
  return query ? query[1] : "";
}

export function videoPosterId(url: string): string {
  const frag = (url || "").match(/#qms=([A-Za-z0-9_-]+)/);
  return frag ? frag[1] : "";
}

export function buildVideoEvidence(videoFileId: string, posterFileId: string): string {
  return `https://drive.google.com/file/d/${videoFileId}/view${posterFileId ? `#qms=${posterFileId}` : ""}`;
}

export function evidenceDisplayUrl(url: string): string {
  if (!isVideoEvidence(url)) return url;
  const poster = videoPosterId(url) || driveFileIdOf(url);
  return poster ? `https://drive.google.com/thumbnail?id=${poster}&sz=w800` : url;
}

export function evidenceLinkUrl(url: string): string {
  if (!isVideoEvidence(url)) return url;
  return (url || "").split("#")[0];
}

export function evidenceCaption(url: string): string {
  return isVideoEvidence(url) ? "Click to play video" : "Click for full view";
}

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export function videoUploadError(file: File): string {
  if (!file.type.startsWith("video/")) return "";
  if (file.size > MAX_VIDEO_BYTES) return "Video must be 500MB or smaller.";
  return "";
}

export const VIDEO_POSTER_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="224" height="160"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="54%" fill="#e2e8f0" font-size="44" text-anchor="middle" dominant-baseline="middle">&#9654;</text></svg>'
  );

export function putFileToDrive(
  uploadUrl: string,
  file: File,
  mime: string,
  onProgress?: (pct: number) => void
): Promise<{ id?: string; name?: string; error?: { message?: string } }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) resolve(json);
        else reject(new Error(json?.error?.message || `Upload failed (${xhr.status}).`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading the video."));
    xhr.onabort = () => reject(new Error("Upload was interrupted."));
    xhr.send(file);
  });
}

export async function captureVideoPoster(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    video.src = objectUrl;
    video.muted = true;
    video.defaultMuted = true;
    (video as HTMLVideoElement & { playsInline: boolean }).playsInline = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => resolve(), 8000);
      video.onloadeddata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error("Video could not be decoded in this browser.")); };
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => { if (settled) return; settled = true; clearTimeout(timer); video.onseeked = null; resolve(); };
      const timer = setTimeout(done, 5000);
      video.onseeked = done;
      try {
        video.currentTime = Math.min(Math.max(duration * 0.1, 0.1), Math.max(duration - 0.1, 0.1));
      } catch {
        done();
      }
    });
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 1000 / w);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
