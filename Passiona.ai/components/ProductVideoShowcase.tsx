import { getTranslations } from "next-intl/server";
import { productVideos } from "@/lib/video-catalogue";
import VideoFacade from "./VideoFacade";

export default async function ProductVideoShowcase() {
  const t = await getTranslations("ProductVideos");
  return (
    <section className="demo-band" aria-labelledby="product-videos-heading">
      <div className="demo-band-inner">
        <div className="section-heading section-heading-light">
          <p className="section-kicker">{t("eyebrow")}</p>
          <h2 id="product-videos-heading">{t("heading")}</h2>
          <p>{t("intro")}</p>
        </div>
        <div className="video-grid">
          {productVideos.map((video) => {
            const title = t(`${video.slug}.title`);
            return (
              <article key={video.slug} className="product-video-card">
                <VideoFacade title={title} posterUrl={video.posterUrl} youtubeId={video.youtubeId} playLabel={t("play")} />
                <div className="video-copy">
                  <p className="product-video-label">{t(`${video.slug}.label`)}</p>
                  <h3>{title}</h3>
                  <p>{t(`${video.slug}.description`)}</p>
                  <a className="video-fallback-link" href={video.watchUrl} target="_blank" rel="noreferrer">
                    {t("watchOnYouTube")} <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
