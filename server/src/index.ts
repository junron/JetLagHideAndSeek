import { lookup as dnsLookup } from "node:dns";
import { Agent } from "node:https";
import { BlockList } from "node:net";
import process from "node:process";

import webpush from "web-push";

import { buildApp, type PushSender } from "./app.js";

const port = Number(process.env.PORT ?? 3210);
const host = process.env.HOST ?? "127.0.0.1";
const databasePath = process.env.DATABASE_PATH ?? "./data/game.db";
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@jro.sg";
const PUSH_REQUEST_TIMEOUT_MS = 10_000;

const blockedPushAddresses = new BlockList();
for (const [network, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
] as const) {
    blockedPushAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
    ["2001:db8::", 32],
] as const) {
    blockedPushAddresses.addSubnet(network, prefix, "ipv6");
}

const pushAgent = new Agent({
    keepAlive: true,
    lookup: (hostname, options, callback) => {
        dnsLookup(
            hostname,
            { all: true, verbatim: true },
            (error, addresses) => {
                if (error) {
                    callback(error, "", 0);
                    return;
                }
                if (
                    addresses.some((item) =>
                        blockedPushAddresses.check(
                            item.address,
                            item.family === 6 ? "ipv6" : "ipv4",
                        ),
                    )
                ) {
                    const blocked = Object.assign(
                        new Error(
                            "Push endpoint resolved to a blocked address",
                        ),
                        { code: "EACCES" },
                    );
                    callback(blocked, "", 0);
                    return;
                }
                const family = Number(options.family ?? 0);
                const candidates = family
                    ? addresses.filter((item) => item.family === family)
                    : addresses;
                if (candidates.length === 0) {
                    const unavailable = Object.assign(
                        new Error(
                            "Push endpoint has no address in the requested family",
                        ),
                        { code: "EAI_NODATA" },
                    );
                    callback(unavailable, "", 0);
                    return;
                }
                if (options.all) {
                    callback(null, candidates);
                    return;
                }
                callback(null, candidates[0].address, candidates[0].family);
            },
        );
    },
});

let pushSender: PushSender | undefined;
if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    pushSender = async (subscription, payload) => {
        await webpush.sendNotification(subscription, payload, {
            TTL: 300,
            urgency: "high",
            timeout: PUSH_REQUEST_TIMEOUT_MS,
            agent: pushAgent,
        });
    };
} else if (process.env.NODE_ENV === "production") {
    throw new Error(
        "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required in production",
    );
}

const app = await buildApp({
    databasePath,
    pushSender,
    vapidPublicKey,
    logger: true,
});

const shutdown = async () => {
    await app.close();
    process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host, port });
