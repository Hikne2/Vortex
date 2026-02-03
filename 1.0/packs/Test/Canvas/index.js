async function init(ctx, config) {
    console.log("[Test.Canvas] Initializing...");
    // Load dependency
    const screen = await ctx.pack("Test.Screen", { color: config.bgColor });
    
    const canvas = document.createElement('canvas');
    canvas.width = config.width || 800;
    canvas.height = config.height || 600;
    
    // Center and scale canvas while maintaining aspect ratio
    canvas.style.position = "absolute";
    canvas.style.top = "50%";
    canvas.style.left = "50%";
    canvas.style.transform = "translate(-50%, -50%)";
    canvas.style.imageRendering = "pixelated";

    const resize = () => {
        const aspect = canvas.width / canvas.height;
        const windowAspect = window.innerWidth / window.innerHeight;
        if (windowAspect > aspect) {
            canvas.style.height = "100%";
            canvas.style.width = "auto";
        } else {
            canvas.style.width = "100%";
            canvas.style.height = "auto";
        }
    };
    window.addEventListener('resize', resize);
    resize();
    
    screen.add(canvas);

    // Hook up input offsets
    try {
        const input = await ctx.pack("Vortex.Input");
        const updateOffset = () => {
            const rect = canvas.getBoundingClientRect();
            input.setOffset(
                rect.left, 
                rect.top, 
                canvas.width / rect.width, 
                canvas.height / rect.height
            );
        };
        new ResizeObserver(updateOffset).observe(canvas);
        updateOffset();
    } catch (e) {
        console.warn("Test.Canvas: Input pack not found, mouse coordinates might be wrong");
    }
    
    return {
        element: canvas,
        ctx: canvas.getContext('2d')
    };
}
export default init;
export const internal = init;
