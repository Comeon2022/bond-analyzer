import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Ref } from 'react';
import { CONCEPT_EXPLANATIONS, type ConceptExplanation, type ConceptId } from '../lib/concepts';

export function ConceptExplanationDialog({
  content,
  dialogId,
  onCancel,
  onClose,
  dialogRef,
}: {
  content: ConceptExplanation;
  dialogId: string;
  onCancel: () => void;
  onClose: () => void;
  dialogRef?: Ref<HTMLDialogElement>;
}) {
  return <dialog id={dialogId} className="concept-dialog" dir="rtl" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`} onCancel={onCancel} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <button className="concept-dialog-close" type="button" aria-label={`סגירת ההסבר על ${content.title}`} onClick={onClose} autoFocus>×</button>
    <h2 id={`${dialogId}-title`}>{content.title}</h2>
    <p><b>מה זה?</b> {content.what}</p>
    <p><b>למה זה חשוב?</b> {content.why}</p>
    <p><b>איך לקרוא את זה?</b> {content.howToRead}</p>
    {content.moreDetail && <p><b>פרט נוסף:</b> {content.moreDetail}</p>}
  </dialog>;
}

export function ConceptExplainer({ concept, explanation }: { concept: ConceptId; explanation?: ConceptExplanation }) {
  const content: ConceptExplanation = explanation ?? CONCEPT_EXPLANATIONS[concept];
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [mounted, open]);

  const dialog = mounted ? createPortal(
    <ConceptExplanationDialog
      content={content}
      dialogId={dialogId}
      dialogRef={dialogRef}
      onCancel={() => setOpen(false)}
      onClose={() => setOpen(false)}
    />,
    document.body,
  ) : null;

  return <>
    <button className="concept-explainer-trigger" type="button" aria-label={`הסבר על ${content.title}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId} onClick={(event) => { event.stopPropagation(); setOpen(true); }}>
      <span aria-hidden="true">i</span>
    </button>
    {dialog}
  </>;
}

export default ConceptExplainer;
