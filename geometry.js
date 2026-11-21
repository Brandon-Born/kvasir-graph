/* Geometry is expressed in economic units: x = quantity and y = price. */
const Geometry = (() => {
  const EPS = 1e-7;
  const lerp = (a, b, t) => ({x:a.x + (b.x-a.x)*t, y:a.y + (b.y-a.y)*t});
  const cross = (a,b) => a.x*b.y-a.y*b.x;
  const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y});
  const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
  const near = (a,b) => Math.hypot(a.x-b.x,a.y-b.y)<EPS;

  function hits(a,b,c,d) {
    if(Math.max(a.x,b.x)+EPS<Math.min(c.x,d.x)||Math.max(c.x,d.x)+EPS<Math.min(a.x,b.x)||
      Math.max(a.y,b.y)+EPS<Math.min(c.y,d.y)||Math.max(c.y,d.y)+EPS<Math.min(a.y,b.y))return [];
    const r=sub(b,a), s=sub(d,c), den=cross(r,s), offset=sub(c,a);
    if (Math.abs(den)<EPS) {
      if (Math.abs(cross(offset,r))>EPS) return [];
      const on=(p,u,v)=>p.x>=Math.min(u.x,v.x)-EPS && p.x<=Math.max(u.x,v.x)+EPS &&
        p.y>=Math.min(u.y,v.y)-EPS && p.y<=Math.max(u.y,v.y)+EPS;
      return [a,b,c,d].filter(p=>on(p,a,b)&&on(p,c,d));
    }
    const t=cross(offset,s)/den, u=cross(offset,r)/den;
    return t>=-EPS && t<=1+EPS && u>=-EPS && u<=1+EPS ? [lerp(a,b,clamp(t,0,1))] : [];
  }
  function nearest(p, points, sx=1, sy=1) {
    let best=null, distance=Infinity;
    for(let i=1;i<points.length;i++){
      const a=points[i-1], b=points[i], dx=(b.x-a.x)*sx, dy=(b.y-a.y)*sy;
      const t=clamp(((p.x-a.x)*sx*dx+(p.y-a.y)*sy*dy)/(dx*dx+dy*dy||1),0,1);
      const q=lerp(a,b,t), gap=Math.hypot((q.x-p.x)*sx,(q.y-p.y)*sy);
      if(gap<distance){best=q;distance=gap;}
    }
    return {point:best,distance};
  }
  function curve(o) {
    if(o.kind!=='u') return o.pts;
    const [l,m,r]=o.pts, pts=[];
    for(const [a,b,reverse] of [[l,m,true],[m,r,false]]){
      for(let i=reverse?0:1;i<=32;i++){
        const t=i/32, x=a.x+(b.x-a.x)*t;
        const y=reverse?m.y+(l.y-m.y)*(1-t)**2:m.y+(r.y-m.y)*t*t;
        pts.push({x,y});
      }
    }
    return pts;
  }
  function freehand(points) {
    if(points.length<3) return points;
    const out=[points[0]];
    for(let i=1;i<points.length-1;i++){
      const a=out.at(-1),b=points[i],c=lerp(b,points[i+1],0.5);
      for(let j=1;j<=4;j++){const t=j/4;out.push(lerp(lerp(a,b,t),lerp(b,c,t),t));}
    }
    out.push(points.at(-1));return out;
  }
  function frame(x,y) {
    const corners=[{x:0,y:0},{x,y:0},{x,y},{x:0,y}];
    return ['@quantity','@right','@top','@price'].map((id,i)=>({id,points:[corners[i],corners[(i+1)%4]]}));
  }
  function crossings(a,b){
    const list=[];
    for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++) {
      for(const p of hits(a[i-1],a[i],b[j-1],b[j]))if(!list.some(q=>near(p,q)))list.push(p);
    }
    return list;
  }
  function inside(p,poly){
    let result=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) result=!result;
    }
    return result;
  }
  // Split every stroke at crossings, then follow the edge immediately clockwise
  // from each reverse edge. Each bounded face is traversed counterclockwise.
  function faces(paths,xmax,ymax){
    const segments=[];
    for(const {id,points} of paths)for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      if(!near(a,b))segments.push({id,a,b,cuts:[a,b]});
    }
    for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
      const s=segments[i],t=segments[j];
      for(const p of hits(s.a,s.b,t.a,t.b)){s.cuts.push(p);t.cuts.push(p);}
    }
    const vertices=new Map(),edges=[];
    function vertex(p){
      const key=Math.round(p.x*1e6)+','+Math.round(p.y*1e6);
      if(!vertices.has(key))vertices.set(key,{...p,out:[]});
      return vertices.get(key);
    }
    for(const s of segments){
      const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y;
      s.cuts.sort((a,b)=>(a.x-b.x)*dx+(a.y-b.y)*dy);
      for(let i=1;i<s.cuts.length;i++){
        const a=vertex(s.cuts[i-1]),b=vertex(s.cuts[i]),mid=lerp(a,b,.5);
        if(a===b||mid.x< -EPS||mid.x>xmax+EPS||mid.y< -EPS||mid.y>ymax+EPS||a.out.some(e=>e.to===b))continue;
        const f={from:a,to:b,id:s.id},r={from:b,to:a,id:s.id};
        f.rev=r;r.rev=f;a.out.push(f);b.out.push(r);edges.push(f,r);
      }
    }
    for(const v of vertices.values())v.out.sort((a,b)=>Math.atan2(a.to.y-v.y,a.to.x-v.x)-Math.atan2(b.to.y-v.y,b.to.x-v.x));
    const result=[];
    for(const start of edges){
      if(start.seen)continue;
      let e=start,area=0,cx=0,cy=0; const poly=[],ids=[];
      do{
        e.seen=true;const a=e.from,b=e.to,k=cross(a,b);
        poly.push({x:a.x,y:a.y});ids.push(e.id);area+=k;cx+=(a.x+b.x)*k;cy+=(a.y+b.y)*k;
        e=b.out[(b.out.indexOf(e.rev)+b.out.length-1)%b.out.length];
      }while(e!==start);
      if(area>EPS){
        const center={x:cx/(3*area),y:cy/(3*area)};
        const run=ids.filter((id,i)=>id!==ids[(i+ids.length-1)%ids.length]);
        const signature=(run.length?run.map((_,i)=>run.slice(i).concat(run.slice(0,i)).join('|')).sort()[0]:ids[0]);
        result.push({poly,center,signature,area:area/2});
      }
    }
    return result;
  }
  return {curve,freehand,frame,faces,nearest,crossings,inside,clamp,lerp};
})();
if(typeof module!=='undefined') module.exports=Geometry;
