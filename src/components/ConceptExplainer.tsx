import { CONCEPT_EXPLANATIONS, type ConceptId, type ConceptExplanation } from '../lib/concepts';

export function ConceptExplainer({ concept, explanation }: { concept: ConceptId; explanation?: ConceptExplanation }) {
  const content: ConceptExplanation = explanation ?? CONCEPT_EXPLANATIONS[concept];
  return <details className="concept-explainer" dir="rtl">
    <summary aria-label={`הסבר על ${content.title}`} onClick={(event) => event.stopPropagation()}><span aria-hidden="true">i</span><span className="sr-only">הסבר על {content.title}</span></summary>
    <div className="concept-explainer-content" role="note">
      <h3>{content.title}</h3>
      <p><b>מה זה?</b> {content.what}</p>
      <p><b>למה זה חשוב?</b> {content.why}</p>
      <p><b>איך לקרוא את זה?</b> {content.howToRead}</p>
      {content.moreDetail && <p><b>פרט נוסף:</b> {content.moreDetail}</p>}
    </div>
  </details>;
}

export default ConceptExplainer;
