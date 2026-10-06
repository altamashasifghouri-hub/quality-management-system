const cache = new Map<string, string>();

function resolveSrc(url: string): string {
  if (url.startsWith("/") || url.startsWith("data:")) return url;
  if (typeof window !== "undefined" && url.startsWith(window.location.origin)) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export function loadPdfImage(url: string): Promise<string> {
  if (!url) return Promise.resolve("");
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const MAX = 800;
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const jpeg = canvas.toDataURL("image/jpeg", 0.85);
        cache.set(url, jpeg);
        resolve(jpeg);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = resolveSrc(url);
  });
}

export function imageDims(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = dataUrl;
  });
}

export function zoomUrl(url: string): string {
  return url.replace(/sz=w\d+/, "sz=w1600");
}

export async function loadLocalPdfImage(url: string, max = 900): Promise<string> {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  const cached = cache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return "";
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("read failed"));
      fr.readAsDataURL(blob);
    });
    const jpeg = await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(dataUrl);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.9));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
    if (jpeg) cache.set(url, jpeg);
    return jpeg;
  } catch {
    return "";
  }
}

export async function preloadPdfImages(urls: string[], concurrency = 8): Promise<void> {
  const pending = Array.from(new Set(urls.filter(Boolean))).filter((u) => !cache.has(u));
  if (pending.length === 0) return;
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (i < pending.length) {
      const url = pending[i++];
      try {
        await loadPdfImage(url);
      } catch {
        /* failed images are retried (and skipped) at render time */
      }
    }
  });
  await Promise.all(workers);
}