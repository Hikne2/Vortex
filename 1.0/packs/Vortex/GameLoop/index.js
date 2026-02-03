// Module-level state to ensure singleton behavior across user/internal calls
let running = false;
let lastTime = 0;
const listeners = new Set();
const postListeners = new Set();

function loop(time) {
    if (!running) return;
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    for (const listener of listeners) {
        listener(dt);
    }

    for (const listener of postListeners) {
        listener(dt);
    }

    requestAnimationFrame(loop);
}

async function init(ctx, config) {
    console.log("[Vortex.GameLoop] Initializing...");

    return {
        start: () => {
            if (running) return;
            running = true;
            lastTime = performance.now();
            requestAnimationFrame(loop);
        },
        stop: () => {
            running = false;
        },
        onUpdate: (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        onPostUpdate: (cb) => {
            postListeners.add(cb);
            return () => postListeners.delete(cb);
        }
    };
}
export default init;
export const internal = init;