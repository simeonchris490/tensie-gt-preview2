'use strict';
// Tensie GT development backend. Node.js 18+; built-in modules only.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ bookings: [], builds: {}, votes: {}, subscribers: [], users: [], sessions: [] }, null, 2));
let db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
for (const k of ['bookings','builds','votes','subscribers','users','sessions']) if (!db[k]) db[k] = k === 'builds' || k === 'votes' ? {} : [];
function save() { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, DB_FILE); }
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
function send(res, status, data, headers={}) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-store',...headers}); res.end(JSON.stringify(data)); }
function readBody(req) { return new Promise((resolve,reject)=>{ let s=''; req.on('data',c=>{s+=c; if(s.length>20000){reject(new Error('Request too large')); req.destroy();}}); req.on('end',()=>{try{resolve(JSON.parse(s||'{}'));}catch{reject(new Error('Invalid JSON'));}}); req.on('error',reject); }); }
const hits = new Map();
function rateLimit(req,res) { const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'local').toString().split(',')[0]; const now=Date.now(); const a=(hits.get(ip)||[]).filter(t=>now-t<60000); if(a.length>=30){send(res,429,{error:'Too many requests. Please wait a minute.'});return false;} a.push(now); hits.set(ip,a); return true; }
const allowedSlugs = new Set(['tensie-gt','tensie-vanta','tensie-halo','tensie-monolith','tensie-sweep']);
const paints = ['Arctic White','Signal Red','Onyx Black']; const wheels = ['5 spoke','10 spoke'];
function validBuild(b){return Number.isInteger(b.paint)&&b.paint>=0&&b.paint<paints.length&&Number.isInteger(b.wheel)&&b.wheel>=0&&b.wheel<wheels.length;}
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const cookieName = 'tensie_session';
function cookie(req){const raw=req.headers.cookie||'';for(const part of raw.split(';')){const [k,...v]=part.trim().split('=');if(k===cookieName)return decodeURIComponent(v.join('='));}return '';}
function sessionUser(req){const token=cookie(req);if(!token)return null;const key=hash(token),now=Date.now();const s=db.sessions.find(x=>x.tokenHash===key&&x.expiresAt>now);if(!s)return null;return db.users.find(u=>u.id===s.userId)||null;}
function sessionCookie(token,maxAge=60*60*24*7){return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${IS_PROD?'; Secure':''}`;}
function clearCookie(){return `${cookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${IS_PROD?'; Secure':''}`;}
function publicUser(u){return {id:u.id,name:u.name,email:u.email,role:u.role};}
function makeSession(user){const token=crypto.randomBytes(32).toString('base64url');db.sessions=db.sessions.filter(s=>s.expiresAt>Date.now()&&s.userId!==user.id);db.sessions.push({tokenHash:hash(token),userId:user.id,expiresAt:Date.now()+7*24*60*60*1000});save();return token;}
function passwordHash(password,salt=crypto.randomBytes(16).toString('hex')){return new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(e,key)=>e?reject(e):resolve({salt,hash:key.toString('hex')})));}
async function passwordMatches(password,user){const got=await passwordHash(password,user.salt);const a=Buffer.from(got.hash,'hex'),b=Buffer.from(user.passwordHash,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b);}
async function bootstrapAdmin(){const email=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),password=String(process.env.ADMIN_PASSWORD||'');if(!email&&!password)return;if(!email||password.length<12){console.error('ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters are both required.');return;}let admin=db.users.find(u=>u.role==='admin');if(admin){console.log('An admin account already exists; environment credentials will not overwrite it.');return;}const p=await passwordHash(password);db.users.push({id:crypto.randomUUID(),name:'Tensie GT Admin',email,salt:p.salt,passwordHash:p.hash,role:'admin',createdAt:new Date().toISOString()});save();console.log('Initial Tensie GT admin account created from environment settings.');}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET' && url.pathname==='/api/health') return send(res,200,{ok:true,service:'Tensie GT backend'});
  if(url.pathname.startsWith('/api/')) {
    if(!rateLimit(req,res)) return;
    try {
      if(req.method==='POST' && url.pathname==='/api/auth/register'){
        const b=await readBody(req),name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
        if(name.length<2||name.length>80||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>160||password.length<10||password.length>200)return send(res,400,{error:'Enter a name, valid email and password of at least 10 characters.'});
        if(db.users.some(u=>u.email===email))return send(res,409,{error:'An account with this email already exists. Please sign in.'});
        const p=await passwordHash(password),user={id:crypto.randomUUID(),name,email,salt:p.salt,passwordHash:p.hash,role:'customer',createdAt:new Date().toISOString()};db.users.push(user);const token=makeSession(user);return send(res,201,{ok:true,user:publicUser(user)},{'Set-Cookie':sessionCookie(token)});
      }
      if(req.method==='POST' && url.pathname==='/api/auth/login'){
        const b=await readBody(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),user=db.users.find(u=>u.email===email);
        if(!user||!(await passwordMatches(password,user)))return send(res,401,{error:'Email or password is incorrect.'});
        const token=makeSession(user);return send(res,200,{ok:true,user:publicUser(user)},{'Set-Cookie':sessionCookie(token)});
      }
      if(req.method==='POST' && url.pathname==='/api/auth/logout'){
        const token=cookie(req);db.sessions=db.sessions.filter(s=>s.tokenHash!==hash(token));save();return send(res,200,{ok:true},{'Set-Cookie':clearCookie()});
      }
      if(req.method==='GET' && url.pathname==='/api/auth/me'){
        const user=sessionUser(req);return user?send(res,200,{user:publicUser(user)}):send(res,401,{error:'Not signed in.'});
      }
      if(req.method==='GET' && url.pathname==='/api/admin/summary'){
        const user=sessionUser(req);if(!user||user.role!=='admin')return send(res,403,{error:'Admin access required.'});
        return send(res,200,{bookings:db.bookings.length,customers:db.users.filter(u=>u.role==='customer').length,subscribers:db.subscribers.length});
      }
      if(req.method==='POST' && url.pathname==='/api/bookings') {
        const b=await readBody(req); const name=String(b.name||'').trim(), phone=String(b.phone||'').trim(), date=String(b.date||'');
        if(name.length<2||name.length>100||phone.length<7||phone.length>30||!/^[0-9+() .-]+$/.test(phone)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!validBuild(b)) return send(res,400,{error:'Please enter a valid name, phone number, date and vehicle build.'});
        if(date < new Date().toISOString().slice(0,10)) return send(res,400,{error:'Please choose today or a future date.'});
        const item={id:crypto.randomUUID(),name,phone,date,paint:paints[b.paint],wheel:wheels[b.wheel],createdAt:new Date().toISOString(),status:'pending'}; db.bookings.push(item); save(); return send(res,201,{ok:true,message:'Your test-drive request has been saved. The dealer will contact you to confirm.',id:item.id});
      }
      if(req.method==='POST' && url.pathname==='/api/builds') { const b=await readBody(req); if(!validBuild(b))return send(res,400,{error:'Invalid vehicle build.'}); let id; do{id=crypto.randomBytes(4).toString('hex')}while(db.builds[id]); db.builds[id]={paint:b.paint,wheel:b.wheel,createdAt:new Date().toISOString()};save();return send(res,201,{id}); }
      if(req.method==='GET' && /^\/api\/builds\/[a-f0-9]{8}$/.test(url.pathname)) { const id=url.pathname.split('/').pop(),b=db.builds[id]; return b?send(res,200,{paint:b.paint,wheel:b.wheel}):send(res,404,{error:'Build not found'}); }
      if(req.method==='GET' && url.pathname==='/api/votes') return send(res,200,db.votes);
      if(req.method==='POST' && url.pathname==='/api/votes') { const b=await readBody(req); if(!allowedSlugs.has(b.slug))return send(res,400,{error:'Unknown concept.'}); db.votes[b.slug]=(db.votes[b.slug]||0)+1;save();return send(res,200,{count:db.votes[b.slug]}); }
      if(req.method==='GET' && url.pathname==='/api/cars') return send(res,200,[]);
      if(req.method==='POST' && url.pathname==='/api/subscribe') { const b=await readBody(req),email=String(b.email||'').trim().toLowerCase(); if(email.length>120||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return send(res,400,{error:'Please enter a valid email address.'}); if(!db.subscribers.some(x=>x.email===email))db.subscribers.push({email,createdAt:new Date().toISOString()});save();return send(res,201,{ok:true}); }
      if(req.method==='POST' && url.pathname==='/api/chat') { const b=await readBody(req),q=String(b.message||'').trim().slice(0,500),s=b.state||{}; if(!q)return send(res,400,{error:'Please enter a message.'}); const t=q.toLowerCase(); let reply='I can help with paint, wheels, price, payment, specifications and test-drive booking. Try asking about one of those.'; let action=null;
        if(/red/.test(t)){action={type:'paint',index:1};reply='I have selected Signal Red for your build.';} else if(/white/.test(t)){action={type:'paint',index:0};reply='I have selected Arctic White for your build.';} else if(/black/.test(t)){action={type:'paint',index:2};reply='I have selected Onyx Black for your build.';} else if(/10.?spoke/.test(t)){action={type:'wheel',index:1};reply='I have switched to the 10 spoke wheels.';} else if(/5.?spoke/.test(t)){action={type:'wheel',index:0};reply='I have switched to the 5 spoke wheels.';} else if(/book|test.?drive|appointment/.test(t)){action={type:'scroll',id:'book'};reply='Choose a preferred date and submit the test-drive request. Your current build will be included.';} else if(/spec|horsepower|engine|speed/.test(t)){action={type:'scroll',id:'specs'};reply='The page lists the Tensie GT specifications: 3.0 L turbocharged inline-six, 340 hp, rear-wheel drive and 0–100 km/h in 4.9 seconds.';} else if(/price|cost|how much/.test(t)){reply='The displayed base price is USD 68,500 before paint and wheel options. The live total is shown in the build section.';} else if(/hello|^hi\b|^hey\b/.test(t)){reply='Hello! I am Tess. I can help customise the Tensie GT, explain its displayed specifications or guide you through booking a test drive.';}
        return send(res,200,{reply,action}); }
      return send(res,404,{error:'API route not found.'});
    } catch(e) { return send(res,400,{error:e.message==='Request too large'?'Request too large.':'Could not process that request.'}); }
  }
  let pathname=decodeURIComponent(url.pathname); if(pathname==='/')pathname='/index.html'; const file=path.resolve(ROOT,'.'+pathname);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(file,(err,buf)=>{if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(buf);});
});
bootstrapAdmin().then(()=>server.listen(PORT,'0.0.0.0',()=>console.log(`Tensie GT running at http://localhost:${PORT}`))).catch(e=>{console.error('Admin setup failed',e);process.exit(1)});
