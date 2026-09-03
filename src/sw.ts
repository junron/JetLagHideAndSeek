/// <reference lib="webworker" />

export {};

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
    kind: "question_received" | "answer_received" | "answer_due_soon";
    gameCode: string;
    questionId: string;
    title: string;
    body: string;
    url: string;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event: ExtendableEvent) => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(
                        (cacheName) =>
                            cacheName.startsWith("workbox-") &&
                            cacheName.endsWith(self.registration.scope),
                    )
                    .map((cacheName) => caches.delete(cacheName)),
            );
            await self.clients.claim();
        })(),
    );
});

self.addEventListener("push", (event: PushEvent) => {
    event.waitUntil(
        (async () => {
            if (!event.data) return;
            let payload: PushPayload;
            try {
                payload = event.data.json() as PushPayload;
            } catch {
                return;
            }
            let target: URL;
            try {
                target = new URL(payload.url, self.location.origin);
            } catch {
                return;
            }
            if (
                ![
                    "question_received",
                    "answer_received",
                    "answer_due_soon",
                ].includes(payload.kind) ||
                typeof payload.gameCode !== "string" ||
                !/^[A-HJ-NP-Z2-9]{6}$/.test(payload.gameCode) ||
                typeof payload.questionId !== "string" ||
                typeof payload.title !== "string" ||
                typeof payload.body !== "string" ||
                typeof payload.url !== "string" ||
                target.origin !== self.location.origin ||
                target.pathname !== "/"
            )
                return;
            const gameTarget = new URL("/", self.location.origin);
            gameTarget.searchParams.set("game", payload.gameCode);
            const options: NotificationOptions & {
                image: string;
                vibrate: number[];
                renotify: boolean;
            } = {
                body: payload.body.slice(0, 180),
                icon: "/notification-icon-v3.png",
                badge: "/notification-badge-v3.png",
                image: "/notification-banner-v2.png",
                vibrate: [700, 120, 700, 120, 1400],
                renotify: true,
                silent: false,
                tag: `${payload.kind}:${payload.questionId}`,
                data: {
                    url: `${gameTarget.pathname}${gameTarget.search}`,
                },
            };
            await self.registration.showNotification(
                payload.title.slice(0, 80),
                options,
            );
        })(),
    );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
    event.notification.close();
    event.waitUntil(
        (async () => {
            const path = String(event.notification.data?.url ?? "/");
            const target = new URL(path, self.location.origin);
            if (
                target.origin !== self.location.origin ||
                target.pathname !== "/"
            )
                return;
            const windows = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });
            for (const client of windows) {
                const windowClient = client as WindowClient;
                if (new URL(windowClient.url).origin === self.location.origin) {
                    await windowClient.navigate(target.href);
                    await windowClient.focus();
                    return;
                }
            }
            await self.clients.openWindow(target.href);
        })(),
    );
});
