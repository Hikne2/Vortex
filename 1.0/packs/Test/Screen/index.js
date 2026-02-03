async function init(ctx, config) {
    console.log("[Test.Screen] Initializing...");
    const div = document.createElement('div');
    div.id = "vortex-screen";
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.overflow = "hidden";
    div.style.backgroundColor = config.color || (ctx.debug ? "#111" : "#000");
    ctx.root.appendChild(div);
    
    return {
        element: div,
        add: (el) => div.appendChild(el)
    };
}
export default init;
export const internal = init;
