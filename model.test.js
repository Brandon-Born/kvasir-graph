const test=require('node:test');
const assert=require('node:assert/strict');
globalThis.Geometry=require('./geometry.js');
const M=require('./model.js');
const workspace=()=>{const g=M.demo();return {version:1,graphs:[g],active:g.id};};

test('the demo workspace and a JSON round trip are valid',()=>{
  const w=workspace();
  assert.ok(M.validWorkspace(w));
  assert.ok(M.validWorkspace(JSON.parse(JSON.stringify(w))));
});

test('optional fields may be absent or null',()=>{
  const w=workspace(),[line]=w.graphs[0].objects;
  line.fontSize=null;line.labelAt=null;delete line.caption;w.graphs[0].xFontSize=null;
  assert.ok(M.validWorkspace(w));
});

test('fields the editor reads are type-checked',()=>{
  const broken=[
    w=>{w.graphs[0].objects[0].caption=5;},
    w=>{w.graphs[0].objects[0].labelAt={x:'a',y:1};},
    w=>{w.graphs[0].objects[0].color=['#fff'];},
    w=>{w.graphs[0].objects[0].fontSize='big';},
    w=>{w.graphs[0].objects.find(o=>o.kind==='region').pieces[0].signature=undefined;},
    w=>{w.graphs[0].objects.find(o=>o.kind==='point').pts[0].ref={a:7};},
    w=>{w.graphs[0].objects.push(null);},
    w=>{w.graphs[0].xFontSize='19';},
    w=>{w.version=2;}
  ];
  for(const breakIt of broken){const w=workspace();breakIt(w);assert.equal(M.validWorkspace(w),false,breakIt.toString());}
});

test('equilibrium anchors E and both guides to the crossing',()=>{
  const g=M.blank('t',150,80);
  const d=M.shape('line','Demand',[{x:0,y:68},{x:136,y:0}]),s=M.shape('line','Supply',[{x:0,y:23},{x:150,y:73}]);
  g.objects.push(d,s);
  const added=M.equilibrium(g,d.id,s.id);
  g.objects.push(...added);
  const {resolved}=M.resolve(g),[h,v,e]=added.map(o=>resolved.get(o.id));
  const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' vs '+b);
  close(e.pts[0].x,54);close(e.pts[0].y,41);
  close(h.pts[0].x,0);close(h.pts[0].y,41);close(v.pts[0].x,54);close(v.pts[0].y,0);
  // Moving supply moves E and the guides with it.
  s.pts=[{x:0,y:0},{x:150,y:75}];
  const moved=M.resolve(g).resolved;
  close(moved.get(e.id).pts[0].y,moved.get(h.id).pts[0].y);
  close(moved.get(e.id).pts[0].x,moved.get(v.id).pts[0].x);
  assert.ok(M.validWorkspace({version:1,graphs:[g],active:g.id}));
  assert.equal(M.equilibrium(g,d.id,'missing'),null);
});
