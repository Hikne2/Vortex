// Module-level state
const keys = new Set();
const keysPressed = new Set();
const mouse = new Set();
const mousePressed = new Set();
let mouseX = 0;
let mouseY = 0;

// Gamepad state
let gamepad = null;
const gamepadButtons = new Set();
const gamepadButtonsPressed = new Set();

// Touch state
const touches = new Map(); // id -> {id, x, y}
const touchesPressed = new Set(); // ids of newly pressed touches

// Coordinate mapping
let offX = 0;
let offY = 0;
let scaleX = 1;
let scaleY = 1;
let isDebug = false;

const interceptors = new Set();

function handleInput(type, code, val) {
    for (const interceptor of interceptors) {
        if (interceptor(type, code, val)) return;
    }

    if (type === 'keydown') {
        if (!keys.has(code)) keysPressed.add(code);
        keys.add(code);
    } else if (type === 'keyup') {
        keys.delete(code);
    } else if (type === 'mousedown') {
        if (!mouse.has(code)) mousePressed.add(code);
        mouse.add(code);
    } else if (type === 'mouseup') {
        mouse.delete(code);
    }
}

window.addEventListener('keydown', e => {
    if (e.code === 'F11') return;
    if (e.code === 'F12' && isDebug) return;
    e.preventDefault();
    handleInput('keydown', e.code);
});
window.addEventListener('keyup', e => handleInput('keyup', e.code));

function updatePointer(e) {
    return {
        id: e.pointerId,
        x: (e.clientX - offX) * scaleX,
        y: (e.clientY - offY) * scaleY,
    };
}

window.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') {
        handleInput('mousedown', e.button);
    } else {
        e.preventDefault();
        if (!touches.has(e.pointerId)) touchesPressed.add(e.pointerId);
        touches.set(e.pointerId, updatePointer(e));
    }
});

window.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse') {
        handleInput('mouseup', e.button);
    } else {
        e.preventDefault();
        touches.delete(e.pointerId);
    }
});

window.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') {
        mouseX = e.clientX;
        mouseY = e.clientY;
    } else {
        e.preventDefault();
        if (touches.has(e.pointerId)) touches.set(e.pointerId, updatePointer(e));
    }
});

window.addEventListener('pointercancel', e => {
    if (e.pointerType !== 'mouse') {
        e.preventDefault();
        touches.delete(e.pointerId);
    }
});

window.addEventListener('blur', () => {
    keys.clear(); keysPressed.clear();
    mouse.clear(); mousePressed.clear();
    gamepadButtons.clear(); gamepadButtonsPressed.clear();
    // Don't clear touches, they might persist
});

// Gamepad Listeners
window.addEventListener('gamepadconnected', e => {
    if (!gamepad) gamepad = e.gamepad;
});
window.addEventListener('gamepaddisconnected', e => {
    if (gamepad && gamepad.index === e.gamepad.index) gamepad = null;
});

function pollGamepad() {
    if (!navigator.getGamepads) return;
    const gps = navigator.getGamepads();
    gamepad = gps[0] || gps[1] || gps[2] || gps[3] || null;

    if (gamepad) {
        gamepad.buttons.forEach((button, i) => {
            if (button.pressed) {
                if (!gamepadButtons.has(i)) gamepadButtonsPressed.add(i);
                gamepadButtons.add(i);
            } else {
                gamepadButtons.delete(i);
            }
        });
    }
}

async function init(ctx, config) {
    console.log("[Vortex.Input] Initializing...");
    isDebug = ctx.debug;

    try {
        const loop = await ctx.pack("Vortex.GameLoop");
        if (loop.onUpdate) loop.onUpdate(pollGamepad);
        if (loop.onPostUpdate) {
            loop.onPostUpdate(() => {
                keysPressed.clear();
                mousePressed.clear();
                gamepadButtonsPressed.clear();
                touchesPressed.clear();
            });
        }
    } catch (e) {
        console.warn("Vortex.Input: GameLoop not found, pressed states won't clear automatically");
    }

    return {
        isKeyDown: k => keys.has(k),
        isKeyPressed: k => keysPressed.has(k),
        isMouseDown: b => mouse.has(b),
        isMousePressed: b => mousePressed.has(b),
        getMousePos: () => ({ 
            x: (mouseX - offX) * scaleX, 
            y: (mouseY - offY) * scaleY 
        }),
        isGamepadButtonDown: i => gamepadButtons.has(i),
        isGamepadButtonPressed: i => gamepadButtonsPressed.has(i),
        getGamepadAxes: () => gamepad ? gamepad.axes : [0,0,0,0],
        isTouchActive: () => touches.size > 0,
        isTouchPressed: () => touchesPressed.size > 0,
        getTouches: () => Array.from(touches.values()),
        getPressedTouches: () => Array.from(touchesPressed).map(id => touches.get(id)).filter(Boolean),
        setOffset: (x, y, sx, sy) => { offX = x; offY = y; scaleX = sx; scaleY = sy; },
        // Returns true if input should be blocked
        addInterceptor: cb => interceptors.add(cb),
        removeInterceptor: cb => interceptors.delete(cb)
    };
}
export default init;
export const internal = init;