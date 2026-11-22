'use strict';
const $=id=>document.getElementById(id), plot=$('plot'), M=Model, G=Geometry;
const key='kvasir-graph-workspace-v1', clone=o=>JSON.parse(JSON.stringify(o));
const icons={
  Select:'M4 2l13 10-7 1-3 6z',Draw:'m3 16 1-5L14 1l4 4L8 15z',Point:'M10 6a4 4 0 1 0 .01 0z',
  Guide:'M1 10h4m3 0h4m3 0h4',Shade:'M2 2h16v16H2z M2 10l8-8m-8 16L18 2m-8 16 8-8',Label:'M2 17h5m6 0h5M4 17 10 2l6 15M6 12h8',
  Graph:'M2 2v15h16M5 12l4-5 4 2 5-6'
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
const backupKey=key+'-unreadable';
let state,storageIssue=false,rawSaved=null;
// Keep saved data the editor cannot open (damaged, or from a newer version)
// under a separate key before anything can overwrite it.
function keepUnreadable(raw){
  if(!raw)return;
  try{
    const previous=localStorage.getItem(backupKey);
    if(previous===raw)return;
    if(previous)localStorage.setItem(backupKey+'-'+Date.now(),previous);
    localStorage.setItem(backupKey,raw);
  }catch{}
}
function unreadableBackup(){try{return localStorage.getItem(backupKey);}catch{return null;}}
function demoWorkspace(){const g=M.demo();return {version:1,graphs:[g],active:g.id};}
try{rawSaved=localStorage.getItem(key);if(rawSaved){state=JSON.parse(rawSaved);if(!M.validWorkspace(state))throw Error();}}
catch{state=null;storageIssue=true;keepUnreadable(rawSaved);}
if(!state)state=demoWorkspace();
let selected=null,tool='Select',drawMode='line',guideMode='auto',labelMode='object',shadeGroup=null,start=null,drag=null,hover=null,snapText='',scene,faces,cache=null;
const undo=[],redo=[], graph=()=>state.graphs.find(g=>g.id===state.active);
const selectedObj=()=>graph().objects.find(o=>o.id===selected);
const num=v=>String(Number(v.toFixed(5))), color=o=>/^#[0-9a-f]{6}$/i.test(o.color)?o.color:M.ink;
const box={x:76,y:46,w:755,h:409};
const minFontSize=8,maxFontSize=48;
const fontSize=(value,fallback)=>Number.isFinite(value)?G.clamp(value,minFontSize,maxFontSize):fallback;
const objectFontSize=o=>fontSize(o.fontSize,o.kind==='region'?18:20);
const X=x=>box.x+x*box.w/graph().xmax,Y=y=>box.y+box.h-y*box.h/graph().ymax;
const scaled=p=>({x:X(p.x),y:Y(p.y)});
const pathData=pts=>pts.map((p,i)=>(i?'L':'M')+X(p.x).toFixed(3)+' '+Y(p.y).toFixed(3)).join(' ');
const distance=(a,b)=>Math.hypot(X(a.x)-X(b.x),Y(a.y)-Y(b.y));
function save(){
  try{localStorage.setItem(key,JSON.stringify(state));$('saved').textContent='✓  Saved locally';}
  catch{$('saved').textContent='Use Export to save a backup';}
}
function remember(snapshot=JSON.stringify(state)){undo.push(snapshot);if(undo.length>80)undo.shift();redo.length=0;}
function commit(fn){
  const snapshot=JSON.stringify(state);remember(snapshot);
  try{fn();cache=null;render();}
  catch(error){
    // Never save a change the editor cannot draw. Restore the previous state.
    console.error(error);undo.pop();state=JSON.parse(snapshot);resetTools();cache=null;render();
    $('hint').textContent='That change could not be applied, so it was undone.';return;
  }
  save();
}
function resetTools(){selected=null;shadeGroup=null;start=null;hover=null;drag=null;tool='Select';}
function historyMove(from,to){if(!from.length)return;to.push(JSON.stringify(state));state=JSON.parse(from.pop());resetTools();cache=null;render();save();}
function getScene(){if(!cache){scene=M.resolve(graph());faces=M.regions(graph(),scene);cache=true;}}
function labelPosition(o){
  if(o.labelAt)return o.labelAt;
  if(o.kind==='region'){
    const f=o.pieces.map(p=>M.findFace(p,faces)).filter(Boolean).sort((a,b)=>b.area-a.area)[0];
    return f?(G.inside(f.center,f.poly)?f.center:o.pieces[0].seed):null;
  }
  if(['label','point'].includes(o.kind))return o.pts[0];
  const pts=scene.paths.get(o.id);
  if(!pts)return null;
  const visible=pts.filter(p=>p.x>=0&&p.x<=graph().xmax&&p.y>=0&&p.y<=graph().ymax);
  if(visible.length && visible.length!==1)return visible.at(-1);
  const intersections=G.frame(graph().xmax,graph().ymax).flatMap(f=>G.crossings(pts,f.points));
  return [...visible,...intersections].sort((a,b)=>b.x-a.x)[0];
}
function tickStep(max,target){const guess=max/target,pow=10**Math.floor(Math.log10(guess));return ([1,2,5,10].find(i=>i*pow>=guess)||10)*pow;}
function renderPlot(){
  getScene();const g=graph();plot.replaceChildren();
  const defs=svg('defs',{}),clip=svg('clipPath',{id:'bounds'},defs);
  svg('rect',{x:box.x-.1,y:box.y-.1,width:box.w+.2,height:box.h+.2},clip);
  svg('rect',{width:900,height:535,fill:'white'});
  const grid=svg('g',{}),fills=svg('g',{'clip-path':'url(#bounds)'}),strokes=svg('g',{'clip-path':'url(#bounds)'}),labels=svg('g',{});
  for(const isX of [true,false]){
    const max=isX?g.xmax:g.ymax,step=tickStep(max,isX?10:8);
    for(let n=0;n<=max+step/1e4;n+=step){
      const x=isX?X(n):box.x,y=isX?Y(0):Y(n);
      if(g.grid)svg('line',{x1:x,y1:y,x2:isX?x:X(g.xmax),y2:isX?box.y:y,stroke:'#dbe5e6'},grid);
      svg('line',{x1:x,y1:y,x2:isX?x:x-5,y2:isX?y+5:y,stroke:M.ink},grid);
      if(isX||n)txt(grid,num(n),isX?x:x-10,isX?y+23:y+5,{'text-anchor':isX?'middle':'end','font-family':'Segoe UI, sans-serif','font-size':14});
    }
  }
  for(const o of scene.resolved.values()){
    if(o.kind==='region')for(const piece of o.pieces){
      const f=M.findFace(piece,faces);
      if(f)svg('path',{d:pathData(f.poly)+'Z',fill:color(o),'fill-opacity':.19,'data-id':o.id},fills);
    }
    if(scene.paths.has(o.id)){
      svg('path',{d:pathData(scene.paths.get(o.id)),fill:'none',stroke:color(o),'stroke-width':o.kind==='guide'?1.6:3,'stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':o.kind==='guide'?'7 6':'none'},strokes);
    }
  }
  const axis=svg('g',{'data-axes':'1'},labels);
  svg('path',{d:'M76 35V455H846',fill:'none',stroke:M.ink,'stroke-width':1.8},axis);
  svg('path',{d:'m76 32-4 9h8z M848 455l-9-4v8z',fill:M.ink},axis);
  const ySize=fontSize(g.yFontSize,19);
  txt(axis,g.ylabel,box.x-4,Math.max(24,ySize),{'font-style':'italic','font-size':ySize});
  txt(axis,g.xlabel,850,509,{'text-anchor':'end','font-style':'italic','font-size':fontSize(g.xFontSize,19)});
  for(const o of scene.resolved.values()){
    if(o.kind==='point'){const p=scaled(o.pts[0]);svg('circle',{cx:p.x,cy:p.y,r:5.6,fill:color(o),stroke:'white','stroke-width':2,'data-id':o.id},labels);}
    if(o.kind==='guide'&&!o.showLabel)continue;
    const p=labelPosition(o);if(!p)continue;
    const isCurve=['line','u','free','guide'].includes(o.kind);
    const offset=o.labelAt||o.kind==='label'||o.kind==='region'?{x:0,y:0}:isCurve?{x:8,y:p.y<g.ymax*.03?-9:4}:{x:10,y:-10};
    const size=objectFontSize(o);
    const x=G.clamp(X(p.x)+offset.x,10,887),y=G.clamp(Y(p.y)+offset.y,Math.max(18,size*.9),498);
    const caption=txt(labels,o.caption??o.name,x,y,{'font-size':size,'font-style':'italic','font-weight':isCurve?600:400,
      'text-anchor':o.kind==='region'?'middle':x>795&&(o.caption??o.name).length>4?'end':'start',
      fill:o.kind==='region'?M.ink:color(o),'data-id':o.id,'data-label':'1','pointer-events':'bounding-box','paint-order':'stroke',stroke:'white','stroke-width':o.kind==='region'?0:3});
    if(o.fontSize){
      const bounds=caption.getBBox();
      if(bounds.x<4)caption.setAttribute('x',x+4-bounds.x);
      else if(bounds.x+bounds.width>896)caption.setAttribute('x',x-Math.min(bounds.x-4,bounds.x+bounds.width-896));
    }
  }
  svg('g',{class:'editor-only','pointer-events':'none',id:'overlay'});
  renderHandles();
  renderPreview();
}
function renderHandles(){
  const overlay=$('overlay');overlay.replaceChildren();
  const obj=scene.resolved.get(selected);
  if(tool==='Select'&&obj&&obj.kind!=='free')obj.pts.forEach(p=>svg('circle',{cx:X(p.x),cy:Y(p.y),r:5,fill:'white',stroke:M.teal,'stroke-width':2},overlay));
}
function renderPreview(){
  $('preview')?.remove();
  const el=svg('g',{id:'preview',class:'editor-only','pointer-events':'none'});
  if(tool==='Shade'&&hover){
    const f=faceAt(hover);if(f)svg('path',{d:pathData(f.poly)+'Z',fill:'#397a9c','fill-opacity':.16,stroke:'#598d98','stroke-width':1.3},el);
  }
  if(start&&hover)svg('path',{d:pathData([start,hover]),stroke:M.teal,'stroke-dasharray':'5 4',fill:'none'},el);
  if(drag?.type==='free')svg('path',{d:pathData(drag.pts),stroke:M.teal,'stroke-width':3,fill:'none'},el);
  if(hover&&snapText){
    const x=X(hover.x),y=Y(hover.y);
    svg('circle',{cx:x,cy:y,r:6.5,fill:'white',stroke:'#008979','stroke-width':2.4},el);
    txt(el,snapText,G.clamp(x+11,25,720),Math.max(18,y-12),{'font-family':'Segoe UI,sans-serif','font-size':13,fill:M.teal,'paint-order':'stroke',stroke:'white','stroke-width':4});
  }
}
const hints={Select:'Select an object to edit it (Enter). Drag it or use the arrow keys to move it.',Draw:'Click two endpoints, or enter exact coordinates.',Point:'Click to mark a point, or enter coordinates. Hold Alt to pause snapping.',Guide:'Click a starting point, then the end of your guide, or enter coordinates.',Shade:'Click inside a bounded area to shade it.',Label:'Click a curve or area to name it, or click empty space to add text.'};
const faceAt=p=>faces.filter(f=>G.inside(p,f.poly)).sort((a,b)=>a.area-b.area)[0];
function setTool(name,keepObjectRows=false){tool=name;start=null;hover=null;drag=null;snapText='';shadeGroup=null;render(keepObjectRows);}
function objectActions(o){
  const actions=[['Edit',()=>editObject(o)]];
  if(o.kind!=='label'&&(o.kind!=='guide'||o.showLabel))actions.push(['Move label',()=>setTool('Move label')]);
  if(['line','u','free','guide'].includes(o.kind))actions.push(['Copy & shift',()=>shiftDialog(o)]);
  if(equilibriumPartners(o).length)actions.push(['Mark equilibrium',()=>equilibriumDialog(o)]);
  if(o.kind==='region')actions.push(['Add area',()=>{setTool('Shade');shadeGroup=o.id;$('hint').textContent='Click another area to include in '+o.name+'.';}]);
  if(o.pts.some(p=>p.ref))actions.push(['Detach',()=>commit(()=>{o.pts=scene.resolved.get(o.id).pts.map(({x,y})=>({x,y}));})]);
  actions.push(['Delete',deleteSelected]);
  return actions;
}
// Curves that cross o inside the plot and have no point marked there yet.
function equilibriumPartners(o){
  const curves=['line','u','free'];
  if(!curves.includes(o.kind))return [];
  getScene();const g=graph(),mine=scene.paths.get(o.id);
  if(!mine)return [];
  const inside=q=>q.x>=0&&q.y>=0&&q.x<=g.xmax&&q.y<=g.ymax;
  const marked=k=>g.objects.some(pt=>pt.kind==='point'&&[pt.pts[0].ref?.a,pt.pts[0].ref?.b].sort().join()===[o.id,k.id].sort().join());
  return g.objects.filter(k=>k.id!==o.id&&curves.includes(k.kind)&&G.crossings(mine,scene.paths.get(k.id)||[]).some(inside)&&!marked(k));
}
function equilibriumName(){
  const names=new Set(graph().objects.map(o=>o.name));
  if(!names.has('E'))return 'E';
  let i=1;while(names.has('E_{'+i+'}'))i++;return 'E_{'+i+'}';
}
function equilibriumHint(point){
  const p=scene.resolved.get(point.id)?.pts[0]??point.pts[0];
  $('hint').textContent=point.name.replace(/_\{([^{}]+)\}/g,'$1')+' is at Q = '+num(p.x)+', P = '+num(p.y)+'.';
}
function markEquilibrium(a,b){
  let point=null;
  commit(()=>{
    const added=M.equilibrium(graph(),a.id,b.id,equilibriumName());
    if(!added)return;
    graph().objects.push(...added);point=added[2];selected=point.id;
  });
  if(point)equilibriumHint(point);
}
function equilibriumDialog(o){
  const partners=equilibriumPartners(o);
  if(partners.length===1)return markEquilibrium(o,partners[0]);
  modal('Mark equilibrium');
  const label=document.createElement('label'),choice=document.createElement('select');
  label.textContent='Where '+o.name+' crosses';
  partners.forEach((k,i)=>choice.add(new Option(k.name,i)));
  label.append(choice);fields.append(label);
  submit('Mark equilibrium',()=>{markEquilibrium(o,partners[choice.value]);});
}
const objectMenu=$('object-menu');
function openObjectMenu(event,id){
  const axes=event.target.closest('[data-axes]');
  if((!id&&!axes)||drag||dialog.open)return;
  event.preventDefault();
  const rect=event.currentTarget.getBoundingClientRect();
  const x=event.clientX||rect.left,y=event.clientY||rect.top;
  selected=id??null;setTool('Select');
  showMenu('Object actions',id?objectActions(selectedObj()):[['Axes & scale',settings]],()=>({x,y}));
}
// One popover serves the right-click menu and the Export and ••• buttons.
let menuOwner=null,menuClosed={owner:null,at:0};
function showMenu(label,actions,place,owner=null){
  if(objectMenu.matches(':popover-open'))objectMenu.hidePopover();
  objectMenu.setAttribute('aria-label',label);
  objectMenu.replaceChildren(...actions.map(([name,act])=>{
    const item=btn(name,()=>{objectMenu.hidePopover();act();});
    item.setAttribute('role','menuitem');return item;
  }));
  menuOwner=owner;owner?.setAttribute('aria-expanded','true');
  objectMenu.showPopover();
  const {x,y}=place(objectMenu.offsetWidth);
  objectMenu.style.left=G.clamp(x,6,innerWidth-objectMenu.offsetWidth-6)+'px';
  objectMenu.style.top=G.clamp(y,6,innerHeight-objectMenu.offsetHeight-6)+'px';
  objectMenu.firstElementChild.focus({preventScroll:true});
}
function buttonMenu(button,label,actions){
  // A click on the open menu's own button closes it (light dismiss) instead of reopening it.
  if(menuClosed.owner===button&&performance.now()-menuClosed.at<400)return;
  showMenu(label,actions,width=>{const r=button.getBoundingClientRect();return {x:r.right-width,y:r.bottom+4};},button);
}
objectMenu.addEventListener('beforetoggle',event=>{
  if(event.newState!=='closed'||!menuOwner)return;
  const owner=menuOwner;menuOwner=null;owner.setAttribute('aria-expanded','false');
  menuClosed={owner,at:performance.now()};
  if(!document.activeElement||document.activeElement===document.body||objectMenu.contains(document.activeElement))owner.focus({preventScroll:true});
});
objectMenu.onkeydown=event=>{
  const items=[...objectMenu.children],index=items.indexOf(document.activeElement);
  const next={ArrowDown:(index+1)%items.length,ArrowUp:(index+items.length-1)%items.length,Home:0,End:items.length-1}[event.key];
  if(next!==undefined){event.preventDefault();items[next].focus();}
  event.stopPropagation();
};
function renderSelection(){
  for(const row of $('objects').querySelectorAll('button'))row.classList.toggle('active',row.dataset.id===selected);
  const o=selectedObj();
  $('inspector').replaceChildren(...(o?objectActions(o).map(([name,act])=>btn(name,act)):[]));
}
function render(keepObjectRows=false){
  if(objectMenu.matches(':popover-open'))objectMenu.hidePopover();
  // The tool bars are rebuilt below; keep keyboard focus on the same button.
  const focused=document.activeElement,bar=focused?.closest?.('#toolbar,#options,#graphs');
  const refocus=bar?{bar:bar.id,label:focused.textContent}:null;
  const g=graph();document.title=g.name+' · Kvasir Graph';$('title').textContent=g.name;
  $('graphs').replaceChildren(...state.graphs.map(item=>{
    const b=btn('',()=>{resetTools();state.active=item.id;cache=null;render();save();},'graph'+(item===g?' active':''));b.innerHTML=icon('Graph');b.append(item.name);return b;
  }));
  if(!keepObjectRows)$('objects').replaceChildren(...g.objects.map(o=>{
    const b=btn('',()=>{selected=o.id;setTool('Select',true);},'object');
    b.dataset.id=o.id;
    b.oncontextmenu=e=>openObjectMenu(e,o.id);
    b.ondblclick=()=>editObject(o);if(o.equation)b.title=o.equation;
    const sample=document.createElement('span'),name=document.createElement('span');
    sample.className='sample '+o.kind;sample.style.backgroundColor=color(o);
    renderLabel(name,o.name);b.append(sample,name);return b;
  }));
  if(!keepObjectRows&&!g.objects.length)$('objects').append(Object.assign(document.createElement('span'),{className:'empty',textContent:'Objects appear as you draw.'}));
  renderSelection();
  $('grid').checked=g.grid;$('snap').checked=g.snap;$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
  $('toolbar').replaceChildren(...Object.keys(hints).map(n=>{const b=btn('',()=>setTool(n),n===tool?'active':'');b.innerHTML=icon(n);b.append(n);b.setAttribute('aria-pressed',tool===n);return b;}));
  const opts=$('options');opts.replaceChildren();
  if(tool==='Draw'){
    for(const [k,v] of [['line','Straight line'],['u','U-shaped'],['free','Freehand']])opts.append(btn(v,()=>{drawMode=k;setTool('Draw');},k===drawMode?'active':''));
    if(drawMode==='line')opts.append(btn('Enter coordinates',()=>exactLine()));
  }
  if(tool==='Guide'){
    for(const [k,v] of [['auto','Auto'],['h','Horizontal'],['v','Vertical'],['free','Any angle']])opts.append(btn(v,()=>{guideMode=k;setTool('Guide');},guideMode===k?'active':''));
    opts.append(btn('Enter coordinates',exactGuides));
  }
  if(tool==='Label'){
    for(const [k,v] of [['object','Object label'],['text','Free text']])opts.append(btn(v,()=>{labelMode=k;setTool('Label');},labelMode===k?'active':''));
    if(labelMode==='text')opts.append(btn('Enter coordinates',exactLabel));
  }
  if(tool==='Point')opts.append(btn('Enter coordinates',exactPoint));
  $('hint').textContent=start?'Click the second endpoint. Esc cancels.':tool==='Draw'&&drawMode==='u'?'Click to place the minimum. Drag either arm to reshape.':tool==='Draw'&&drawMode==='free'?'Drag to sketch a smooth curve.':hints[tool];
  if(tool==='Move label')$('hint').textContent='Click where the label should appear. Esc cancels.';
  if(tool==='Guide'&&guideMode==='auto')$('hint').textContent=start?'Move near the P or Q axis, then click or release to place the guide.':'Click or drag from an intersection toward the P or Q axis, or enter coordinates.';
  plot.style.cursor=tool==='Move label'?'crosshair':'';
  if(refocus)[...$(refocus.bar).querySelectorAll('button')].find(b=>b.textContent===refocus.label)?.focus({preventScroll:true});
  renderPlot();
}
function graphPosition(x,y){return {x:(x-box.x)*graph().xmax/box.w,y:(box.y+box.h-y)*graph().ymax/box.h};}
function position(event,keepMargins=false){
  const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(plot.getScreenCTM().inverse());
  const pos=graphPosition(p.x,p.y);
  return keepMargins?pos:{x:G.clamp(pos.x,0,graph().xmax),y:G.clamp(pos.y,0,graph().ymax)};
}
const tolerance=()=>10/(plot.getScreenCTM()?.a||1);
function pathParameter(path,p){
  let best=Infinity,param=0;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],r=G.nearest(p,[a,b],box.w/graph().xmax,box.h/graph().ymax);
    if(r.distance<best){best=r.distance;param=(i-1+distance(a,r.point)/(distance(a,b)||1))/(path.length-1);}
  }
  return param;
}
function depends(id,target,visited=new Set()){
  if(id===target)return true;if(visited.has(id))return false;visited.add(id);
  return graph().objects.find(o=>o.id===id)?.pts.some(p=>p.ref&&[p.ref.a,p.ref.b].filter(Boolean).some(k=>depends(k,target,visited)))||false;
}
function axisProjection(from,pointer){
  if(distance(from,pointer)<3)return null;
  const priceGap=Math.abs(X(pointer.x)-X(0)),quantityGap=Math.abs(Y(pointer.y)-Y(0));
  const reach=1.6*tolerance();
  const nearPrice=from.x>0&&priceGap<=reach,nearQuantity=from.y>0&&quantityGap<=reach;
  if(!nearPrice&&!nearQuantity)return null;
  // At the origin both axes can be within reach. Use the projection whose
  // endpoint is closest to the pointer, measured on screen.
  const left={x:0,y:from.y},bottom={x:from.x,y:0};
  const horizontal=nearPrice&&(!nearQuantity||distance(left,pointer)<=distance(bottom,pointer));
  const point=horizontal?left:bottom,axis=horizontal?'@price':'@quantity';
  snapText=horizontal?'Horizontal to P axis':'Vertical to Q axis';
  return {...point,ref:{a:axis,t:pathParameter(scene.paths.get(axis),point)}};
}
function projectedOrientation(from,p){
  if(p.ref?.a==='@price'&&p.y===from.y)return 'h';
  if(p.ref?.a==='@quantity'&&p.x===from.x)return 'v';
  return 'auto';
}
function snap(raw,event,exclude=null){
  getScene();snapText='';const g=graph(),p={...raw};
  const constrained=start&&tool==='Guide'&&(guideMode==='h'||guideMode==='v');
  if(constrained){if(guideMode==='h')p.y=start.y;else p.x=start.x;}
  if(!g.snap||event.altKey)return p;
  if(start&&tool==='Guide'&&guideMode==='auto'){
    const projection=axisProjection(start,p);
    if(projection)return projection;
  }
  const paths=[...scene.paths].filter(([id])=>!exclude||!depends(id,exclude));
  let candidates=[];const threshold=tolerance();
  function add(pt,label,rank,ref){
    if(!pt||pt.x< -1e-7||pt.y< -1e-7||pt.x>g.xmax+1e-7||pt.y>g.ymax+1e-7)return;
    if(constrained&&Math.abs(guideMode==='h'?pt.y-p.y:pt.x-p.x)>1e-6)return;
    const gap=distance(p,pt);if(gap<=threshold)candidates.push({point:{x:pt.x,y:pt.y,...(ref?{ref}:{})},label,rank,gap});
  }
  const name=id=>scene.resolved.get(id)?.name||({'@price':'P axis','@quantity':'Q axis','@right':'Plot edge','@top':'Plot edge'}[id]);
  const close=paths.map(([id,pts])=>({id,pts,r:G.nearest(p,pts,box.w/g.xmax,box.h/g.ymax)})).filter(k=>k.r.distance<=threshold);
  for(let i=0;i<close.length;i++){
    const {id,pts,r}=close[i],ref=q=>({a:id,t:pathParameter(pts,q)});
    if(constrained){
      const track=guideMode==='h'?[{x:0,y:p.y},{x:g.xmax,y:p.y}]:[{x:p.x,y:0},{x:p.x,y:g.ymax}];
      G.crossings(track,pts).forEach(q=>add(q,name(id),1,ref(q)));
    }
    add(r.point,name(id),4,ref(r.point));
    for(let j=i+1;j<close.length;j++)for(const q of G.crossings(pts,close[j].pts))
      add(q,name(id)+' ∩ '+name(close[j].id),0,{a:id,b:close[j].id});
    for(const [j,q] of pts.entries()){
      const end=j===0||j===pts.length-1;
      const low=!end&&q.y<pts[j-1].y&&q.y<=pts[j+1].y,high=!end&&q.y>pts[j-1].y&&q.y>=pts[j+1].y;
      if(end||low||high)add(q,(low?'Minimum':high?'Maximum':'Endpoint')+' · '+name(id),1,{a:id,t:j/(pts.length-1)});
    }
  }
  for(const o of scene.resolved.values())if(o.kind==='point'&&o.id!==exclude&&(!exclude||!depends(o.id,exclude)))add(o.pts[0],o.name,1,graph().objects.find(k=>k.id===o.id).pts[0].ref);
  candidates.sort((a,b)=>a.rank-b.rank||a.gap-b.gap);
  if(candidates.length){snapText=candidates[0].label;return candidates[0].point;}
  return p;
}
function hit(event,p){
  const direct=event.target.closest('[data-id]')?.dataset.id;
  if(event.target.closest('[data-label]'))return direct;
  if(direct&&scene.resolved.get(direct)?.kind!=='region')return direct;
  let best=null,dist=tolerance();
  for(const o of scene.resolved.values()){
    const pts=scene.paths.get(o.id);
    const d=pts?G.nearest(p,pts,box.w/graph().xmax,box.h/graph().ymax).distance:o.kind==='point'?distance(o.pts[0],p):Infinity;
    if(d<dist){dist=d;best=o.id;}
  }
  return best||direct;
}
plot.oncontextmenu=event=>openObjectMenu(event,hit(event,position(event,true)));
plot.ondblclick=event=>{
  if(tool!=='Select'||event.button!==0)return;
  const o=selectedObj();
  if(o){event.preventDefault();editObject(o);}
  else if(event.target.closest('[data-axes]')){event.preventDefault();settings();}
};
// Each shaded area's pieces with the faces they cover right now.
function regionParts(){
  getScene();
  return graph().objects.filter(x=>x.kind==='region').map(r=>[r,r.pieces.map(p=>[p,M.findFace(p,faces)])]);
}
// After curves change, a piece whose face was split or reshaped by a new
// boundary covers every face that now sits inside the old one. A piece whose
// face kept its boundaries, or that does not resolve, is kept as it is.
function repiece(parts){
  if(!parts.length)return;
  const now=M.regions(graph(),M.resolve(graph())),fresh=now.map(f=>({face:f,seed:interior(f)}));
  for(const [region,pieceParts] of parts){
    const pieces=[],used=new Set();
    for(const [old,parent] of pieceParts){
      const same=parent&&M.findFace(old,now)?.signature===parent.signature;
      const children=parent&&!same?fresh.filter(c=>!used.has(c)&&G.inside(c.seed,parent.poly)):[];
      if(!children.length){pieces.push(old);continue;}
      for(const c of children){used.add(c);pieces.push(M.piece(c.face,c.seed));}
    }
    // Pieces that now cover the same face (a split healed by moving a curve away) merge.
    const covered=new Set();
    region.pieces=pieces.filter(piece=>{
      const face=M.findFace(piece,now);
      if(!face)return true;
      if(covered.has(face))return false;
      covered.add(face);return true;
    });
  }
}
function addShape(o){
  const parts=['line','guide','free','u'].includes(o.kind)?regionParts():[];
  commit(()=>{graph().objects.push(o);repiece(parts);resetTools();selected=o.id;});
}
function interior(f){
  if(G.inside(f.center,f.poly))return f.center;
  for(let i=0;i<f.poly.length;i++){
    const a=f.poly[i],b=f.poly[(i+1)%f.poly.length],p=G.lerp(a,b,.5);
    p.x-=(b.y-a.y)*1e-6;p.y+=(b.x-a.x)*1e-6;
    if(G.inside(p,f.poly))return p;
  }
  return f.center;
}
function nextName(base){let i=1;const names=new Set(graph().objects.map(o=>o.name));while(names.has(base+' '+i))i++;return base+' '+i;}
function newColor(){const colors=[M.teal,M.orange,'#556bb1','#9660a7'];return colors[graph().objects.filter(o=>['line','free','u'].includes(o.kind)).length%colors.length];}
function finishSegment(p){
  if(distance(start,p)<3)return;
  const guide=tool==='Guide';
  const o=M.shape(guide?'guide':'line',nextName(guide?'Guide':'Line'),[start,p],guide?M.ink:newColor());
  if(guide){
    o.orientation=guideMode==='auto'?projectedOrientation(start,p):guideMode;
    o.sourceEnd=!start.ref?.b&&p.ref?.b?1:0;
  }
  addShape(o);
}
plot.onpointerdown=event=>{
  if(event.button!==0||drag)return;
  getScene();
  if(tool==='Move label'){
    const obj=selectedObj();
    if(obj)commit(()=>{obj.labelAt=position(event,true);tool='Select';});
    return;
  }
  const raw=position(event,tool==='Select'),id=hit(event,raw),g=graph();
  if(tool==='Select'){
    const text=event.target.closest('text[data-label]'),active=scene.resolved.get(selected);
    const otherPoint=id!==selected&&event.target.closest('circle[data-id]');
    const idx=text||otherPoint||active?.kind==='free'?-1:active?.pts.findIndex(p=>distance(p,raw)<tolerance());
    if(idx>=0||id){
      selected=idx>=0?selected:id;const obj=scene.resolved.get(selected);
      const label=text&&obj.kind!=='label';
      const labelOrigin=label?graphPosition(Number(text.getAttribute('x')),Number(text.getAttribute('y'))):null;
      const type=idx>=0?'handle':label||obj.kind==='region'?'caption':'move';
      const parts=type!=='caption'&&obj.kind!=='region'?regionParts():[];
      drag={type,idx,labelOrigin,parts,raw:type==='caption'?raw:position(event),snapshot:JSON.stringify(state),base:clone(obj),original:clone(selectedObj()),moved:false};
      plot.setPointerCapture(event.pointerId);
    }else selected=null;
    renderSelection();renderHandles();return;
  }
  const p=snap(raw,event);
  if(tool==='Shade'){
    const face=faceAt(raw);if(!face)return;
    const item=M.piece(face,raw);
    if(shadeGroup){const r=g.objects.find(o=>o.id===shadeGroup);if(!r.pieces.some(pi=>M.findFace(pi,faces)===face))commit(()=>r.pieces.push(item));return;}
    areaDialog(item);return;
  }
  if(tool==='Label'){
    if(id&&labelMode==='object'){editObject(g.objects.find(o=>o.id===id));return;}
    objectForm('Place label','Label',M.ink,(name,color,fontSize)=>addShape({...M.shape('label',name,[p],color),fontSize}));return;
  }
  if(tool==='Point'){
    objectForm('Mark point','E',M.ink,(name,color,fontSize)=>addShape({...M.shape('point',name,[p],color),fontSize}));
    notice('Q = '+num(p.x)+'     P = '+num(p.y)+(snapText?'   ·   '+snapText:''));return;
  }
  if(tool==='Draw'&&drawMode==='free'){
    drag={type:'free',pts:[p]};plot.setPointerCapture(event.pointerId);return;
  }
  if(tool==='Draw'&&drawMode==='u'){
    const w=g.xmax*.16,h=g.ymax*.31;
    addShape(M.shape('u',nextName('Cost curve'),[{x:p.x-w,y:p.y+h},p,{x:p.x+w,y:p.y+h}],newColor()));return;
  }
  if(!start){
    start=p;hover=p;
    if(tool==='Guide'){
      drag={type:'guide',clientX:event.clientX,clientY:event.clientY};
      plot.setPointerCapture(event.pointerId);
    }
    render();return;
  }
  finishSegment(p);
};
plot.onpointermove=event=>{
  const raw=position(event,drag?.type==='caption');$('coords').textContent='Q '+num(raw.x)+'   ·   P '+num(raw.y);
  if(drag?.type==='free'){
    if(distance(raw,drag.pts.at(-1))>5&&drag.pts.length<320)drag.pts.push(raw);
    renderPreview();return;
  }
  if(drag&&drag.type!=='guide'){
    if(!drag.moved&&distance(raw,drag.raw)<2)return;drag.moved=true;
    const o=selectedObj(),dx=raw.x-drag.raw.x,dy=raw.y-drag.raw.y,base=drag.base;
    if(drag.type==='caption'||o.kind==='region'){
      const initial=drag.labelOrigin||base.labelAt||labelPosition(base)||drag.raw;
      o.labelAt={x:initial.x+dx,y:initial.y+dy};
    }else if(drag.type==='handle'||['point','label'].includes(o.kind)){
      const i=drag.idx>=0?drag.idx:0;delete o.equation;
      const autoGuide=o.kind==='guide'&&(drag.original.orientation??'auto')==='auto';
      const from=autoGuide?base.pts[1-i]:null;
      const projection=autoGuide&&graph().snap&&!event.altKey?axisProjection(from,raw):null;
      const p=projection||snap(raw,event,o.id);hover=p;
      if(autoGuide){
        o.orientation=projectedOrientation(from,p);
        o.sourceEnd=projection?1-i:drag.original.sourceEnd;
      }
      if(o.kind==='u'){
        if(i===1)o.pts=base.pts.map((q,j)=>j===1?p:{x:q.x+p.x-base.pts[1].x,y:q.y+p.y-base.pts[1].y});
        else {o.pts=base.pts.map(({x,y})=>({x,y}));o.pts[1].ref=drag.original.pts[1].ref;
          o.pts[i]={x:i===0?Math.min(p.x,base.pts[1].x-.001):Math.max(p.x,base.pts[1].x+.001),y:Math.max(p.y,base.pts[1].y)};}
      }else o.pts[i]=p;
    }else{
      // A hand-moved curve no longer matches its equation.
      delete o.equation;o.pts=base.pts.map(p=>({x:p.x+dx,y:p.y+dy}));
      if(base.labelAt)o.labelAt={x:base.labelAt.x+dx,y:base.labelAt.y+dy};
    }
    cache=null;scheduleRender();return;
  }
  const showSnap=!['Select','Shade','Move label'].includes(tool);
  hover=showSnap?snap(raw,event):raw;
  if(!showSnap)snapText='';
  if(snapText)$('coords').textContent='Q '+num(hover.x)+'   ·   P '+num(hover.y);
  renderPreview();
};
plot.onpointerup=event=>{
  if(!drag)return;const end=drag;drag=null;hover=null;snapText='';
  if(end.type==='guide'){
    if(Math.hypot(event.clientX-end.clientX,event.clientY-end.clientY)>5)finishSegment(snap(position(event),event));
    renderPreview();
  }else if(end.type==='free'){
    if(end.pts.length>=2){
      const last=snap(position(event),event),smooth=G.freehand(end.pts);smooth[0]=end.pts[0];smooth[smooth.length-1]=last;
      // Keep the stroke within 0.4 px of the smoothed curve with far fewer points.
      const pts=G.simplify(smooth,.4,box.w/graph().xmax,box.h/graph().ymax);
      addShape(M.shape('free',nextName('Curve'),pts,newColor()));
    }else render();
  }else if(end.moved){cancelScheduledRender();repiece(end.parts);remember(end.snapshot);cache=null;render();save();}
};
// Draw at most once per frame while dragging; pointer events can arrive faster.
let frameRequest=0;
function scheduleRender(){if(!frameRequest)frameRequest=requestAnimationFrame(()=>{frameRequest=0;renderPlot();});}
function cancelScheduledRender(){if(frameRequest){cancelAnimationFrame(frameRequest);frameRequest=0;}}
plot.onpointercancel=()=>{cancelScheduledRender();if(drag?.snapshot){state=JSON.parse(drag.snapshot);cache=null;}if(drag?.type==='guide')start=null;drag=null;hover=null;render();};
plot.onpointerleave=()=>{if(!drag){hover=null;snapText='';renderPreview();}};

