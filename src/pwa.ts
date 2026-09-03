const MAP_SERVICE_WORKER_SCOPE = "/";

async function registerMapServiceWorker() {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
        registrations.map(async (registration) => {
            const activeScript = registration.active?.scriptURL;
            const scopePath = new URL(registration.scope).pathname;
            if (
                activeScript?.endsWith("/sw.js") &&
                scopePath !== MAP_SERVICE_WORKER_SCOPE
            ) {
                await registration.unregister();
            }
        }),
    );

    const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: MAP_SERVICE_WORKER_SCOPE,
    });
    console.log("SW registered:", registration.scope);
    window.setInterval(() => void registration.update(), 60 * 60 * 1000);
}

if ("serviceWorker" in navigator) {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        window.location.reload();
    });
    void registerMapServiceWorker().catch((error) =>
        console.error("SW registration failed", error),
    );
}
