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