const dialog=$('dialog'),form=$('form'),fields=$('fields');
function modal(title){
  if(dialog.open)dialog.close();$('dialog-title').textContent=title;fields.replaceChildren();$('form-actions').replaceChildren();
  form.onsubmit=e=>e.preventDefault();dialog.showModal();
}
function field(label,value,type='text',parent=fields){
  const el=document.createElement('label'),input=document.createElement('input');
  el.textContent=label;input.type=type;input.value=value;input.required=true;
  if(type==='number')input.step='any';if(type==='text')input.maxLength=120;
  el.append(input);parent.append(el);return input;
}
function labelField(label,value,initialSize=20){
  const input=field(label,value),row=document.createElement('div');
  row.className='label-field';
  const wrapper=input.parentElement;
  wrapper.before(row);row.append(wrapper);
  const size=field('Size (px)',initialSize,'number',row);
  size.min=minFontSize;size.max=maxFontSize;size.step='1';
  size.setAttribute('aria-label',label+' font size (px)');
  const preview=document.createElement('output');
  preview.className='label-preview';
  preview.setAttribute('aria-label','Label preview');preview.setAttribute('aria-live','polite');
  function refresh(){
    renderLabel(preview,input.value);
    preview.hidden=!input.value;
    preview.style.fontSize=fontSize(size.valueAsNumber,initialSize)+'px';
  }
  function insertSubscript(){
    let start=input.selectionStart,end=input.selectionEnd;
    // The dialog initially selects the default label for quick replacement.
    if(start===0 && end===input.value.length && input.value===value)start=end;
    const selected=input.value.slice(start,end);
    const suffix=selected||'1';
    const enclosing=[...input.value.matchAll(/_\{([^{}]+)\}/g)].find(
      m=>start>=m.index+2 && end<=m.index+m[0].length-1);
    input.focus();
    if(enclosing){
      input.setSelectionRange(enclosing.index+2,enclosing.index+enclosing[0].length-1);
      return;
    }
    input.setRangeText('_{'+suffix+'}',start,end,'end');
    input.setSelectionRange(start+2,start+2+suffix.length);
    refresh();
  }
  const button=btn('x₂ Subscript',insertSubscript,'subscript-button');
  button.title='Format selected text, or insert a 1 you can type over';
  row.append(button);row.after(preview);row.addEventListener('input',refresh);refresh();
  return {get value(){return input.value;},get fontSize(){return size.valueAsNumber;}};
}
function submit(label,fn){
  const b=btn(label,()=>{},'primary');b.type='submit';$('form-actions').append(b);
  form.onsubmit=e=>{e.preventDefault();if(form.reportValidity()&&fn()!==false)dialog.close();};
  const first=fields.querySelector('input');if(first){first.focus();if(first.type==='text')first.select();}
}
function objectForm(title,defaultName,defaultColor,fn,initialSize=20){
  modal(title);const n=labelField('Label',defaultName,initialSize),c=field('Color',defaultColor,'color');
  submit('Apply',()=>fn(n.value.trim()||defaultName,c.value,n.fontSize));
}
function pointFields(label,p){
  const pair=document.createElement('div');pair.className='pair';fields.append(pair);
  const x=field(label+' · Q',num(p.x),'number',pair),y=field(label+' · P',num(p.y),'number',pair);
  return ()=>({x:x.valueAsNumber,y:y.valueAsNumber});
}
function exactLine(){
  modal('Draw a straight line');const name=labelField('Curve label',nextName('Line'));
  const a=pointFields('First point',{x:0,y:0}),b=pointFields('Second point',{x:graph().xmax,y:graph().ymax});
  const c=field('Color',newColor(),'color');
  submit('Add line',()=>{if(distance(a(),b())<.001){notice('Choose two different endpoints.');return false;}addShape({...M.shape('line',name.value,[a(),b()],c.value),fontSize:name.fontSize});});
}
function exactPoint(){
  modal('Mark a point');const name=labelField('Label','E');
  const at=pointFields('Position',{x:graph().xmax/2,y:graph().ymax/2}),c=field('Color',M.ink,'color');
  submit('Add point',()=>{addShape({...M.shape('point',name.value.trim()||'E',[at()],c.value),fontSize:name.fontSize});});
}
function exactLabel(){
  modal('Place text');const name=labelField('Text','Label');
  const at=pointFields('Position',{x:graph().xmax/2,y:graph().ymax/2}),c=field('Color',M.ink,'color');
  submit('Add text',()=>{addShape({...M.shape('label',name.value.trim()||'Label',[at()],c.value),fontSize:name.fontSize});});
}
function exactGuides(){
  modal('Add guides to the axes');
  const points=graph().objects.filter(o=>o.kind==='point');
  const label=document.createElement('label'),from=document.createElement('select');
  label.textContent='From';
  points.forEach((o,i)=>from.add(new Option(o.name.replace(/_\{([^{}]+)\}/g,'$1'),i)));
  from.add(new Option('Coordinates','coords'));
  label.append(from);fields.append(label);
  const coords=document.createElement('div');fields.append(coords);
  const pair=document.createElement('div');pair.className='pair';coords.append(pair);
  const x=field('Q',num(graph().xmax/2),'number',pair),y=field('P',num(graph().ymax/2),'number',pair);
  const h=field('Horizontal guide to the P axis','','checkbox'),v=field('Vertical guide to the Q axis','','checkbox');
  h.required=v.required=false;h.checked=v.checked=true;
  const sync=()=>{coords.hidden=from.value!=='coords';x.disabled=y.disabled=coords.hidden;};
  from.onchange=sync;sync();
  submit('Add guides',()=>{
    if(!h.checked&&!v.checked){notice('Choose at least one guide.');return false;}
    const point=from.value==='coords'?null:points[from.value];
    // From a marked point, start where it is drawn now and keep its anchor.
    const e=point?{...scene.resolved.get(point.id).pts[0],...(point.pts[0].ref?{ref:point.pts[0].ref}:{})}:{x:x.valueAsNumber,y:y.valueAsNumber};
    const suffix=point&&point.name!=='E'?' '+point.name:'';
    const added=M.guides(graph(),e,suffix,{h:h.checked,v:v.checked});
    const parts=regionParts();
    commit(()=>{graph().objects.push(...added);repiece(parts);resetTools();selected=added.at(-1).id;});
  });
}
function editObject(o){
  modal('Edit '+(o.kind==='region'?'area':o.kind==='u'?'U-shaped curve':o.kind==='free'?'curve':o.kind));
  const size=objectFontSize(o);
  const n=o.caption===undefined?labelField('Name',o.name,size):field('Name',o.name);
  const label=o.caption!==undefined?labelField('Label on graph',o.caption,size):null,c=field('Color',color(o),'color');
  let equation=null,expand=null;
  if(o.kind==='line'){
    equation=field('Equation (optional)',o.equation??'');equation.required=false;equation.placeholder='P = 68 − Q/2';
    equation.title='Enter a straight-line equation in Q and P to redraw this curve exactly.';
    expand=field('Expand the axes if a new equation runs off the graph','','checkbox');expand.required=false;expand.checked=true;
  }
  let show=null;if(o.kind==='guide'){show=field('Show label on graph','','checkbox');show.required=false;show.checked=!!o.showLabel;}
  const base=scene.resolved.get(o.id).pts,points=base.length<=3?base.map((p,i)=>pointFields(o.kind==='u'?['Left arm','Minimum','Right arm'][i]:base.length===1?'Position':'Endpoint '+(i+1),p)):[];
  submit('Apply',()=>{
    const updated=points.map(fn=>fn());
    if(o.kind==='u'&&!(updated[0].x<updated[1].x&&updated[1].x<updated[2].x&&updated[1].y<=Math.min(updated[0].y,updated[2].y))){notice('Keep the minimum between and below both arms.');return false;}
    if(['line','guide'].includes(o.kind)&&distance(updated[0],updated[1])<.001){notice('Choose two different endpoints.');return false;}
    // A new equation redraws the line; otherwise edited endpoints win and the equation is dropped.
    const text=equation?.value.trim()??'',fromEquation=text&&text!==(o.equation??'');
    const g=graph();let fitted=null,axes={xmax:g.xmax,ymax:g.ymax};
    if(fromEquation){
      try{
        if(expand.checked){
          // Fit the new line's intercepts, and its crossing when one other equation line exists.
          const others=g.objects.filter(k=>k!==o&&k.kind==='line'&&k.equation).map(k=>k.equation);
          axes=MarketEquations.grow(others.length===1?[text,...others]:[text],g.xmax,g.ymax);
        }
        fitted=MarketEquations.curve(text,axes.xmax,axes.ymax);
      }catch(error){notice(error.message);return false;}
    }
    const grown=axes.xmax!==g.xmax||axes.ymax!==g.ymax;
    commit(()=>{
      if(grown){g.xmax=axes.xmax;g.ymax=axes.ymax;refitEquations(g);}o.name=n.value;o.color=c.value;o.fontSize=(label??n).fontSize;if(label)o.caption=label.value;if(show)o.showLabel=show.checked;
      if(fitted){o.pts=fitted;o.equation=text;return;}
      let moved=false;
      updated.forEach((p,i)=>{if(num(base[i].x)!==num(p.x)||num(base[i].y)!==num(p.y)){o.pts[i]=p;moved=true;}});
      if(moved||!text)delete o.equation;});
    if(grown)$('hint').textContent='Axes expanded to Quantity 0–'+num(axes.xmax)+' and Price 0–'+num(axes.ymax)+' to fit '+o.name+'.';
  });
}
function shiftDialog(o){
  modal('Copy and shift');const n=labelField('New curve label',o.name+'′',objectFontSize(o)),dx=field('Quantity shift (ΔQ)',0,'number'),dy=field('Price shift (ΔP)',5,'number');
  submit('Add shifted copy',()=>{
    const copy=clone(o);copy.id=M.id();copy.name=n.value;copy.fontSize=n.fontSize;delete copy.caption;delete copy.labelAt;delete copy.equation;
    copy.pts=scene.resolved.get(o.id).pts.map(p=>({x:p.x+dx.valueAsNumber,y:p.y+dy.valueAsNumber}));copy.color=newColor();addShape(copy);
  });
}
function areaDialog(piece){
  objectForm('Shade area','CS',M.teal,(name,c,fontSize)=>addShape({...M.shape('region',name,[],c),fontSize,pieces:[piece]}),18);
}
function notice(msg){let e=$('notice');if(!e){e=document.createElement('p');e.id='notice';fields.append(e);}e.textContent=msg;}
function deleteSelected(){
  const o=selectedObj();if(!o)return;
  commit(()=>{
    for(const other of graph().objects)other.pts.forEach((p,i)=>{if(p.ref?.a===o.id||p.ref?.b===o.id){const {x,y}=scene.resolved.get(other.id).pts[i];other.pts[i]={x,y};}});
    graph().objects=graph().objects.filter(item=>item!==o);
    if(scene.paths.has(o.id)){
      for(const r of graph().objects.filter(k=>k.kind==='region'))r.pieces=r.pieces.filter(p=>!p.signature.split('|').includes(o.id));
      graph().objects=graph().objects.filter(k=>k.kind!=='region'||k.pieces.length);
    }
    selected=null;if(tool==='Move label')tool='Select';
  });
}
function newGraph(){
  modal('New graph');
  const title=field('Graph title','Untitled graph');
  const modeLabel=document.createElement('label'),mode=document.createElement('select');
  modeLabel.textContent='Start with';
  mode.setAttribute('aria-label','Start with');
  mode.add(new Option('Blank graph','blank'));
  mode.add(new Option('Supply and demand equations','equations'));
  modeLabel.append(mode);fields.append(modeLabel);

  const manual=document.createElement('div'),equations=document.createElement('div');
  fields.append(manual,equations);
  const x=field('Maximum quantity',150,'number',manual),y=field('Maximum price',80,'number',manual);
  x.min=y.min='.00001';manual.className='pair';
  const demand=field('Demand equation','','text',equations),supply=field('Supply equation','','text',equations);
  demand.placeholder='Qd = 136 − 2P';supply.placeholder='Qs = 3P − 69';
  supply.required=demand.required=false;
  const help=document.createElement('p'),preview=document.createElement('output');
  help.textContent='Enter one or both linear equations in Q or P. The axes scale automatically.';
  const markE=field('Mark equilibrium (E with dashed guides)','','checkbox',equations);markE.required=false;markE.checked=true;
  equations.prepend(help);equations.append(preview);preview.className='range-preview';
  preview.setAttribute('aria-live','polite');
  const fit=()=>MarketEquations.fit([{name:'Demand',text:demand.value},{name:'Supply',text:supply.value}]);
  function updatePreview(showErrors){
    preview.textContent='';
    if(!supply.value.trim()&&!demand.value.trim()&&!showErrors)return;
    try{
      const result=fit();
      preview.textContent='Quantity 0–'+result.xmax+'   ·   Price 0–'+result.ymax;
      return result;
    }catch(error){if(showErrors)preview.textContent=error.message;}
  }
  function switchMode(){
    const automatic=mode.value==='equations';
    manual.hidden=automatic;equations.hidden=!automatic;
    x.disabled=y.disabled=automatic;demand.disabled=supply.disabled=!automatic;
    if(automatic)updatePreview(false);
  }
  mode.onchange=switchMode;
  equations.oninput=()=>updatePreview(false);
  equations.onfocusout=()=>updatePreview(true);
  switchMode();
  submit('Create graph',()=>{
    const automatic=mode.value==='equations',result=automatic?updatePreview(true):null;
    if(automatic&&!result)return false;
    const g=M.blank(title.value,result?.xmax??x.valueAsNumber,result?.ymax??y.valueAsNumber);
    const lines=(result?.curves??[]).map(curve=>{
      const o=M.shape('line',curve.name,curve.pts,curve.name==='Demand'?M.teal:M.orange);
      o.caption=curve.name[0];o.equation=curve.text;g.objects.push(o);return o;
    });
    const added=automatic&&markE.checked&&lines.length===2?M.equilibrium(g,lines[0].id,lines[1].id):null;
    if(added)g.objects.push(...added);
    commit(()=>{state.graphs.push(g);state.active=g.id;resetTools();});
    if(added)equilibriumHint(added[2]);
  });
}
// Lines entered as equations are redrawn to span the current axes.
function refitEquations(g){
  for(const o of g.objects)if(o.kind==='line'&&o.equation){try{o.pts=MarketEquations.curve(o.equation,g.xmax,g.ymax);}catch{}}
}
function settings(){
  const g=graph();modal('Axes and scale');
  const x=labelField('Horizontal axis label',g.xlabel,fontSize(g.xFontSize,19)),y=labelField('Vertical axis label',g.ylabel,fontSize(g.yFontSize,19));
  const xm=field('Maximum quantity',g.xmax,'number'),ym=field('Maximum price',g.ymax,'number');
  xm.min=ym.min='.00001';submit('Apply',()=>commit(()=>{g.xlabel=x.value;g.ylabel=y.value;g.xFontSize=x.fontSize;g.yFontSize=y.fontSize;g.xmax=xm.valueAsNumber;g.ymax=ym.valueAsNumber;
    refitEquations(g);}));
}
function graphMenu(){
  const backup=unreadableBackup();
  buttonMenu($('graph-menu'),'Graph actions',[
  ['Rename graph',()=>{modal('Rename graph');const n=field('Graph title',graph().name);submit('Rename',()=>commit(()=>graph().name=n.value));}],
  ['Duplicate graph',()=>commit(()=>{const g=clone(graph());g.id=M.id();g.name+=' (copy)';state.graphs.push(g);state.active=g.id;resetTools();})],
  ['Open workspace backup',()=>$('import').click()],
  ['Delete graph',()=>{modal('Delete graph?');notice('Remove “'+graph().name+'” from this workspace. You can undo this change.');submit('Delete graph',()=>commit(()=>{state.graphs=state.graphs.filter(g=>g.id!==state.active);if(!state.graphs.length)state.graphs.push(M.blank());state.active=state.graphs[0].id;resetTools();}));}],
  ...(backup?[['Download unopened saved data',()=>download(new Blob([backup],{type:'application/json'}),' (unopened data).json')]]:[])
]);}
function download(blob,suffix){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
  a.download=(graph().name.replace(/[^\p{L}\p{N} ._-]/gu,'').trim()||'Graph')+suffix;
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function vectorBlob(){
  const el=plot.cloneNode(true);el.querySelectorAll('.editor-only').forEach(n=>n.remove());
  el.setAttribute('width','900');el.setAttribute('height','535');
  return new Blob([new XMLSerializer().serializeToString(el)],{type:'image/svg+xml;charset=utf-8'});
}
async function raster(){
  const url=URL.createObjectURL(vectorBlob());
  try{
    const img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=1800;c.height=1070;c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PNG conversion failed')),'image/png'));
  }finally{URL.revokeObjectURL(url);}
}
async function exportPng(copy){
  try{
    const promise=raster();
    if(copy&&navigator.clipboard?.write&&window.ClipboardItem){
      try{await navigator.clipboard.write([new ClipboardItem({'image/png':promise})]);$('hint').textContent='Graph copied. Paste it into Word.';return;}catch{}
    }
    download(await promise,'.png');$('hint').textContent=copy?'Clipboard unavailable. Saved a PNG for Word.':'PNG exported.';
  }catch{$('hint').textContent='PNG export failed. Use Download SVG or Print to PDF.';}
}
$('export').onclick=()=>buttonMenu($('export'),'Export',[
  ['Copy graph for Word',()=>exportPng(true)],['Download PNG',()=>exportPng(false)],['Download SVG',()=>download(vectorBlob(),'.svg')],['Print or save PDF',()=>window.print()],
  ['Save editable workspace',()=>download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'.kvasir.json')]
]);
$('import').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try{const w=JSON.parse(await file.text());if(!M.validWorkspace(w))throw Error();
    commit(()=>{for(const g of w.graphs){const active=g.id===w.active;g.id=M.id();state.graphs.push(g);if(active)state.active=g.id;}resetTools();});
  }catch{$('hint').textContent='Could not open this workspace. Choose a Kvasir JSON backup.';}
};
$('new').onclick=newGraph;$('settings').onclick=settings;$('graph-menu').onclick=graphMenu;$('close').onclick=()=>dialog.close();
$('grid').onchange=()=>commit(()=>graph().grid=$('grid').checked);$('snap').onchange=()=>commit(()=>graph().snap=$('snap').checked);
$('undo').onclick=()=>historyMove(undo,redo);$('redo').onclick=()=>historyMove(redo,undo);
document.addEventListener('keydown',e=>{
  if(dialog.open||e.target.matches('input,select,textarea'))return;
  if(e.key==='Escape'){cancelScheduledRender();if(drag?.snapshot){state=JSON.parse(drag.snapshot);cache=null;}setTool('Select');return;}
  if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();const back=e.key.toLowerCase()==='z'&&!e.shiftKey;historyMove(back?undo:redo,back?redo:undo);}
  if((e.key==='Delete'||e.key==='Backspace')&&tool==='Select'&&selected){e.preventDefault();deleteSelected();}
  const arrow={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key];
  if(arrow&&tool==='Select'&&selected&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();nudge(arrow[0],arrow[1],e.shiftKey);}
  if(e.key==='Enter'&&tool==='Select'&&selected&&(e.target===plot||e.target.closest?.('#objects'))){e.preventDefault();editObject(selectedObj());}
});
// Arrow keys move the selected object (or an area's label) by a tenth of a
// grid step, or a whole step with Shift, so round values stay round. A run of
// presses undoes as one step.
let lastNudge=0;
const round=v=>Number(v.toPrecision(12));
function nudge(dx,dy,big){
  const o=selectedObj();
  if(!o||o.kind==='guide')return;
  getScene();
  const g=graph(),scale=big?1:.1,now=performance.now();
  const ux=dx*tickStep(g.xmax,10)*scale,uy=dy*tickStep(g.ymax,8)*scale;
  const parts=o.kind==='region'?[]:regionParts();
  if(now-lastNudge>800)remember();
  lastNudge=now;
  if(o.kind==='region'){
    const p=o.labelAt||labelPosition(o);
    if(!p)return;
    o.labelAt={x:round(p.x+ux),y:round(p.y+uy)};
  }else{
    o.pts=scene.resolved.get(o.id).pts.map(p=>({x:round(p.x+ux),y:round(p.y+uy)}));
    delete o.equation;
    if(o.labelAt)o.labelAt={x:o.labelAt.x+ux,y:o.labelAt.y+uy};
  }
  repiece(parts);cache=null;render(true);save();
  if(['point','label'].includes(o.kind))$('hint').textContent=o.name.replace(/_\{([^{}]+)\}/g,'$1')+' moved to Q = '+num(o.pts[0].x)+', P = '+num(o.pts[0].y)+'. Shift moves farther.';
}
try{render();}
catch(error){
  // Saved data passed validation but still cannot be drawn. Keep a copy and start fresh.
  console.error(error);keepUnreadable(rawSaved);storageIssue=true;state=demoWorkspace();cache=null;render();
}
if(storageIssue)$('saved').textContent=unreadableBackup()?'Saved data could not be opened. A copy was kept (••• menu).':'Storage unavailable or unreadable';
else save();
