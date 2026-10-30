// No cache de API, clientes, saldos ni sesiones. La caja siempre usa datos de servidor.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>new Response('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width"><title>Raiden · Sin conexión</title><h1>Raiden · Canjes</h1><p>Necesitás internet para consultar puntos y canjear premios.</p><button onclick="location.reload()">Volver a intentar</button>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));});
