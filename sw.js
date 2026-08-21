/* ============================================================
   SERVICE WORKER (PWA)
   ------------------------------------------------------------
   Responsável por deixar o app disponível offline e instalável.

   Estratégia: NETWORK-FIRST com fallback para o cache.
   - Sempre busca a versão mais nova na rede (bom para desenvolvimento);
   - Se ficar offline, usa o que está no cache;
   - Respostas de sucesso são guardadas no cache automaticamente.

   DICA: se algo parecer "preso" no cache antigo, incremente o
   CACHE_VERSION abaixo e recarregue a página 2x.
   ============================================================ */

const CACHE_VERSION = 'v10';
const CACHE_NAME = `grupo-aureos-alerta-${CACHE_VERSION}`;

// Arquivos fixos do "app shell" (cacheados na instalação)
const APP_SHELL = [
    './',
    './index.html',
    './css/app.css?v=10',
    './js/config.js',
    './js/storage.js',
    './js/app.js',
    './pwa/manifest.webmanifest',
    './pwa/icons/icon-192.png',
    './pwa/icons/icon-512.png',
    './pwa/icons/icon-maskable-512.png',
    './pwa/phosphor/regular/style.css',
    './pwa/phosphor/regular/Phosphor.woff2',
    './pwa/phosphor/fill/style.css',
    './pwa/phosphor/fill/Phosphor-Fill.woff2',
    './pwa/phosphor/bold/style.css',
    './pwa/phosphor/bold/Phosphor-Bold.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
});

// A nova versão aguarda a confirmação do usuário no banner do aplicativo.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
    self.clients.claim();
});

// Estratégia: network-first com fallback para o cache
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // Navegações sempre caem no shell local quando a rede estiver indisponível.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', response.clone()));
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Só guarda respostas do tipo esperado. Isso impede que um
                // redirect de deploy salve index.html no lugar de CSS/JS.
                const contentType = response.headers.get('content-type') || '';
                const isStyle = url.pathname.endsWith('.css');
                const isScript = url.pathname.endsWith('.js');
                const validType = (!isStyle || contentType.includes('text/css'))
                    && (!isScript || /javascript|ecmascript/.test(contentType));
                if (response.ok && validType && !url.pathname.includes('/api/')) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
