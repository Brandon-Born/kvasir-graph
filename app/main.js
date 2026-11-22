'use strict';
// Wiring: sidebar controls, keeping tabs in sync, keyboard shortcuts, and startup.
$('new').innerHTML=icon('New')+'New';$('settings').insertAdjacentHTML('afterbegin',icon('Axes'));
$('new').onclick=newGraph;$('settings').onclick=settings;$('graph-menu').onclick=graphMenu;$('close').onclick=()=>dialog.close();
$('grid').onchange=()=>commit(()=>graph().grid=$('grid').checked);$('snap').onchange=()=>commit(()=>graph().snap=$('snap').checked);
$('undo').onclick=()=>historyMove(undo,redo);$('redo').onclick=()=>historyMove(redo,undo);
// Another tab saved the workspace. Adopt its version so this tab never writes
// over newer work, keeping this tab's own graph in view.
addEventListener('storage',event=>{
  if(event.key!==key||event.newValue===null||event.newValue===JSON.stringify(state))return;
  let incoming;
  try{incoming=JSON.parse(event.newValue);}catch{return;}
  if(!M.validWorkspace(incoming))return;
  const active=state.active,interrupted=dialog.open||!!drag||!!start;
  if(dialog.open)dialog.close();
  if(objectMenu.matches(':popover-open'))objectMenu.hidePopover();
  cancelScheduledRender();
  if(incoming.graphs.some(g=>g.id===active))incoming.active=active;
  state=incoming;
  // Undoing here would roll back the other tab's work, so history starts over.
  undo.length=redo.length=0;
  resetTools();cache=null;render();
  $('saved').textContent='✓  Updated from another tab';
  $('hint').textContent=interrupted?'This workspace changed in another tab, so your unfinished edit here was cancelled.':'This workspace changed in another tab. You are seeing the latest version.';
});
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
