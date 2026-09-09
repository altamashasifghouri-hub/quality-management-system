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