import {useEffect,useId,useRef} from 'react';
import './Account.css';

export default function AccountConfirm({title, description, actionLabel, onCancel, onConfirm}) {
  const dialog = useRef(null);
  const cancel = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    element.showModal();
    cancel.current?.focus();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return <dialog className="account-confirm" ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event=>{event.preventDefault();onCancel();}}>
    <h3 id={titleId}>{title}</h3>
    <p id={descriptionId}>{description}</p>
    <div className="account-actions">
      <button ref={cancel} type="button" className="mine-quiet" onClick={onCancel}>Cancelar</button>
      <button type="button" className="account-danger" onClick={onConfirm}>{actionLabel}</button>
    </div>
  </dialog>;
}
