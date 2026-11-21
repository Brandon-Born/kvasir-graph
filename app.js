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
let state,storageIssue=false;
try{const raw=localStorage.getItem(key);if(raw){state=JSON.parse(raw);if(!M.validWorkspace(state))throw Error();}}catch{state=null;storageIssue=true;}
if(!state){const g=M.demo();state={version:1,graphs:[g],active:g.id};}
let selected=null,tool='Select',drawMode='line',guideMode='auto',labelMode='object',shadeGroup=null,start=null,drag=null,hover=null,snapText='',scene,faces,cache=null;
const undo=[],redo=[], graph=()=>state.graphs.find(g=>g.id===state.active);
const selectedObj=()=>graph().objects.find(o=>o.id===selected);
const num=v=>String(Number(v.toFixed(5))), color=o=>/^#[0-9a-f]{6}$/i.test(o.color)?o.color:M.ink;
const box={x:76,y:46,w:755,h:409};
const X=x=>box.x+x*box.w/graph().xmax,Y=y=>box.y+box.h-y*box.h/graph().ymax;
const scaled=p=>({x:X(p.x),y:Y(p.y)});
const pathData=pts=>pts.map((p,i)=>(i?'L':'M')+X(p.x).toFixed(3)+' '+Y(p.y).toFixed(3)).join(' ');
const distance=(a,b)=>Math.hypot(X(a.x)-X(b.x),Y(a.y)-Y(b.y));
function save(){
  try{localStorage.setItem(key,JSON.stringify(state));$('saved').textContent='✓  Saved locally';}
  catch{$('saved').textContent='Use Export to save a backup';}
}
function remember(snapshot=JSON.stringify(state)){undo.push(snapshot);if(undo.length>80)undo.shift();redo.length=0;}
function commit(fn){remember();fn();cache=null;save();render();}
function resetTools(){selected=null;shadeGroup=null;start=null;hover=null;drag=null;tool='Select';}
function historyMove(from,to){if(!from.length)return;to.push(JSON.stringify(state));state=JSON.parse(from.pop());resetTools();cache=null;save();render();}
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
  const axis=svg('g',{},labels);
  svg('path',{d:'M76 35V455H846',fill:'none',stroke:M.ink,'stroke-width':1.8},axis);
  svg('path',{d:'m76 32-4 9h8z M848 455l-9-4v8z',fill:M.ink},axis);
  txt(labels,g.ylabel,box.x-4,24,{'font-style':'italic','font-size':19});
  txt(labels,g.xlabel,850,509,{'text-anchor':'end','font-style':'italic','font-size':19});
  for(const o of scene.resolved.values()){
    if(o.kind==='point'){const p=scaled(o.pts[0]);svg('circle',{cx:p.x,cy:p.y,r:5.6,fill:color(o),stroke:'white','stroke-width':2,'data-id':o.id},labels);}
    if(o.kind==='guide'&&!o.showLabel)continue;
    const p=labelPosition(o);if(!p)continue;
    const isCurve=['line','u','free','guide'].includes(o.kind);
    const offset=o.labelAt||o.kind==='label'||o.kind==='region'?{x:0,y:0}:isCurve?{x:8,y:p.y<g.ymax*.03?-9:4}:{x:10,y:-10};
    const x=G.clamp(X(p.x)+offset.x,10,887),y=G.clamp(Y(p.y)+offset.y,18,498);
    txt(labels,o.caption??o.name,x,y,{'font-size':o.kind==='region'?18:20,'font-style':'italic','font-weight':isCurve?600:400,
      'text-anchor':o.kind==='region'?'middle':x>795&&(o.caption??o.name).length>4?'end':'start',
      fill:o.kind==='region'?M.ink:color(o),'data-id':o.id,'data-label':'1','pointer-events':'bounding-box','paint-order':'stroke',stroke:'white','stroke-width':o.kind==='region'?0:3});
  }
  const overlay=svg('g',{class:'editor-only','pointer-events':'none',id:'overlay'});
  const obj=scene.resolved.get(selected);
  if(tool==='Select'&&obj&&obj.kind!=='free')obj.pts.forEach(p=>svg('circle',{cx:X(p.x),cy:Y(p.y),r:5,fill:'white',stroke:M.teal,'stroke-width':2},overlay));
  renderPreview();
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
const hints={Select:'Select an object to edit it. Drag a label to reposition it.',Draw:'Click two endpoints, or enter exact coordinates.',Point:'Click to mark a point. Hold Alt to pause snapping.',Guide:'Click a starting point, then the end of your guide.',Shade:'Click inside a bounded area to shade it.',Label:'Click a curve or area to name it, or click empty space to add text.'};
const faceAt=p=>faces.filter(f=>G.inside(p,f.poly)).sort((a,b)=>a.area-b.area)[0];
function setTool(name){tool=name;start=null;hover=null;drag=null;snapText='';shadeGroup=null;render();}
function render(){
  const g=graph();document.title=g.name+' · Kvasir Graph';$('title').textContent=g.name;
  $('graphs').replaceChildren(...state.graphs.map(item=>{
    const b=btn('',()=>{resetTools();state.active=item.id;cache=null;save();render();},'graph'+(item===g?' active':''));b.innerHTML=icon('Graph');b.append(item.name);return b;
  }));
  $('objects').replaceChildren(...g.objects.map(o=>{
    const b=btn('',()=>{selected=o.id;setTool('Select');},'object'+(o.id===selected?' active':''));
    const sample=document.createElement('span'),name=document.createElement('span');
    sample.className='sample '+o.kind;sample.style.backgroundColor=color(o);
    renderLabel(name,o.name);b.append(sample,name);return b;
  }));
  if(!g.objects.length)$('objects').append(Object.assign(document.createElement('span'),{className:'empty',textContent:'Objects appear as you draw.'}));
  const o=selectedObj(),ins=$('inspector');ins.replaceChildren();
  if(o){
    ins.append(btn('Edit',()=>editObject(o)));
    if(o.kind!=='label'&&(o.kind!=='guide'||o.showLabel))ins.append(btn('Move label',()=>setTool('Move label')));
    if(['line','u','free','guide'].includes(o.kind))ins.append(btn('Copy & shift',()=>shiftDialog(o)));
    if(o.kind==='region')ins.append(btn('Add area',()=>{setTool('Shade');shadeGroup=o.id;$('hint').textContent='Click another area to include in '+o.name+'.';}));
    if(o.pts.some(p=>p.ref))ins.append(btn('Detach',()=>commit(()=>{o.pts=scene.resolved.get(o.id).pts.map(({x,y})=>({x,y}));})));
    ins.append(btn('Delete',deleteSelected));
  }
  $('grid').checked=g.grid;$('snap').checked=g.snap;$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
  $('toolbar').replaceChildren(...Object.keys(hints).map(n=>{const b=btn('',()=>setTool(n),n===tool?'active':'');b.innerHTML=icon(n);b.append(n);b.setAttribute('aria-pressed',tool===n);return b;}));
  const opts=$('options');opts.replaceChildren();
  if(tool==='Draw'){
    for(const [k,v] of [['line','Straight line'],['u','U-shaped'],['free','Freehand']])opts.append(btn(v,()=>{drawMode=k;setTool('Draw');},k===drawMode?'active':''));
    if(drawMode==='line')opts.append(btn('Enter coordinates',()=>exactLine()));
  }
  if(tool==='Guide')for(const [k,v] of [['auto','Any angle'],['h','Horizontal'],['v','Vertical']])opts.append(btn(v,()=>{guideMode=k;setTool('Guide');},guideMode===k?'active':''));
  if(tool==='Label')for(const [k,v] of [['object','Object label'],['text','Free text']])opts.append(btn(v,()=>{labelMode=k;setTool('Label');},labelMode===k?'active':''));
  $('hint').textContent=start?'Click the second endpoint. Esc cancels.':tool==='Draw'&&drawMode==='u'?'Click to place the minimum. Drag either arm to reshape.':tool==='Draw'&&drawMode==='free'?'Drag to sketch a smooth curve.':hints[tool];
  if(tool==='Move label')$('hint').textContent='Click where the label should appear. Esc cancels.';
  plot.style.cursor=tool==='Move label'?'crosshair':'';
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
function snap(raw,event,exclude=null){
  getScene();snapText='';const g=graph(),p={...raw};
  const constrained=start&&tool==='Guide'&&guideMode!=='auto';
  if(constrained){if(guideMode==='h')p.y=start.y;else p.x=start.x;}
  if(!g.snap||event.altKey)return p;
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
function addShape(o){
  // A new boundary may subdivide an existing fill. Keep all its child faces.
  const existing=graph().objects.filter(x=>x.kind==='region').map(r=>[r,r.pieces.map(p=>M.findFace(p,faces)).filter(Boolean)]);
  commit(()=>{
    graph().objects.push(o);
    if(existing.length&&['line','guide','free','u'].includes(o.kind)){
      const fresh=M.regions(graph(),M.resolve(graph()));
      for(const [region,parents] of existing){
        const pieces=[];
        for(const f of fresh){
          const seed=interior(f);
          if(parents.some(parent=>G.inside(seed,parent.poly)))pieces.push(M.piece(f,seed));
        }
        region.pieces=pieces;
      }
    }
    resetTools();selected=o.id;
  });
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
      drag={type,idx,labelOrigin,raw:type==='caption'?raw:position(event),snapshot:JSON.stringify(state),base:clone(obj),original:clone(selectedObj()),moved:false};
      plot.setPointerCapture(event.pointerId);
    }else selected=null;
    render();return;
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
    objectForm('Place label','Label',M.ink,(name,color)=>addShape(M.shape('label',name,[p],color)));return;
  }
  if(tool==='Point'){
    objectForm('Mark point','E',M.ink,(name,color)=>addShape(M.shape('point',name,[p],color)));
    notice('Q = '+num(p.x)+'     P = '+num(p.y)+(snapText?'   ·   '+snapText:''));return;
  }
  if(tool==='Draw'&&drawMode==='free'){
    drag={type:'free',pts:[p]};plot.setPointerCapture(event.pointerId);return;
  }
  if(tool==='Draw'&&drawMode==='u'){
    const w=g.xmax*.16,h=g.ymax*.31;
    addShape(M.shape('u',nextName('Cost curve'),[{x:p.x-w,y:p.y+h},p,{x:p.x+w,y:p.y+h}],newColor()));return;
  }
  if(!start){start=p;hover=p;render();return;}
  if(distance(start,p)<3)return;
  const guide=tool==='Guide';
  const o=M.shape(guide?'guide':'line',nextName(guide?'Guide':'Line'),[start,p],guide?M.ink:newColor());
  if(guide){o.orientation=guideMode;o.sourceEnd=!start.ref?.b&&p.ref?.b?1:0;}
  addShape(o);
};
plot.onpointermove=event=>{
  const raw=position(event,drag?.type==='caption');$('coords').textContent='Q '+num(raw.x)+'   ·   P '+num(raw.y);
  if(drag?.type==='free'){
    if(distance(raw,drag.pts.at(-1))>5&&drag.pts.length<320)drag.pts.push(raw);
    renderPreview();return;
  }
  if(drag){
    if(!drag.moved&&distance(raw,drag.raw)<2)return;drag.moved=true;
    const o=selectedObj(),dx=raw.x-drag.raw.x,dy=raw.y-drag.raw.y,base=drag.base;
    if(drag.type==='caption'||o.kind==='region'){
      const initial=drag.labelOrigin||base.labelAt||labelPosition(base)||drag.raw;
      o.labelAt={x:initial.x+dx,y:initial.y+dy};
    }else if(drag.type==='handle'||['point','label'].includes(o.kind)){
      const i=drag.idx>=0?drag.idx:0,p=snap(raw,event,o.id);hover=p;
      if(o.kind==='u'){
        if(i===1)o.pts=base.pts.map((q,j)=>j===1?p:{x:q.x+p.x-base.pts[1].x,y:q.y+p.y-base.pts[1].y});
        else {o.pts=base.pts.map(({x,y})=>({x,y}));o.pts[1].ref=drag.original.pts[1].ref;
          o.pts[i]={x:i===0?Math.min(p.x,base.pts[1].x-.001):Math.max(p.x,base.pts[1].x+.001),y:Math.max(p.y,base.pts[1].y)};}
      }else o.pts[i]=p;
    }else{
      o.pts=base.pts.map(p=>({x:p.x+dx,y:p.y+dy}));
      if(base.labelAt)o.labelAt={x:base.labelAt.x+dx,y:base.labelAt.y+dy};
    }
    cache=null;renderPlot();return;
  }
  const showSnap=!['Select','Shade','Move label'].includes(tool);
  hover=showSnap?snap(raw,event):raw;
  if(!showSnap)snapText='';
  if(snapText)$('coords').textContent='Q '+num(hover.x)+'   ·   P '+num(hover.y);
  renderPreview();
};
plot.onpointerup=event=>{
  if(!drag)return;const end=drag;drag=null;hover=null;snapText='';
  if(end.type==='free'){
    if(end.pts.length>=2){
      const last=snap(position(event),event),pts=G.freehand(end.pts);pts[0]=end.pts[0];pts[pts.length-1]=last;
      addShape(M.shape('free',nextName('Curve'),pts,newColor()));
    }else render();
  }else if(end.moved){remember(end.snapshot);cache=null;save();render();}else render();
};
plot.onpointercancel=()=>{if(drag?.snapshot){state=JSON.parse(drag.snapshot);cache=null;}drag=null;hover=null;render();};
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
function labelField(label,value){
  const input=field(label,value),row=document.createElement('div');
  row.className='label-field';
  const wrapper=input.parentElement;
  wrapper.before(row);row.append(wrapper);
  const preview=document.createElement('output');
  preview.className='label-preview';
  preview.setAttribute('aria-label','Label preview');preview.setAttribute('aria-live','polite');
  function refresh(){
    renderLabel(preview,input.value);
    preview.hidden=!input.value.includes('_{');
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
  row.append(button);row.after(preview);input.addEventListener('input',refresh);refresh();
  return input;
}
function submit(label,fn){
  const b=btn(label,()=>{},'primary');b.type='submit';$('form-actions').append(b);
  form.onsubmit=e=>{e.preventDefault();if(form.reportValidity()&&fn()!==false)dialog.close();};
  const first=fields.querySelector('input');if(first){first.focus();if(first.type==='text')first.select();}
}
function objectForm(title,defaultName,defaultColor,fn){
  modal(title);const n=labelField('Label',defaultName),c=field('Color',defaultColor,'color');
  submit('Apply',()=>fn(n.value.trim()||defaultName,c.value));
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
  submit('Add line',()=>{if(distance(a(),b())<.001){notice('Choose two different endpoints.');return false;}addShape(M.shape('line',name.value,[a(),b()],c.value));});
}
function editObject(o){
  modal('Edit '+(o.kind==='region'?'area':o.kind==='u'?'U-shaped curve':o.kind==='free'?'curve':o.kind));
  const n=o.caption===undefined?labelField('Name',o.name):field('Name',o.name),label=o.caption!==undefined?labelField('Label on graph',o.caption):null,c=field('Color',color(o),'color');
  let show=null;if(o.kind==='guide'){show=field('Show label on graph','','checkbox');show.required=false;show.checked=!!o.showLabel;}
  const base=scene.resolved.get(o.id).pts,points=base.length<=3?base.map((p,i)=>pointFields(o.kind==='u'?['Left arm','Minimum','Right arm'][i]:base.length===1?'Position':'Endpoint '+(i+1),p)):[];
  submit('Apply',()=>{
    const updated=points.map(fn=>fn());
    if(o.kind==='u'&&!(updated[0].x<updated[1].x&&updated[1].x<updated[2].x&&updated[1].y<=Math.min(updated[0].y,updated[2].y))){notice('Keep the minimum between and below both arms.');return false;}
    if(['line','guide'].includes(o.kind)&&distance(updated[0],updated[1])<.001){notice('Choose two different endpoints.');return false;}
    commit(()=>{o.name=n.value;o.color=c.value;if(label)o.caption=label.value;if(show)o.showLabel=show.checked;
      updated.forEach((p,i)=>{if(num(base[i].x)!==num(p.x)||num(base[i].y)!==num(p.y))o.pts[i]=p;});});
  });
}
function shiftDialog(o){
  modal('Copy and shift');const n=labelField('New curve label',o.name+'′'),dx=field('Quantity shift (ΔQ)',0,'number'),dy=field('Price shift (ΔP)',5,'number');
  submit('Add shifted copy',()=>{
    const copy=clone(o);copy.id=M.id();copy.name=n.value;delete copy.caption;delete copy.labelAt;
    copy.pts=scene.resolved.get(o.id).pts.map(p=>({x:p.x+dx.valueAsNumber,y:p.y+dy.valueAsNumber}));copy.color=newColor();addShape(copy);
  });
}
function areaDialog(piece){
  objectForm('Shade area','CS',M.teal,(name,c)=>addShape({...M.shape('region',name,[],c),pieces:[piece]}));
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
function menu(title,items){
  modal(title);for(const [name,fn] of items)fields.append(btn(name,()=>{dialog.close();fn();},'menuitem'));
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
    for(const curve of result?.curves??[]){
      const o=M.shape('line',curve.name,curve.pts,curve.name==='Demand'?M.teal:M.orange);
      o.caption=curve.name[0];g.objects.push(o);
    }
    commit(()=>{state.graphs.push(g);state.active=g.id;resetTools();});
  });
}
function settings(){
  const g=graph();modal('Axes and scale');const x=labelField('Horizontal axis label',g.xlabel),y=labelField('Vertical axis label',g.ylabel),xm=field('Maximum quantity',g.xmax,'number'),ym=field('Maximum price',g.ymax,'number');
  xm.min=ym.min='.00001';submit('Apply',()=>commit(()=>{g.xlabel=x.value;g.ylabel=y.value;g.xmax=xm.valueAsNumber;g.ymax=ym.valueAsNumber;}));
}
function graphMenu(){menu('Graph actions',[
  ['Rename graph',()=>{modal('Rename graph');const n=field('Graph title',graph().name);submit('Rename',()=>commit(()=>graph().name=n.value));}],
  ['Duplicate graph',()=>commit(()=>{const g=clone(graph());g.id=M.id();g.name+=' (copy)';state.graphs.push(g);state.active=g.id;resetTools();})],
  ['Open workspace backup',()=>$('import').click()],
  ['Delete graph',()=>{modal('Delete graph?');notice('Remove “'+graph().name+'” from this workspace. You can undo this change.');submit('Delete graph',()=>commit(()=>{state.graphs=state.graphs.filter(g=>g.id!==state.active);if(!state.graphs.length)state.graphs.push(M.blank());state.active=state.graphs[0].id;resetTools();}));}]
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
$('export').onclick=()=>menu('Export',[
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
  if(e.key==='Escape'){if(drag?.snapshot){state=JSON.parse(drag.snapshot);cache=null;}setTool('Select');return;}
  if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();const back=e.key.toLowerCase()==='z'&&!e.shiftKey;historyMove(back?undo:redo,back?redo:undo);}
  if(e.key==='Delete'&&tool==='Select')deleteSelected();
});
render();
if(storageIssue)$('saved').textContent='Storage unavailable or unreadable';else save();
