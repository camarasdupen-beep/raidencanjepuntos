import pg from 'pg';
import {randomUUID,randomBytes} from 'node:crypto';
import {digest,hashPassword,verifyPassword,balanceAfter,validPassword,uuid} from './core.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||process.env.NETLIFY_DATABASE_URL,max:2,connectionTimeoutMillis:8000,idleTimeoutMillis:10000});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
async function loy(path,body){if(!process.env.LOYVERSE_TOKEN)fail(503,'Falta configurar la conexión con Loyverse');const r=await fetch('https://api.loyverse.com/v1.0/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.LOYVERSE_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});if(!r.ok)fail(502,'Loyverse no pudo completar la operación');return r.json();}
export default async function handler(req,context={}){
let c;
try{
if(!process.env.DATABASE_URL&&!process.env.NETLIFY_DATABASE_URL)fail(503,'La app todavía necesita configurar su base de datos');
const url=new URL(req.url),route=url.searchParams.get('action')||'me';
if(!['GET','POST'].includes(req.method))fail(405,'Método no permitido');
if(req.method==='POST'&&req.headers.get('origin')!==url.origin)fail(403,'Origen no permitido');
if(Number(req.headers.get('content-length')||0)>16384)fail(413,'Solicitud demasiado grande');
const b=req.method==='POST'?await req.json():{};
c=await pool.connect();
if(route==='login'&&req.method==='POST'){
const username=String(b.username||'').trim().toLowerCase();const key=digest((context.ip||'unknown')+':'+username),ipkey=digest('ip:'+(context.ip||'unknown'));
for(const k of [key,ipkey]){const {rows}=await c.query("INSERT INTO login_attempts VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.reset_at<now() THEN 1 ELSE login_attempts.attempts+1 END,reset_at=CASE WHEN login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE login_attempts.reset_at END RETURNING attempts",[k]);if(rows[0].attempts>(k===key?10:50))fail(429,'Demasiados intentos. Esperá 15 minutos');}
const {rows}=await c.query('SELECT * FROM users WHERE username=$1 AND active',[username]);const u=rows[0];if(!u||typeof b.password!=='string'||b.password.length>128||!verifyPassword(b.password,u.password))fail(401,'Usuario o contraseña incorrectos');
const token=randomBytes(32).toString('hex');await c.query("INSERT INTO sessions VALUES($1,$2,now()+interval '10 hours')",[digest(token),u.id]);return json({ok:true},200,{'Set-Cookie':`raiden_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=36000`});}
const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('raiden_session='))?.slice(15)||'';
const {rows:auth}=await c.query('SELECT u.id,u.name,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires>now() AND u.active',[digest(token)]);const user=auth[0];if(!user)fail(401,'Ingresá con tu usuario');
const admin=()=>{if(user.role!=='admin')fail(403,'Solo administración');};
if(route==='me')return json(user);
if(route==='logout'&&req.method==='POST'){await c.query('DELETE FROM sessions WHERE token=$1',[digest(token)]);return json({ok:true},200,{'Set-Cookie':'raiden_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});}
if(route==='rewards'&&req.method==='GET')return json((await c.query('SELECT * FROM rewards '+(user.role==='admin'?'':'WHERE active ')+'ORDER BY points')).rows);
if(route==='reward'&&req.method==='POST'){admin();if(!b.title?.trim()||b.title.length>100||!b.instruction?.trim()||b.instruction.length>300||!Number.isSafeInteger(b.points)||b.points<1||b.points>100000000)fail(400,'Revisá los datos del premio');const id=b.id||randomUUID();if(!uuid(id))fail(400,'Premio inválido');await c.query('INSERT INTO rewards VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET title=$2,points=$3,instruction=$4,active=$5',[id,b.title.trim(),b.points,b.instruction.trim(),b.active!==false]);return json({ok:true});}
if(route==='users'&&req.method==='GET'){admin();return json((await c.query('SELECT id,name,username,role,active FROM users ORDER BY name')).rows);}
if(route==='user'&&req.method==='POST'){admin();if(!/^[a-z0-9._-]{3,40}$/.test(b.username||'')||!b.name?.trim()||b.name.length>80||!['admin','employee'].includes(b.role))fail(400,'Datos de usuario inválidos');if(b.id===user.id)fail(400,'No podés modificar tu propia cuenta aquí');if((!b.id||b.password)&&!(b.role==='employee'?typeof b.password==='string'&&/^[0-9]{4}$/.test(b.password):validPassword(b.password)))fail(400,b.role==='employee'?'La contraseña de la empleada debe tener exactamente 4 números':'La contraseña de administración debe tener entre 12 y 128 caracteres');const id=b.id||randomUUID();if(!uuid(id))fail(400,'Usuario inválido');if(b.id){await c.query('UPDATE users SET name=$2,username=$3,role=$4,active=$5,password=COALESCE($6,password) WHERE id=$1',[id,b.name.trim(),b.username,b.role,b.active!==false,b.password?hashPassword(b.password):null]);await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);}else await c.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,true)',[id,b.username,b.name.trim(),hashPassword(b.password),b.role]);return json({ok:true});}
if(route==='customers'&&req.method==='GET'){
const q=(url.searchParams.get('q')||'').trim().toLocaleLowerCase();if(q.length<3)fail(400,'Ingresá al menos 3 caracteres');
// Loyverse has no general name search: paginate all customers; never claim complete partial results.
let cursor,found=[],pages=0;do{const data=await loy('customers?limit=250'+(cursor?'&cursor='+encodeURIComponent(cursor):''));for(const x of data.customers||[]){if([x.name,x.customer_code,x.phone_number].some(v=>String(v||'').toLocaleLowerCase().includes(q)))found.push({id:x.id,name:x.name,document:x.customer_code||'',points:x.total_points});}cursor=data.cursor;if(++pages>=30&&cursor)fail(422,'La agenda es demasiado grande para esta búsqueda. Se necesita habilitar un índice de clientes');}while(cursor);return json(found.slice(0,50));}
if(route==='customer'&&req.method==='GET'){const x=await loy('customers/'+encodeURIComponent(url.searchParams.get('id')||''));return json({id:x.id,name:x.name,document:x.customer_code||'',points:x.total_points});}
if(route==='history'&&req.method==='GET')return json((await c.query('SELECT r.*,u.name AS employee FROM redemptions r JOIN users u ON u.id=r.user_id '+(user.role==='admin'?'':'WHERE r.user_id=$1 ')+'ORDER BY created_at DESC LIMIT 200',user.role==='admin'?[]:[user.id])).rows);
if(route==='resolve'&&req.method==='POST'){admin();if(!uuid(b.id)||!['completed','failed'].includes(b.status)||typeof b.note!=='string'||b.note.trim().length<10||b.note.length>500)fail(400,'Agregá una explicación de la revisión');await c.query("UPDATE redemptions SET status=$2,resolution=$3 WHERE id=$1 AND status IN ('pending','review') AND created_at<now()-interval '2 minutes'",[b.id,b.status,b.note.trim()]);return json({ok:true});}
if(route==='redeem'&&req.method==='POST'){
if(!uuid(b.id)||!uuid(b.rewardId)||!uuid(b.customerId))fail(400,'Canje inválido');
await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[b.customerId]);
const prior=(await c.query('SELECT * FROM redemptions WHERE id=$1',[b.id])).rows[0];if(prior){if(prior.user_id!==user.id||prior.customer_id!==b.customerId||prior.reward_id!==b.rewardId)fail(409,'Operación incompatible');await c.query('COMMIT');return json(prior);}
if((await c.query("SELECT id FROM redemptions WHERE customer_id=$1 AND (status IN ('pending','review') OR created_at>now()-interval '30 seconds')",[b.customerId])).rowCount)fail(409,'Este cliente tiene un canje reciente o pendiente. Revisá el historial antes de continuar');
const reward=(await c.query('SELECT * FROM rewards WHERE id=$1 AND active FOR SHARE',[b.rewardId])).rows[0];if(!reward)fail(400,'Premio no disponible');
const customer=await loy('customers/'+b.customerId);const before=Number(customer.total_points),after=balanceAfter(before,reward.points);
await c.query("INSERT INTO redemptions(id,customer_id,customer_name,reward_id,reward_title,points,before_points,after_points,instruction,user_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')",[b.id,customer.id,customer.name,reward.id,reward.title,reward.points,before,after,reward.instruction,user.id]);
// Persist intent BEFORE external mutation. A crash/timeout leaves a durable block, never auto-retries.
await c.query('COMMIT');
try{
const update=Object.fromEntries(['id','name','email','phone_number','address','city','region','postal_code','country_code','customer_code','note'].filter(k=>customer[k]!==null&&customer[k]!==undefined).map(k=>[k,customer[k]]));
await loy('customers',{...update,total_points:after});
const verified=await loy('customers/'+customer.id);if(Number(verified.total_points)!==after)throw new Error('Saldo cambió durante el canje');
await c.query("UPDATE redemptions SET status='completed' WHERE id=$1",[b.id]);
}catch{await c.query("UPDATE redemptions SET status='review' WHERE id=$1",[b.id]);}
return json((await c.query('SELECT * FROM redemptions WHERE id=$1',[b.id])).rows[0]);}
fail(404,'Acción no disponible');
}catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});return json({error:e.status?e.message:e.message==='Saldo insuficiente o puntos inválidos'?e.message:'No se pudo completar. Revisá el historial antes de repetir un canje.'},e.status||500);}finally{c?.release();}}
export const config={path:'/api'};
