type CodingBuddyPreviewStrings = {
  name: string;
  cityPlan: string;
  status: string;
  goalLabel: string;
  goal: string;
  toolsLabel: string;
  tools: string;
  childLabel: string;
  childMessage: string;
  buddyLabel: string;
  buddyMessage: string;
  proposalLabel: string;
  proposal: string;
  decisionQuestion: string;
  approve: string;
  change: string;
  checkedLabel: string;
  checked: string;
};

export default function CodingBuddyPreview({
  ariaLabel,
  strings,
}: {
  ariaLabel: string;
  strings: CodingBuddyPreviewStrings;
}) {
  return (
    <div className="coding-buddy-preview" role="img" aria-label={ariaLabel}>
      <div className="buddy-preview-header">
        <div className="buddy-preview-robot" aria-hidden="true">
          <span className="buddy-preview-antenna" />
          <span className="buddy-preview-head">
            <span className="buddy-preview-visor"><i /><i /></span>
          </span>
        </div>
        <div className="buddy-preview-identity">
          <strong>{strings.name}</strong>
          <span>{strings.cityPlan}</span>
        </div>
        <span className="buddy-preview-online" aria-hidden="true" />
      </div>

      <div className="buddy-preview-status"><span aria-hidden="true" />{strings.status}</div>

      <div className="buddy-preview-chat">
        <div className="buddy-preview-boundary">
          <div><span>{strings.goalLabel}</span><strong>{strings.goal}</strong></div>
          <div><span>{strings.toolsLabel}</span><strong>{strings.tools}</strong></div>
        </div>
        <div className="buddy-preview-child-bubble">
          <span>{strings.childLabel}</span>
          <p>{strings.childMessage}</p>
        </div>
        <div className="buddy-preview-bubble">
          <span>{strings.buddyLabel}</span>
          <p>{strings.buddyMessage}</p>
          <div className="buddy-preview-proposal"><span>{strings.proposalLabel}</span><strong>{strings.proposal}</strong></div>
          <small>{strings.decisionQuestion}</small>
        </div>
        <div className="buddy-preview-actions" aria-hidden="true">
          <span className="buddy-preview-approve">{strings.approve}</span>
          <span>{strings.change}</span>
        </div>
        <div className="buddy-preview-checked"><span aria-hidden="true">✓</span><div><strong>{strings.checkedLabel}</strong><small>{strings.checked}</small></div></div>
      </div>

      <div className="buddy-preview-composer" aria-hidden="true">
        <span /><i /><b />
      </div>
    </div>
  );
}
