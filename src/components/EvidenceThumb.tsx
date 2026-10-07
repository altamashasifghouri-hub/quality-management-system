import {
  AUDIO_POSTER,
  evidenceCaption,
  evidenceDisplayUrl,
  evidenceLinkUrl,
  isAudioEvidence,
  isVideoEvidence,
  VIDEO_POSTER_FALLBACK,
} from "@/lib/evidence";

export default function EvidenceThumb({ url, className = "" }: { url: string; className?: string }) {
  const isVideo = isVideoEvidence(url);
  const isAudio = isAudioEvidence(url);
  const fallback = isAudio ? AUDIO_POSTER : VIDEO_POSTER_FALLBACK;
  return (
    <a href={evidenceLinkUrl(url)} target="_blank" rel="noopener noreferrer" className="relative block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={evidenceDisplayUrl(url)}
        alt="Evidence"
        onError={(e) => {
          const el = e.currentTarget;
          if ((isVideo || isAudio) && el.src !== fallback) el.src = fallback;
        }}
        className={className}
      />
      {(isVideo || isAudio) && (
        <>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-9 h-9 rounded-full bg-black/65 border border-white/70 flex items-center justify-center text-white text-base leading-none">
              {isAudio ? "♪" : "▶"}
            </span>
          </span>
          <span className="absolute inset-x-1 bottom-1 text-[9px] text-center text-white bg-black/70 rounded px-1 py-0.5">
            {evidenceCaption(url)}
          </span>
        </>
      )}
    </a>
  );
}
