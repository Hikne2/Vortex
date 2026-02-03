export default class VFS {
    constructor() {
        this.files = new Map();
    }

    addFile(path, content) {
        this.files.set(this.normalize(path), content);
    }

    exists(path) {
        return this.files.has(this.normalize(path));
    }

    readFile(path) {
        const norm = this.normalize(path);
        if (!this.files.has(norm)) throw new Error(`File not found: ${path}`);
        return this.files.get(norm);
    }

    normalize(path) {
        // Ensure forward slashes and leading slash
        let p = path.replace(/\\/g, '/');
        if (!p.startsWith('/')) p = '/' + p;
        
        const parts = p.split('/');
        const stack = [];
        for (const part of parts) {
            if (part === '' || part === '.') continue;
            if (part === '..') {
                if (stack.length > 0) stack.pop();
            } else {
                stack.push(part);
            }
        }
        return '/' + stack.join('/');
    }

    resolve(path, importer) {
        if (path.startsWith('/')) return this.normalize(path);
        const base = importer ? importer.substring(0, importer.lastIndexOf('/')) : '';
        return this.normalize(base + '/' + path);
    }
}