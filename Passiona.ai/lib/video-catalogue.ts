export type ProductVideo = {
  slug: "fit-studio" | "ai-smart-city";
  posterUrl: string;
  accent: "teal" | "green";
  youtubeId: string;
  watchUrl: string;
};

export const productVideos: readonly ProductVideo[] = [
  {
    slug: "fit-studio",
    posterUrl: "/product/fit-studio.v1.avif",
    accent: "teal",
    youtubeId: "To0cxtJcztA",
    watchUrl: "https://www.youtube.com/watch?v=To0cxtJcztA",
  },
  {
    slug: "ai-smart-city",
    posterUrl: "/product/ai-city.v1.avif",
    accent: "green",
    youtubeId: "2e05mTA2dss",
    watchUrl: "https://www.youtube.com/watch?v=2e05mTA2dss",
  },
];
