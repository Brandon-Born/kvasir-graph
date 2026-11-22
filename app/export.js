'use strict';
// PNG, SVG, clipboard, print and workspace backup export, and workspace import.
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
