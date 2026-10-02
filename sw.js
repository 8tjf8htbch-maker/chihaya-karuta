const CACHE='kokudai-practice-v33';
const ASSETS=['./','./index.html','./styles.css','./app.js?v=20261002-19','./extensions.js?v=20261002-11','./menu-fix.js?v=20261002-8','./pairing-v2.js?v=20261002-4','./manifest.webmanifest','./supabase-config.js?v=20261002-1'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

  // 大会データは常に最新を取得する。古いJSONをService Workerから返さない。
  if(url.pathname.endsWith('/data/tournaments.json')){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .catch(()=>caches.match(event.request))
    );
    return;
  }

  const isAppAsset=['document','script','style'].includes(event.request.destination) ||
    url.pathname.endsWith('.html') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js');

  if(isAppAsset){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
          return response;
        })
        .catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});