'use strict';
// Dialogs: form fields, coordinate entry, editing objects, new graphs, axes.
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
  modal(title);const n=labelField('Label',defaultName,initialSize),c=colorField(defaultColor);
  submit('Apply',()=>fn(n.value.trim()||defaultName,c.value,n.fontSize));
}
function colorField(value,parent=fields){
  const group=document.createElement('fieldset'),legend=document.createElement('legend'),picker=swatches(value);
  group.className='color-field';legend.textContent='Color';group.append(legend,picker.row);parent.append(group);
  return picker;
}
function pointFields(label,p){
  const pair=document.createElement('div');pair.className='pair';fields.append(pair);
  const x=field(label+' · Q',num(p.x),'number',pair),y=field(label+' · P',num(p.y),'number',pair);
  return ()=>({x:x.valueAsNumber,y:y.valueAsNumber});
}
function exactLine(){
  modal('Draw a straight line');const name=labelField('Curve label',nextName('Line'));
  const a=pointFields('First point',{x:0,y:0}),b=pointFields('Second point',{x:graph().xmax,y:graph().ymax});
  const c=colorField(newColor());
  submit('Add line',()=>{if(distance(a(),b())<.001){notice('Choose two different endpoints.');return false;}addShape({...M.shape('line',name.value,[a(),b()],c.value),fontSize:name.fontSize});});
}
function exactPoint(){
  modal('Mark a point');const name=labelField('Label','E');
  const at=pointFields('Position',{x:graph().xmax/2,y:graph().ymax/2}),c=colorField(M.ink);
  submit('Add point',()=>{addShape({...M.shape('point',name.value.trim()||'E',[at()],c.value),fontSize:name.fontSize});});
}
function exactLabel(){
  modal('Place text');const name=labelField('Text','Label');
  const at=pointFields('Position',{x:graph().xmax/2,y:graph().ymax/2}),c=colorField(M.ink);
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
  const label=o.caption!==undefined?labelField('Label on graph',o.caption,size):null,c=colorField(color(o));
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
