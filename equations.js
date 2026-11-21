// A linear expression is q*Q + p*P + c. Parse arithmetic directly so
// coursework notation such as 3(P - 23) works offline.
const MarketEquations = (() => {
  const scalar = c => ({q:0, p:0, c});
  const variable = a => a.q !== 0 || a.p !== 0;
  const scale = (a, k) => ({q:a.q*k, p:a.p*k, c:a.c*k});
  const sum = (a, b, sign) => ({q:a.q+sign*b.q, p:a.p+sign*b.p, c:a.c+sign*b.c});

  function expression(input) {
    const pattern = /\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[pq](?:_?[ds])?|[()+*/-]/iy;
    const tokens = [];
    while (pattern.lastIndex < input.length) {
      const token = pattern.exec(input);
      if (!token) throw Error('Use Q, P, numbers, and basic arithmetic.');
      if (token[0].trim()) tokens.push(token[0].toLowerCase());
    }
    let i = 0;
    function atom() {
      const t = tokens[i++];
      if (t === '-' || t === '+') return scale(atom(), t === '-' ? -1 : 1);
      if (t === '(') {
        const value = add();
        if (tokens[i++] !== ')') throw Error('Check the parentheses.');
        return value;
      }
      if (t && /^[pq]/.test(t)) return {q:Number(t[0]==='q'), p:Number(t[0]==='p'), c:0};
      if (t && Number.isFinite(Number(t))) return scalar(Number(t));
      throw Error('A number or variable is missing.');
    }
    function product() {
      let a = atom();
      while (i < tokens.length) {
        const op = tokens[i];
        if (op === '*' || op === '/') i++;
        else if (!(op === '(' || /^[pq]/.test(op))) break;
        const b = atom();
        if (op === '/') {
          if (variable(b) || b.c === 0) throw Error('Divide only by a nonzero number.');
          a = scale(a, 1/b.c);
        } else {
          if (variable(a) && variable(b)) throw Error('Enter a straight-line equation.');
          a = variable(b) ? scale(b,a.c) : scale(a,b.c);
        }
      }
      return a;
    }
    function add() {
      let a = product();
      while (tokens[i] === '+' || tokens[i] === '-') {
        const sign = tokens[i++] === '+' ? 1 : -1;
        a = sum(a,product(),sign);
      }
      return a;
    }
    const value = add();
    if (i !== tokens.length) throw Error('Check the operators and parentheses.');
    return value;
  }

  function parse(text) {
    const sides = text.normalize('NFKC').replace(/[−–—]/g,'-').replace(/[×·]/g,'*').replace(/÷/g,'/').split('=');
    if (sides.length !== 2) throw Error('Include one equals sign, for example Q = 136 − 2P.');
    const line = sum(expression(sides[0]),expression(sides[1]),-1);
    if (!Object.values(line).every(Number.isFinite)) throw Error('The coefficients are too large.');
    if (!variable(line)) throw Error('The equation must describe a line in Q and P.');
    return line;
  }

  const priceAt = (line,x) => -(line.c+line.q*x)/line.p;
  const quantityAt = (line,y) => -(line.c+line.p*y)/line.q;
  function ceiling(value) {
    const padded = value*1.1;
    const unit = 10**Math.floor(Math.log10(padded));
    const step = unit*(padded/unit < 2 ? .1 : .5);
    return Number((Math.ceil(padded/step)*step).toPrecision(12));
  }
  function segment(line,xmax,ymax) {
    // Intersect with each side of the first-quadrant viewport. A line along
    // an axis is valid; a line that only touches the origin has no segment.
    const pts = [];
    function include(x,y) {
      if (!Number.isFinite(x+y) || x < -1e-12*xmax || x > xmax*(1+1e-12) ||
          y < -1e-12*ymax || y > ymax*(1+1e-12)) return;
      x = Math.max(0,Math.min(x,xmax));
      y = Math.max(0,Math.min(y,ymax));
      if (!pts.some(p=>Math.abs(p.x-x)<1e-12*xmax && Math.abs(p.y-y)<1e-12*ymax)) pts.push({x,y});
    }
    if (line.p) { include(0,priceAt(line,0)); include(xmax,priceAt(line,xmax)); }
    if (line.q) { include(quantityAt(line,0),0); include(quantityAt(line,ymax),ymax); }
    return pts.sort((a,b)=>a.x-b.x || a.y-b.y);
  }
  function fit(entries) {
    const lines = entries.filter(e=>e.text.trim()).map(({name,text})=>{
      try {return {name,...parse(text)};}
      catch(error) {throw Error(name+': '+error.message);}
    });
    if (!lines.length) throw Error('Enter a supply or demand equation.');
    const quantities = [], prices = [];
    function landmark(x,y) {
      if (x>=0 && y>=0 && Number.isFinite(x) && Number.isFinite(y)) {
        quantities.push(x); prices.push(y);
      }
    }
    for (const line of lines) {
      if (line.q) landmark(quantityAt(line,0),0);
      if (line.p) landmark(0,priceAt(line,0));
    }
    if (lines.length===2) {
      const [a,b] = lines, det = a.q*b.p-b.q*a.p;
      if (det) landmark((a.p*b.c-b.p*a.c)/det,(b.q*a.c-a.q*b.c)/det);
    }
    let x = Math.max(0,...quantities), y = Math.max(0,...prices);
    // Rising lines sometimes have just one positive intercept. Sample farther
    // along the known axis to establish a useful scale for the other axis.
    if (!x && !y) x=10;
    if (!x) {
      y *= 2;
      x = Math.max(0,...lines.filter(l=>l.q).map(l=>quantityAt(l,y)));
    }
    if (!y) {
      x *= 2;
      y = Math.max(0,...lines.filter(l=>l.p).map(l=>priceAt(l,x)));
    }
    const xmax = ceiling(x||10), ymax = ceiling(y||10);
    if (![xmax,ymax].every(v=>Number.isFinite(v)&&v>0)) throw Error('These values exceed the graph scale.');
    const curves = lines.map(line=>{
      const pts = segment(line,xmax,ymax);
      if (pts.length!==2) throw Error(line.name+': the line needs a visible segment at nonnegative price and quantity.');
      return {name:line.name,pts};
    });
    return {xmax,ymax,curves};
  }
  return {fit};
})();
if (typeof module!=='undefined') module.exports=MarketEquations;
