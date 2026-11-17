import {useEffect,useId,useRef,useState} from 'react';
import './NavigationRadar.css';

const destinations = [
  {screen:'monitor',label:'Visão geral',angle:-52,icon:'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l6-6M18 6h3M18 6V3'},
  {screen:'sites',label:'Meus sites',angle:0,icon:'m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5'},
  {screen:'test',label:'Laboratório',angle:52,icon:'M9 3h6M10 3v6l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 14h8'}
];

function RadarIcon({path}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;
}

export default function NavigationRadar({screen,onNavigate}) {
  const [open,setOpen] = useState(false);
  const [aim,setAim] = useState(null);
  const trigger = useRef(null);
  const options = useRef(null);
  const gesture = useRef(null);
  const focusOnOpen = useRef(false);
  const ignoreClick = useRef(false);
  const optionsId = useId();

  function close(restoreFocus=false) {
    setOpen(false);
    setAim(null);
    if (restoreFocus) trigger.current?.focus({preventScroll:true});
  }

  useEffect(()=>{
    if (!open) return;
    if (focusOnOpen.current) {
      (options.current?.querySelector('[aria-current]') ?? options.current?.querySelector('button'))?.focus();
    }
    const escape = event=>{
      if (event.key==='Escape') {
        event.preventDefault();
        close(true);
      }
    };
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[open]);

  useEffect(()=>{
    const media=window.matchMedia('(max-width: 640px)');
    const update=()=>{if(!media.matches) close();};
    media.addEventListener('change',update);
    return ()=>media.removeEventListener('change',update);
  },[]);

  function select(destination) {
    onNavigate(destination);
    close(true);
  }

  function destinationAt(event) {
    const button = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-radar-destination]');
    return options.current?.contains(button) ? button.dataset.radarDestination : null;
  }

  function start(event) {
    if (!event.isPrimary || event.button!==0) return;
    ignoreClick.current=false;
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false};
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event) {
    const pointer=gesture.current;
    if (pointer?.id!==event.pointerId) return;
    if (!pointer.dragged && Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<8) return;
    if (!pointer.dragged) {
      pointer.dragged=true;
      focusOnOpen.current=false;
      setOpen(true);
    }
    setAim(destinationAt(event));
  }

  function finish(event,cancelled=false) {
    const pointer=gesture.current;
    if (pointer?.id!==event.pointerId) return;
    gesture.current=null;
    if (!pointer.dragged) return;
    ignoreClick.current=true;
    const destination=cancelled ? null : destinationAt(event);
    if (destination) select(destination);
    else close(true);
  }

  const highlighted=destinations.find(destination=>destination.screen===(aim??screen));
  return <>
    {open&&<div className="navigation-radar-backdrop" aria-hidden="true" onClick={()=>close(true)}/>}
    <nav className="navigation-radar" aria-label="Navegação principal">
      <button ref={trigger} className="navigation-radar-trigger" type="button"
        aria-label={open?'Fechar navegação':'Navegar'} aria-expanded={open} aria-controls={optionsId}
        onPointerDown={start} onPointerMove={move} onPointerUp={event=>finish(event)}
        onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}
        onClick={event=>{
          if (ignoreClick.current&&event.detail!==0) {ignoreClick.current=false;return;}
          if (open) close();
          else {focusOnOpen.current=true;setOpen(true);}
        }}>
        <RadarIcon path={destinations[0].icon}/>
        <span aria-hidden="true">{open?'Fechar':'Navegar'}</span>
      </button>
      <div ref={options} id={optionsId} className="navigation-radar-options" hidden={!open}>
        <div className="navigation-radar-dial" aria-hidden="true"
          style={highlighted?{'--radar-angle':highlighted.angle+'deg'}:undefined}/>
        {destinations.map(destination=><button key={destination.screen} type="button"
          className="navigation-radar-target" data-radar-destination={destination.screen}
          data-highlighted={highlighted?.screen===destination.screen}
          aria-current={screen===destination.screen?'page':undefined}
          onClick={()=>select(destination.screen)}>
          <span className="navigation-radar-label">{destination.label}</span>
          <span className="navigation-radar-node"><RadarIcon path={destination.icon}/></span>
        </button>)}
      </div>
    </nav>
  </>;
}
