'use strict';
// Drawing the plot, its handles and previews, and the sidebar, toolbar and hints.
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
function renderSelection(){
  for(const row of $('objects').querySelectorAll('button'))row.classList.toggle('active',row.dataset.id===selected);
  const o=selectedObj();
  if(!o){$('inspector').replaceChildren();return;}
  // A card for the selected object: what it is, then its actions with shortcuts.
  const head=document.createElement('div'),sample=document.createElement('span'),name=document.createElement('span');
  head.className='inspector-head';sample.className='sample '+o.kind;sample.style.backgroundColor=color(o);renderLabel(name,o.name);head.append(sample,name);
  const keys={Edit:'Enter',Delete:'Del'};
  $('inspector').replaceChildren(head,...objectActions(o).map(([label,act])=>{
    const b=btn('',act,'action'+(label==='Delete'?' danger':''));b.innerHTML=icon(label);b.append(label);
    if(keys[label]){const k=document.createElement('kbd');k.textContent=keys[label];b.append(k);}
    return b;
  }));
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
