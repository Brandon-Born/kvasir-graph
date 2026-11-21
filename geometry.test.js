const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./geometry.js');
const segment = (id,x1,y1,x2,y2) => ({id,points:[{x:x1,y:y1},{x:x2,y:y2}]});
const areaAt = (faces,x,y) => faces.find(f=>G.inside({x,y},f.poly)).area;
const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-6,actual+' vs '+expected);

test('A price guide separates surplus at the competitive equilibrium',()=>{
  const d=segment('D',0,68,136,0),s=segment('S',0,23,150,73);
  const [e]=G.crossings(d.points,s.points);
  close(e.x,54);close(e.y,41);
  const h=segment('P',0,e.y,e.x,e.y);
  const faces=G.faces([...G.frame(150,80),d,s,h],150,80);
  close(areaAt(faces,6,48),.5*54*27);
  close(areaAt(faces,6,35),.5*54*18);
  close(faces.reduce((sum,f)=>sum+f.area,0),150*80);
});

test('Monopoly welfare can span both sides of the marginal revenue curve',()=>{
  const paths=[...G.frame(150,80),segment('D',0,60,120,0),segment('MR',0,60,60,0),
    segment('MC',0,0,150,75),segment('Pm',0,40,40,40),segment('Qm',40,0,40,40)];
  const faces=G.faces(paths,150,80);
  close(areaAt(faces,5,52)+areaAt(faces,22,45),400);
  close(areaAt(faces,5,20)+areaAt(faces,35,35),1200);
  close(areaAt(faces,45,30),200);
});

test('A U-shaped curve keeps its minimum at the editable middle handle',()=>{
  const min={x:45,y:14},pts=G.curve({kind:'u',pts:[{x:12,y:31},min,{x:79,y:50}]});
  assert.deepEqual(pts.reduce((low,p)=>p.y<low.y?p:low),min);
  assert.ok(pts.every((p,i)=>!i||p.x>pts[i-1].x));
});
