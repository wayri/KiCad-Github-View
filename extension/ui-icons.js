/* Original, compact circuit-review icons. No external font or icon dependency. */
((root)=>{
  'use strict';
  const paths={
    back:'M19 12H5m6-6-6 6 6 6',forward:'M5 12h14m-6-6 6 6-6 6',up:'M12 19V5m-6 6 6-6 6 6',home:'M3 11 12 3l9 8 M5 10v11h14V10 M10 21v-7h4v7',
    gear:'M9 3h6l.5 3 2.5 1.5 3-.5 2 5-2.5 1.5-.5 3 2 2.5-4 3-2.5-2-3 .5L10 23l-5-2 .5-3L4 15.5 1 15V9l3-.5L5.5 6l-.5-3 5-2z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
    rules:'M12 3 22 21H2z M12 9v5m0 3v1',
    board:'M4 3h13l3 3v14H4z M7 7h7v7H7z M17 9h1m-1 3h1M8 17h6 M2 6h2M2 10h2M2 14h2',
    parts:'M7 7h10v10H7z M9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4',
    fit:'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6 M8 8h8v8H8z',
    page:'M6 2h9l4 4v16H6z M15 2v5h4 M9 16h7m-7 3h7M9 10h4',
    plus:'M5 12h14M12 5v14', minus:'M5 12h14',
    inspect:'M4 4h16v16H4z M9 4v16m3-11h5m-5 4h5m-5 4h3',
    comment:'M3 4h18v12H9l-5 4v-4H3z M7 8h10m-10 4h7',
    ruler:'M3 16 16 3l5 5L8 21z M7 12l3 3m0-6 3 3m0-6 3 3',
    grid:'M4 4h16v16H4z M4 9h16M4 15h16M9 4v16M15 4v16',
    flip:'M3 5h7v14H3z M15 5h6v14h-6 M12 2v20 M16 9l3 3-3 3',
    cube:'m12 2 9 5v10l-9 5-9-5V7z M3 7l9 5 9-5M12 12v10',
    theme:'M12 3a9 9 0 1 0 9 9c-6 2-11-3-9-9z',
    settings:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M10 15v6',
    area:'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6 M8 11h8m-4-4v8',
    camera:'M3 7h5l2-3h4l2 3h5v13H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
    settings:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M10 15v6',
    area:'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6 M8 11h8m-4-4v8',
    camera:'M3 7h5l2-3h4l2 3h5v13H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
    assembly:'M4 7h16v13H4z M8 7V4h8v3 M8 11v5m4-5v5m4-5v5',
    import:'M4 14v6h16v-6 M12 3v12m-4-4 4 4 4-4',
    close:'M6 6l12 12M18 6 6 18',
    net:'M4 5h5v5H4z M15 14h5v5h-5z M6.5 10v6.5H15 M17.5 14V7H9',
    layers:'m12 3 10 5-10 5L2 8z M2 12l10 5 10-5M2 16l10 5 10-5',
    search:'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z M15 15l6 6',
    sheet:'M3 3h12v13H3z M9 16v5h12V9h-6 M6 7h6m-6 4h4',
    info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 11v6M12 7v1',
    pin:'M8 3h8v8H8z M12 11v10M5 15h14',
    track:'M3 18h6V6h12 M3 16v4M19 4h3v4',
    link:'M9 15 15 9M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0'
  };
  function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','ui-icon');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.parts);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.6');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;}
  function decorate(scope=document){for(const node of scope.querySelectorAll('[data-icon]')){if(node.querySelector('.ui-icon'))continue;const name=node.dataset.icon;if(node.tagName==='BUTTON'){const label=document.createElement('span');label.className='button-label';label.textContent=node.textContent;if(!node.hasAttribute('aria-label'))node.setAttribute('aria-label',label.textContent.trim());node.replaceChildren(icon(name),label);}else node.prepend(icon(name));}}
  function label(node,text){const span=node.querySelector('.button-label');if(span)span.textContent=text;else node.textContent=text;}
  root.KiCadUIIcons={icon,decorate,label};
  if(typeof module==='object'&&module.exports)module.exports={paths};
})(globalThis);
