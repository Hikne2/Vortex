import './lib/fflate/index.js';
import { inflate } from './lib/pako/index.js';
import VFS from './vfs.js';

const fflate = self.fflate;

function injectSystem() {
    // Meta viewport for mobile
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = "viewport";
        document.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";

    // Styles for native feel
    const css = `
        html, body {
            background-color: #000;
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            user-select: none;
            -webkit-user-select: none;
            -webkit-touch-callout: none;
            overscroll-behavior: none;
            touch-action: none;
        }
        img {
            -webkit-user-drag: none;
            user-drag: none;
        }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // Prevent gesture zooming on Safari
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    // Block context menu
    document.addEventListener('contextmenu', (e) => e.preventDefault());
}

export async function dev() {
    let vortexParam = new URLSearchParams(window.location.search).get('vortex');
    
    if (!vortexParam && window.location.hash) {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        vortexParam = params.get('vortex');
    }
    
    if (!vortexParam) {
        console.error("No vortex param found");
        return;
    }

    let options;
    try {
        const json = atob(vortexParam);
        options = JSON.parse(json);
    } catch (e) {
        console.error("Failed to parse options", e);
        return;
    }

    // Reconstruct Blob URL
    let url = options.u;
    let protocol = '';
    if (url.startsWith('h')) {
        protocol = 'http://';
        url = url.substring(1);
    } else if (url.startsWith('s')) {
        protocol = 'https://';
        url = url.substring(1);
    }
    url = 'blob:' + protocol + url;

    await setup({
        bundle: url,
        debug: options.d === 1
    });
}

export async function setup(config) {
    injectSystem();

    const url = config.bundle;
    if (!url) {
        console.error("No bundle URL provided");
        return;
    }

    // Fetch bundle
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    // Decompress
    // 1. Pako inflate
    const inflated = inflate(new Uint8Array(buffer));
    
    // 2. Unzip
    const unzipped = fflate.unzipSync(inflated);

    // 3. Setup VFS
    const vfs = new VFS();
    
    // File 0: Manifest
    const manifestContent = new TextDecoder().decode(unzipped['0']);
    const manifest = manifestContent.split('|');
    const version = manifest[0];
    
    // File 1: JS Bundle
    const jsCode = new TextDecoder().decode(unzipped['1']);

    // Other files
    for (const filename in unzipped) {
        if (filename === '0' || filename === '1') continue;
        // Map numeric filename back to original path using manifest
        // Manifest: [version, pathForFile2, pathForFile3, ...]
        const originalPath = manifest[parseInt(filename) - 1];
        if (originalPath) {
            vfs.addFile(originalPath, unzipped[filename]);
        }
    }

    console.log(`%cVortex Engine`, `font-weight: bold; font-size: 20px; color: #0e639c;`);
    console.log(`%cv${version}`, `font-style: italic; color: #888;`);

    const packCache = new Map(); // Map<id, { module, userApi, internalApi }>
    const loadingPacks = new Set();
    let gameName = "Untitled Game";
    const isDebug = config.debug || false;

    function getStorageKey(key) {
        const v = version;
        const g = btoa(gameName.replace(/ /g, ''));
        const k = btoa(key);
        return `Vortex-${v}-${g}-${k}`;
    }

    globalThis.Vortex = {
        version: version,
        init: (cfg) => {
            if (cfg.name) document.title = cfg.name;
            if (cfg.name) gameName = cfg.name;
            if (cfg.icon) {
                let link = document.querySelector("link[rel~='icon']");
                if (!link) {
                    link = document.createElement('link');
                    link.rel = 'icon';
                    document.head.appendChild(link);
                }
                if (cfg.icon instanceof Image) {
                    link.href = cfg.icon.src;
                } else if (typeof cfg.icon === 'string') {
                    link.href = cfg.icon;
                }
            }
        },
        file: (path, type) => {
            const buffer = vfs.readFile(path);
            if (!type) return buffer;
            
            const t = type.toLowerCase();
            if (t === 'text') return new TextDecoder().decode(buffer);
            if (t === 'json') return JSON.parse(new TextDecoder().decode(buffer));
            
            const ext = path.split('.').pop().toLowerCase();
            let mime = 'application/octet-stream';

            if (t === 'image') {
                if (ext === 'svg') mime = 'image/svg+xml';
                else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
                else mime = 'image/png';
                
                const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
                const img = new Image();
                img.src = url;
                return img;
            }
            if (t === 'audio') {
                if (ext === 'wav') mime = 'audio/wav';
                else if (ext === 'ogg') mime = 'audio/ogg';
                else mime = 'audio/mpeg';
                
                return new Audio(URL.createObjectURL(new Blob([buffer], { type: mime })));
            }
            if (t === 'video') {
                if (ext === 'webm') mime = 'video/webm';
                else mime = 'video/mp4';
                
                const vid = document.createElement('video');
                vid.src = URL.createObjectURL(new Blob([buffer], { type: mime }));
                return vid;
            }
            return buffer;
        },
        pack: (packId, config) => loadPack(packId, config, true),
        storage: {
            get: (key) => {
                const v = localStorage.getItem(getStorageKey(key));
                return v ? atob(v) : null;
            },
            set: (key, val) => localStorage.setItem(getStorageKey(key), btoa(val)),
            has: (key) => localStorage.getItem(getStorageKey(key)) !== null
        }
    };

    function createCtx(packId, config) {
        return {
            root: document.body,
            debug: isDebug,
            file: globalThis.Vortex.file,
            pack: (id, cfg) => loadPack(id, cfg, false),
            storage: globalThis.Vortex.storage
        };
    }

    async function loadPack(packId, config = {}, isUser) {
        if (loadingPacks.has(packId)) throw new Error(`Circular dependency detected for pack ${packId}`);
        
        let cache = packCache.get(packId);
        
        if (!cache) {
            loadingPacks.add(packId);
            try {
                const path = `/packs/${packId.replace('.', '/')}/index.js`;
                let module;
                if (vfs.exists(path)) {
                    const content = vfs.readFile(path);
                    const blob = new Blob([content], { type: 'application/javascript' });
                    const url = URL.createObjectURL(blob);
                    module = await import(url);
                    URL.revokeObjectURL(url);
                } else {
                    module = await import(new URL("."+path, import.meta.url).href);
                }
                cache = { module, userApi: null, internalApi: null };
                packCache.set(packId, cache);
            } finally {
                loadingPacks.delete(packId);
            }
        }

        const ctx = createCtx(packId, config);

        if (isUser) {
            if (!cache.userApi) {
                if (typeof cache.module.default !== 'function') throw new Error(`Pack ${packId} missing default export`);
                cache.userApi = await cache.module.default(ctx, config);
            }
            return cache.userApi;
        } else {
            if (!cache.internalApi) {
                const fn = cache.module.internal || cache.module.default;
                if (typeof fn !== 'function') throw new Error(`Pack ${packId} missing internal/default export`);
                cache.internalApi = await fn(ctx, config);
            }
            return cache.internalApi;
        }
    };

    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = jsCode;
    document.body.appendChild(script);
}