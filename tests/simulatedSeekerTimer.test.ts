import { describe, it, expect } from "vitest";
import { simulatedSeekerGameStartTime } from "@/lib/context";

describe("simulated seeker timer store", () => {
    it("can be set and cleared", async () => {
        simulatedSeekerGameStartTime.set(null);
        expect(simulatedSeekerGameStartTime.get()).toBe(null);

        const now = Date.now();
        simulatedSeekerGameStartTime.set(now);
        const val = simulatedSeekerGameStartTime.get();
        expect(typeof val).toBe("number");
        expect(Math.abs(val as number - now)).toBeLessThan(2000);

        simulatedSeekerGameStartTime.set(null);
        expect(simulatedSeekerGameStartTime.get()).toBe(null);
    });
});
