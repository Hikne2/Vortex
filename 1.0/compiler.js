import esbuild from './lib/esbuild-wasm/index.js';
import './lib/fflate/index.js';
import { deflate } from './lib/pako/index.js';

const fflate = self.fflate;
let esbuildInitialized = false;

async function initEsbuild() {
    if (!esbuildInitialized) {
        await esbuild.initialize({
            wasmURL: new URL('./lib/esbuild-wasm/esbuild.wasm', import.meta.url).href
        });
        esbuildInitialized = true;
    }
}

export async function compile(vfs, options = {}) {
    await initEsbuild();

    // 1. Load Config
    let config = {
        name: "Untitled Game",
        scriptsRoot: "/scripts/",
        entry: "main.ts",
        ignore: [],
        packs: []
    };

    const configPath = '/vortex.json';
    if (vfs.exists(configPath)) {
        try {
            const content = new TextDecoder().decode(vfs.readFile(configPath));
            const json = JSON.parse(content);
            config = { ...config, ...json };
        } catch (e) {
            console.warn("Failed to parse vortex.json, using defaults.", e);
        }
    }

    // Normalize scriptsRoot
    if (!config.scriptsRoot.startsWith('/')) config.scriptsRoot = '/' + config.scriptsRoot;
    if (!config.scriptsRoot.endsWith('/')) config.scriptsRoot += '/';

    // 2. Bundle Scripts
    const entryPoint = vfs.resolve(config.entry, config.scriptsRoot);
    
    const vfsPlugin = {
        name: 'vfs',
        setup(build) {
            build.onResolve({ filter: /.*/ }, args => {
                // External libs
                if (args.path.startsWith('/lib/')) {
                   return { path: args.path, external: true };
                }

                const resolved = vfs.resolve(args.path, args.importer);
                
                // Confinement check
                if (!resolved.startsWith(config.scriptsRoot) && !args.path.startsWith('/lib/')) {
                    return { errors: [{ text: `Import ${args.path} escapes scripts root ${config.scriptsRoot}` }] };
                }

                return { path: resolved, namespace: 'vfs' };
            });

            build.onLoad({ filter: /.*/, namespace: 'vfs' }, args => {
                if (!vfs.exists(args.path)) {
                    return { errors: [{ text: `File not found: ${args.path}` }] };
                }

                const content = vfs.readFile(args.path);
                const ext = args.path.split('.').pop();
                let loader = 'default';
                if (ext === 'ts' || ext === 'tsx') loader = 'ts';
                if (ext === 'js' || ext === 'jsx') loader = 'js';
                if (ext === 'json') loader = 'json';
                if (ext === 'css') loader = 'css';
                if (ext === 'txt') loader = 'text';

                return {
                    contents: content,
                    loader: loader
                };
            });
        },
    };

    const buildResult = await esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        write: false,
        format: 'esm',
        minify: options.minify || false,
        plugins: [vfsPlugin],
        outfile: 'bundle.js'
    });

    if (buildResult.errors.length > 0) {
        throw new Error("Build failed: " + buildResult.errors.map(e => e.text).join(', '));
    }

    const jsCode = buildResult.outputFiles[0].contents;

    // 3. Package Assets
    const zipData = {};
    const manifest = ["1.0.0"]; // Version

    // File 1: JS Bundle
    zipData['1'] = jsCode;

    let fileIndex = 2;
    for (const [path, content] of vfs.files.entries()) {
        // Ignore config file
        if (path === configPath) continue;
        // Ignore scripts
        if (path.startsWith(config.scriptsRoot)) continue;
        // Check ignore list (simple exact match or startsWith for folders for now)
        if (config.ignore.some(i => path.includes(i))) continue;

        zipData[fileIndex.toString()] = content;
        manifest.push(path);
        fileIndex++;
    }

    // File 0: Manifest
    zipData['0'] = fflate.strToU8(manifest.join('|'));

    // 4. Compress
    // Create Zip
    const zipFile = fflate.zipSync(zipData, { level: 0 }); // Store only, we deflate next
    
    // Deflate with Pako
    const finalBundle = deflate(zipFile);

    return {
        buffer: finalBundle,
        name: config.name.replace(/\s+/g, '') + '.vortex'
    };
}