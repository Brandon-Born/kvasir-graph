'use strict';
// Object actions (Edit, Copy & shift, Mark equilibrium, ...) and the popover menu
// used for right-click, Export and the ••• graph menu.
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
