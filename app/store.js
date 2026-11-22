'use strict';
// The workspace: loading and backing up saved data, editor state, drawing scale,
// saving, undo and redo, and the cached scene (resolved objects and faces).
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
