"use client";

import Image from "next/image";
import { useState } from "react";

export default function VideoFacade({ title, posterUrl, youtubeId, playLabel }: { title: string; posterUrl: string; youtubeId: string; playLabel: string }) {
  const [playing, setPlaying] = useState(false);
  const playerUrl = new URL(`https://www.youtube.com/embed/${youtubeId}`);
  if (typeof window !== "undefined") {
    playerUrl.searchParams.set("origin", window.location.origin);
  }
  playerUrl.searchParams.set("autoplay", "1");
  playerUrl.searchParams.set("playsinline", "1");
  playerUrl.searchParams.set("rel", "0");
  playerUrl.searchParams.set("modestbranding", "1");
  return (
    <div className="product-video-frame">
      {playing ? (
        <iframe className="absolute inset-0 h-full w-full border-0" src={playerUrl.toString()} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      ) : (
        <>
          <Image src={posterUrl} alt="" fill sizes="(min-width: 1024px) 544px, (min-width: 640px) calc(100vw - 80px), calc(100vw - 32px)" className="object-cover" />
          <button type="button" onClick={() => setPlaying(true)} className="video-play" aria-label={`${playLabel}: ${title}`}><span aria-hidden="true">▶</span></button>
        </>
      )}
    </div>
  );
}
