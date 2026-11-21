const test=require('node:test');
const assert=require('node:assert/strict');
const {fit}=require('./equations.js');
const G=require('./geometry.js');
const market=(demand,supply='')=>fit([{name:'Demand',text:demand},{name:'Supply',text:supply}]);

test('assignment curves include their intercepts and intersect at the exact market equilibrium',()=>{
  const result=market('Qd = 136 − 2P','Qs = 3P – 69');
  assert.deepEqual(result.curves[0].pts,[{x:0,y:68},{x:136,y:0}]);
  assert.deepEqual(result.curves[1].pts[0],{x:0,y:23});
  assert.deepEqual(G.crossings(...result.curves.map(o=>o.pts)),[{x:54,y:41}]);
  assert.ok(result.xmax>136 && result.xmax<=160 && result.ymax>68 && result.ymax<=80);
  assert.deepEqual(market('P = 68 - Q/2','P = 23 + Q/3'),result);
  assert.deepEqual(market('2P + Q_d = 136','Qₛ = 3(P - 23)'),result);
});

test('ranges adapt independently to different quantities and prices',()=>{
  const small=market('P = 0.06 - 0.01Q','P = .01Q');
  assert.ok(small.xmax>=6&&small.xmax<10&&small.ymax>=.06&&small.ymax<.1);
  const large=market('Q = 900000 - 2P','Q = P');
  assert.ok(large.xmax>=900000&&large.ymax>=450000);
  // For nearly parallel rising lines the positive crossing lies beyond the intercepts.
  const far=market('P = 2 + .99Q','P = Q');
  assert.ok(far.xmax>200&&far.ymax>200);
});

test('single, horizontal, vertical and parallel curves yield usable segments',()=>{
  for(const pair of [['','Qs=3P-69'],['P=3','Q=8'],['Q=5','Q=10'],['P=Q',''],['P=2','P=3']]){
    const result=market(...pair);
    for(const o of result.curves){
      assert.equal(o.pts.length,2);assert.notDeepEqual(o.pts[0],o.pts[1]);
      assert.ok(o.pts.every(p=>p.x>=0&&p.y>=0&&p.x<=result.xmax&&p.y<=result.ymax));
    }
  }
});

test('invalid expressions and curves outside quadrant one give a correction',()=>{
  for(const input of ['P = 3Q*Q','P = 1/Q','P = 4/0','P = Q +','P=Q=4','Q=Q','Q=-2-P','P = (4 - Q','Q = 2 3P','P = alert(2)']){
    assert.throws(()=>market(input),/Demand:/);
  }
  assert.throws(()=>market('',''),/Enter a supply or demand equation/);
});
