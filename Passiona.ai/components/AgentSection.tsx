import { getTranslations } from "next-intl/server";
import Reveal from "./Reveal";
import CodingBuddyPreview from "./CodingBuddyPreview";

type Principle = { title: string; body: string };

export default async function AgentSection() {
  const t = await getTranslations("Agent");
  const principles = t.raw("principles") as Principle[];
  return (
    <section className="agent-section section-panel" aria-labelledby="agent-title">
      <Reveal>
        <p className="section-kicker">{t("eyebrow")}</p>
        <h2 id="agent-title" className="max-w-3xl font-heading text-body" style={{ fontSize: "var(--text-title)" }}>{t("title")}</h2>
      </Reveal>
      <div className="mt-12 max-w-3xl">
        <Reveal as="article" className="agent-panel">
          <CodingBuddyPreview
            ariaLabel={t("previewDescription")}
            strings={{
              name: t("previewName"),
              cityPlan: t("previewCityPlan"),
              status: t("previewStatus"),
              goalLabel: t("previewGoalLabel"),
              goal: t("previewGoal"),
              toolsLabel: t("previewToolsLabel"),
              tools: t("previewTools"),
              childLabel: t("previewChildLabel"),
              childMessage: t("previewChildMessage"),
              buddyLabel: t("previewBuddyLabel"),
              buddyMessage: t("previewBuddyMessage"),
              proposalLabel: t("previewProposalLabel"),
              proposal: t("previewProposal"),
              decisionQuestion: t("previewDecisionQuestion"),
              approve: t("previewApprove"),
              change: t("previewChange"),
              checkedLabel: t("previewCheckedLabel"),
              checked: t("previewChecked"),
            }}
          />
          <p className="mt-6 max-w-2xl text-body/70" style={{ fontSize: "var(--text-prose)" }}>{t("intro")}</p>
          <p className="mt-6 section-kicker">{t("genericKicker")}</p>
          <h3 className="font-heading text-2xl text-body">{t("genericTitle")}</h3>
          <p className="mt-3 text-body/70">{t("genericBody")}</p>
          <div className="mt-5 flex flex-wrap gap-2">{principles.map((item) => <span className="concept-chip" key={item.title}>{item.title}</span>)}</div>
        </Reveal>
      </div>
    </section>
  );
}
