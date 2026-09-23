"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// SlideShow — auto-advancing crossfade slider (3s per slide) with clickable
// dot indicators. `textPosition="overlay"` keeps the caption on the image;
// `textPosition="aside"` moves it ABOVE the image (for the "under the title"
// layout). prefers-reduced-motion makes the crossfade instant via the global
// CSS rule; the timer keeps running.
export default function SlideShow({
  slides,
  ariaLabel,
  textPosition = "overlay",
}: {
  slides: { image: string; alt: string; text: React.ReactNode }[];
  ariaLabel: string;
  textPosition?: "overlay" | "aside";
}) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % slides.length);
    }, 3000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [slides.length]);

  function goTo(i: number) {
    setCurrent(i);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCurrent((c) => (c + 1) % slides.length);
      }, 3000);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {textPosition === "aside" && (
        <p className="text-small font-bold leading-relaxed text-teal">
          {slides[current].text}
        </p>
      )}

      <div
        role="region"
        aria-label={ariaLabel}
        className="relative aspect-video overflow-hidden rounded-xl border border-teal/20 bg-[#EAF3FB]"
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            aria-hidden={i !== current}
            className={`absolute inset-0 transition-opacity duration-300 ease-out ${
              i === current ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={slide.image}
              alt={slide.alt}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              priority={i === 0}
            />
            {textPosition === "overlay" && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/85 to-transparent px-5 pb-4 pt-10">
                <p className="text-sm font-bold text-body">{slide.text}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Slide controls">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === current}
            aria-label={`Slide ${i + 1}`}
            onClick={() => goTo(i)}
            className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
              i === current
                ? "w-6 bg-teal"
                : "bg-ink/25 hover:bg-teal/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
