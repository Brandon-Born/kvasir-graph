const Model = (() => {
  const G=Geometry, teal='#187d73', orange='#c35b21', ink='#233b47';
  const id=()=>crypto.randomUUID();
  const shape=(kind,name,pts,color=teal)=>({id:id(),kind,name,pts,color});
  function blank(name='Untitled graph',xmax=150,ymax=80){
    return {id:id(),name,xmax,ymax,xlabel:'Quantity (Q)',ylabel:'Price (P)',grid:true,snap:true,objects:[]};
  }
  function resolve(graph){
    const paths=new Map(G.frame(graph.xmax,graph.ymax).map(o=>[o.id,o.points]));
    const objects=new Map(graph.objects.map(o=>[o.id,o])), resolved=new Map(),busy=new Set();
    function path(key){if(!paths.has(key)&&objects.has(key))get(objects.get(key));return paths.get(key);}
    function anchor(p){
      if(!p.ref)return p;
      const {a,b,t}=p.ref, first=path(a);
      if(!first?.length)return p;
      if(b){
        const second=path(b);
        if(!second)return p;
        const pts=G.crossings(first,second);
        return pts.sort((u,v)=>Math.hypot(u.x-p.x,u.y-p.y)-Math.hypot(v.x-p.x,v.y-p.y))[0]||p;
      }
      if(Number.isFinite(t)){
        const n=G.clamp(t,0,1)*(first.length-1),i=Math.floor(n);
        return G.lerp(first[i],first[Math.min(i+1,first.length-1)],n-i);
      }
      return G.nearest(p,first).point||p;
    }
    function get(o){
      if(resolved.has(o.id))return resolved.get(o.id);
      if(busy.has(o.id))return o;
      busy.add(o.id);
      const pts=(o.pts||[]).map(anchor);
      // Keep a projection horizontal or vertical as its source intersection moves.
      if(o.kind==='guide'&&['h','v'].includes(o.orientation)){
        const source=o.sourceEnd===1?1:0,target=1-source,origin=pts[source];
        const horizontal=o.orientation==='h',coord=horizontal?'y':'x';
        const boundary=o.pts[target].ref?.a;
        const targetPath=boundary&&path(boundary);
        const track=horizontal?[{x:0,y:origin.y},{x:graph.xmax,y:origin.y}]:
          [{x:origin.x,y:0},{x:origin.x,y:graph.ymax}];
        const options=targetPath?G.crossings(track,targetPath):[];
        pts[target]=options.sort((a,b)=>Math.hypot(a.x-pts[target].x,a.y-pts[target].y)-Math.hypot(b.x-pts[target].x,b.y-pts[target].y))[0]||
          {...pts[target],[coord]:origin[coord]};
      }
      if(o.kind==='u'&&o.pts[1].ref){
        const dx=pts[1].x-o.pts[1].x,dy=pts[1].y-o.pts[1].y;
        for(const i of [0,2])pts[i]={x:o.pts[i].x+dx,y:o.pts[i].y+dy};
      }
      const obj={...o,pts};resolved.set(o.id,obj);
      if(['line','guide','free','u'].includes(o.kind))paths.set(o.id,G.curve(obj));
      busy.delete(o.id);return obj;
    }
    graph.objects.forEach(get);
    return {resolved,paths};
  }
  function regions(graph,scene){
    return G.faces(Array.from(scene.paths,([id,points])=>({id,points})),graph.xmax,graph.ymax);
  }
  function findFace(piece,faces){
    let options=faces.filter(f=>f.signature===piece.signature);
    return options.find(f=>G.inside(piece.seed,f.poly))||options[0]||faces.find(f=>G.inside(piece.seed,f.poly));
  }
  const piece=(face,seed)=>({signature:face.signature,seed:{x:seed.x,y:seed.y}});
  function demo(){
    const g=blank('Market equilibrium',100,10);
    const d=shape('line','Demand',[{x:0,y:10},{x:100,y:0}]),s=shape('line','Supply',[{x:0,y:0},{x:100,y:10}],orange);
    d.caption='D';s.caption='S';
    const e={x:50,y:5,ref:{a:d.id,b:s.id}};
    g.objects.push(d,s);g.objects.push(...equilibrium(g,d.id,s.id));
    const faces=regions(g,resolve(g));
    for(const [name,y,color] of [['Consumer surplus',6.6,teal],['Producer surplus',3.3,orange]]){
      const seed={x:16,y},face=faces.find(f=>G.inside(seed,f.poly));
      g.objects.push({...shape('region',name,[],color),pieces:[piece(face,seed)]});
    }
    return g;
  }
  // Check every field the editor reads, so a damaged or hand-edited backup is
  // rejected up front instead of breaking rendering after it has been saved.
  // Point E where curves a and b cross, anchored to both, with dashed guides to
  // each axis that follow it when either curve moves. Null if they don't cross.
  function equilibrium(graph,a,b,name='E'){
    const {paths}=resolve(graph),first=paths.get(a),second=paths.get(b);
    if(!first||!second)return null;
    const p=G.crossings(first,second).find(q=>q.x>=0&&q.y>=0&&q.x<=graph.xmax&&q.y<=graph.ymax);
    if(!p)return null;
    const e={x:p.x,y:p.y,ref:{a,b}};
    return [...guides(graph,e,name==='E'?'':' '+name),shape('point',name,[{...e}],ink)];
  }
  // Dashed guides from point e to the price axis (h) and the quantity axis (v).
  // They stay horizontal or vertical and follow e when it is anchored.
  function guides(graph,e,suffix='',{h=true,v=true}={}){
    const out=[];
    if(h){const g=shape('guide','Price guide'+suffix,[{x:0,y:e.y,ref:{a:'@price',t:1-e.y/graph.ymax}},{...e}],ink);g.orientation='h';g.sourceEnd=1;out.push(g);}
    if(v){const g=shape('guide','Quantity guide'+suffix,[{x:e.x,y:0,ref:{a:'@quantity',t:e.x/graph.xmax}},{...e}],ink);g.orientation='v';g.sourceEnd=1;out.push(g);}
    return out;
  }
  function validWorkspace(w){
    const kinds=['line','guide','free','u','point','label','region'];
    const str=v=>typeof v==='string', num=Number.isFinite;
    const optional=(v,check)=>v==null||check(v);
    const finite=p=>p!==null&&typeof p==='object'&&num(p.x)&&num(p.y);
    const ref=r=>r!==null&&typeof r==='object'&&str(r.a)&&optional(r.b,str)&&optional(r.t,num);
    const point=p=>finite(p)&&optional(p.ref,ref);
    const count=o=>o.kind==='u'?o.pts.length===3:['point','label'].includes(o.kind)?o.pts.length===1:
      o.kind==='region'||o.pts.length>=2;
    const object=o=>o!==null&&typeof o==='object'&&str(o.id)&&str(o.name)&&kinds.includes(o.kind)&&
      Array.isArray(o.pts)&&o.pts.every(point)&&count(o)&&
      optional(o.caption,str)&&optional(o.equation,str)&&optional(o.color,str)&&optional(o.orientation,str)&&
      optional(o.fontSize,num)&&optional(o.sourceEnd,num)&&optional(o.labelAt,finite)&&
      (o.kind!=='region'||Array.isArray(o.pieces)&&o.pieces.every(p=>p!==null&&typeof p==='object'&&finite(p.seed)&&str(p.signature)));
    const graph=g=>g!==null&&typeof g==='object'&&str(g.id)&&str(g.name)&&num(g.xmax)&&g.xmax>0&&num(g.ymax)&&g.ymax>0&&
      str(g.xlabel)&&str(g.ylabel)&&optional(g.xFontSize,num)&&optional(g.yFontSize,num)&&
      Array.isArray(g.objects)&&g.objects.every(object);
    return w?.version===1&&Array.isArray(w.graphs)&&w.graphs.length>0&&w.graphs.some(g=>g?.id===w.active)&&w.graphs.every(graph);
  }
  return {id,shape,blank,resolve,regions,findFace,piece,demo,equilibrium,guides,validWorkspace,teal,orange,ink};
})();
if(typeof module!=='undefined') module.exports=Model;
