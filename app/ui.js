'use strict';
// DOM and SVG helpers shared by every part of the editor, and label text with subscripts.
const $=id=>document.getElementById(id), plot=$('plot'), M=Model, G=Geometry;
const key='kvasir-graph-workspace-v1', clone=o=>JSON.parse(JSON.stringify(o));
const icons={
  Select:'M4 2l13 10-7 1-3 6z',Draw:'m3 16 1-5L14 1l4 4L8 15z',Point:'M10 6a4 4 0 1 0 .01 0z',
  Guide:'M1 10h4m3 0h4m3 0h4',Shade:'M2 2h16v16H2z M2 10l8-8m-8 16L18 2m-8 16 8-8',Label:'M2 17h5m6 0h5M4 17 10 2l6 15M6 12h8',
  Graph:'M2 2v15h16M5 12l4-5 4 2 5-6',
  // Sidebar actions.
  Edit:'M3 17h4L17 7l-4-4L3 13zM11 5l4 4',New:'M10 4v12M4 10h12',Axes:'M3 2v15h15M3 6h2M3 10h2M3 14h2M8 17v-2M12 17v-2M16 17v-2',
  'Move label':'M10 2v16M2 10h16M7 5l3-3 3 3M7 15l3 3 3-3M5 7l-3 3 3 3M15 7l3 3-3 3',
  'Copy & shift':'M7 7h10v10H7zM13 3H3v10','Mark equilibrium':'M2 4l16 12M2 16 18 4M10 10v8M2 10h8',
  'Add area':'M2 2h16v16H2zM10 6v8M6 10h8','Detach':'M8 12l-3 3a2.5 2.5 0 0 1-3.5-3.5l3-3M12 8l3-3a2.5 2.5 0 0 1 3.5 3.5l-3 3M3 3l14 14',
  Delete:'M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12'
};
function icon(name){return '<svg viewBox="0 0 20 20" aria-hidden="true" fill="'+(name==='Point'?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="'+icons[name]+'"/></svg>';}
function btn(label,fn,cls=''){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=cls;b.onclick=fn;return b;}
function svg(tag,attrs,parent=plot){const e=document.createElementNS(plot.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e;}
// Keep labels as editable strings in workspace backups. Use native text runs
// so arbitrary subscripts also survive standalone SVG, PNG and print export.
function renderLabel(el,value){
  el.replaceChildren();
  let end=0;
  for(const match of value.matchAll(/_\{([^{}]+)\}/g)){
    el.append(value.slice(end,match.index));
    const sub=el.namespaceURI===plot.namespaceURI
      ? svg('tspan',{'baseline-shift':'sub','font-size':'70%'},el)
      : el.appendChild(document.createElement('sub'));
    sub.textContent=match[1];
    end=match.index+match[0].length;
  }
  el.append(value.slice(end));
}
function txt(parent,text,x,y,attrs={}){const el=svg('text',{x,y,fill:M.ink,'font-family':'Georgia,serif',...attrs},parent);renderLabel(el,text);return el;}
