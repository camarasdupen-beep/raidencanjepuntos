import {scryptSync,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function hashPassword(p){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex');}
export function verifyPassword(p,h){try{const [s,v]=h.split(':');const a=scryptSync(p,s,64),b=Buffer.from(v,'hex');return a.length===b.length&&timingSafeEqual(a,b);}catch{return false;}}
export function balanceAfter(balance,points){if(!Number.isFinite(balance)||!Number.isSafeInteger(points)||points<1||balance<points)throw new Error('Saldo insuficiente o puntos inválidos');return balance-points;}
export function validPassword(p){return typeof p==='string'&&p.length>=12&&p.length<=128;}
export const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
