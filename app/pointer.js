'use strict';
// Pointer input on the plot: coordinates, snapping, hit testing, drawing, dragging,
// and keeping shaded areas whole as curves are added or moved.
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
