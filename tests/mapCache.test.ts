import { afterEach, describe, expect, it, vi } from "vitest";

describe("map-data cache", () => {
    afterEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
    });

    it("does not cache an unsuccessful map-data response", async () => {
        const put = vi.fn(async () => undefined);
        const match = vi.fn(async () => undefined);
        vi.stubGlobal("caches", {
            open: vi.fn(async () => ({ match, put })),
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response("map data unavailable", { status: 503 }),
            ),
        );

        const { cacheFetch } = await import("../src/maps/api/cache");
        const response = await cacheFetch("https://maps.example.test/data");

        expect(response.status).toBe(503);
        expect(put).not.toHaveBeenCalled();
    });

    it("discards a previously cached failed response and retries the network", async () => {
        const cachedFailure = new Response("old failure", { status: 502 });
        const freshResponse = new Response('{"features":[]}', {
            status: 200,
            headers: { "content-type": "application/json" },
        });
        const deleteCached = vi.fn(async () => true);
        const put = vi.fn(async () => undefined);
        vi.stubGlobal("caches", {
            open: vi.fn(async () => ({
                match: vi.fn(async () => cachedFailure),
                put,
                delete: deleteCached,
            })),
        });
        const fetchMapData = vi.fn(async () => freshResponse);
        vi.stubGlobal("fetch", fetchMapData);

        const { cacheFetch } = await import("../src/maps/api/cache");
        const response = await cacheFetch("https://maps.example.test/data");

        expect(deleteCached).toHaveBeenCalledWith(
            "https://maps.example.test/data",
        );
        expect(fetchMapData).toHaveBeenCalledOnce();
        expect(response.status).toBe(200);
        expect(put).toHaveBeenCalledOnce();
    });
});
