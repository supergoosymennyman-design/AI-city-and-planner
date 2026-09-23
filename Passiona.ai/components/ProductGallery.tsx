import { getTranslations } from "next-intl/server";
import Image from "next/image";
import ChampionTurntable from "./ChampionTurntable";
import CodingBuddyPreview from "./CodingBuddyPreview";

type Tool = {
  name: string;
  label: string;
  title: string;
  body: string;
  image?: string;
  alt?: string;
  media?: "champion-turntable" | "coding-buddy";
};

export default async function ProductGallery() {
  const t = await getTranslations("Tools");
  const agent = await getTranslations("Agent");
  const tools = t.raw("items") as Tool[];
  const buddyStrings = {
    name: agent("previewName"), cityPlan: agent("previewCityPlan"), status: agent("previewStatus"),
    goalLabel: agent("previewGoalLabel"), goal: agent("previewGoal"), toolsLabel: agent("previewToolsLabel"), tools: agent("previewTools"),
    childLabel: agent("previewChildLabel"), childMessage: agent("previewChildMessage"), buddyLabel: agent("previewBuddyLabel"), buddyMessage: agent("previewBuddyMessage"),
    proposalLabel: agent("previewProposalLabel"), proposal: agent("previewProposal"), decisionQuestion: agent("previewDecisionQuestion"),
    approve: agent("previewApprove"), change: agent("previewChange"), checkedLabel: agent("previewCheckedLabel"), checked: agent("previewChecked"),
  };
  return (
    <section id="tools" className="editorial-section tools-section scroll-mt-24" aria-labelledby="tools-heading">
      <div className="section-heading">
        <p className="section-kicker">{t("eyebrow")}</p>
        <h2 id="tools-heading">{t("title")}</h2>
        <p>{t("intro")}</p>
      </div>
      <ol className="tool-grid">
        {tools.map((tool, index) => (
          <li key={tool.name} className={`tool-card tool-card--${tool.name}`}>
            <div className={`tool-card-media tool-card-media--${tool.name}`}>
              {tool.media === "champion-turntable" && tool.image && tool.alt ? (
                <ChampionTurntable alt={tool.alt} fallbackSrc={tool.image} unavailableLabel={t("unavailable3d")} />
              ) : tool.media === "coding-buddy" ? (
                <CodingBuddyPreview
                  ariaLabel={agent("previewDescription")}
                  strings={buddyStrings}
                />
              ) : tool.image && tool.alt ? (
                <Image
                  src={tool.image}
                  alt={tool.alt}
                  fill
                  sizes="(min-width: 768px) 46vw, calc(100vw - 32px)"
                  className={tool.name === "workshop" ? "object-contain" : "object-cover"}
                />
              ) : null}
            </div>
            <div className="tool-card-copy">
              <span className="tool-number">0{index + 1}</span>
              <p className="tool-label">{tool.label}</p>
              <h3>{tool.title}</h3>
              <p>{tool.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
