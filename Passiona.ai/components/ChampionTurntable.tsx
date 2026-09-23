"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const ChampionScene = dynamic(() => import("./ChampionScene"), {
  ssr: false,
  loading: () => <span className="explorer-status">Loading 3D…</span>,
});

export default function ChampionTurntable({
  alt,
  fallbackSrc,
  unavailableLabel,
}: {
  alt: string;
  fallbackSrc: string;
  unavailableLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [motionPreferenceKnown, setMotionPreferenceKnown] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(query.matches);
      setMotionPreferenceKnown(true);
    };
    const frame = requestAnimationFrame(update);
    query.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      query.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !motionPreferenceKnown || reducedMotion || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "320px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, [motionPreferenceKnown, reducedMotion]);

  const handleReady = useCallback(() => setReady(true), []);
  const handleFailure = useCallback(() => setFailed(true), []);

  return (
    <div ref={hostRef} className={`champion-explorer${ready ? " champion-explorer--ready" : ""}`}>
      <Image
        src={fallbackSrc}
        alt={alt}
        fill
        sizes="(min-width: 768px) 46vw, calc(100vw - 32px)"
        className="champion-poster object-cover"
      />
      {shouldLoad && !reducedMotion && !failed ? <ChampionScene ariaLabel={alt} unavailableLabel={unavailableLabel} onReady={handleReady} onFailure={handleFailure} /> : null}
    </div>
  );
}
