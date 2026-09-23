"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6">
      <h1 className="font-heading text-4xl font-bold text-body">
        Something went wrong
      </h1>
      <p className="text-lg text-body/70">
        An unexpected error occurred. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="flex h-14 items-center justify-center rounded-full bg-teal px-8 text-base font-bold text-navy transition-transform hover:-translate-y-0.5 hover:bg-teal/90"
      >
        Try again
      </button>
    </section>
  );
}
