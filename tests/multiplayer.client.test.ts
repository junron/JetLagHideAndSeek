import { afterEach, describe, expect, it, vi } from "vitest";

import {
    answeredQuestionNotificationText,
    applyAnswer,
    applyPersistedAnswer,
    calculateHiderAnswerPreviews,
    canEditPendingQuestionResult,
    canSendHiderAnswer,
    extractAnswer,
    gameConnection,
    gameJoinUrl,
    type GameQuestion,
    gameSession,
    type GameSnapshot,
    gameSnapshot,
    hiderRoleUnavailable,
    joinGame,
    leaveGameAndCleanUpPush,
    playerRoleLabel,
    questionDeadlineState,
    questionSubmissionState,
    reconcileSnapshot,
    restoreGameSessionSnapshot,
    selectMapQuestions,
    selectSidebarQuestions,
    sendPhotoAnswer,
    shouldNotifyAnsweredQuestion,
    showPushConfirmation,
    submittedQuestionKeys,
    syncHiderModeForRole,
    unaskQuestion,
} from "@/game/multiplayer";
import { hiderMode } from "@/lib/context";

const radius = {
    id: "radius" as const,
    key: 1,
    data: {
        lat: 1,
        lng: 2,
        radius: 5,
        unit: "kilometers" as const,
        within: true,
        drag: true,
        color: "blue" as const,
        collapsed: false,
    },
};

const photo = {
    id: "photo" as const,
    key: 2,
    data: {
        subject: "tree" as const,
        collapsed: false,
        drag: false,
        response: "unanswered" as const,
    },
};

afterEach(() => {
    gameSession.set(null);
    gameSnapshot.set(null);
    hiderMode.set(false);
    vi.unstubAllGlobals();
});

describe("multiplayer answer helpers", () => {
    it("automatically calculates current answers for every pending hider question", async () => {
        hiderMode.set({ latitude: 1, longitude: 2 });
        const pending: GameQuestion = {
            id: "pending",
            senderPlayerId: "seeker",
            question: structuredClone(radius),
            status: "pending",
            createdAt: "2026-07-16T00:00:00.000Z",
            updatedAt: "2026-07-16T00:00:00.000Z",
        };
        const answered: GameQuestion = {
            ...pending,
            id: "answered",
            status: "answered",
            answer: { type: "radius", within: false },
        };

        const previews = await calculateHiderAnswerPreviews([
            pending,
            answered,
        ]);

        expect(previews).toEqual({
            pending: { type: "radius", within: true },
        });
    });

    it("renders authoritative hider answers as map questions", () => {
        const pending: GameQuestion = {
            id: "pending-map",
            senderPlayerId: "seeker",
            clientQuestionKey: radius.key,
            question: structuredClone(radius),
            status: "pending",
            answer: null,
            createdAt: "2026-07-16T00:00:00.000Z",
            answeredAt: null,
        };
        const answered: GameQuestion = {
            ...pending,
            id: "answered-map",
            clientQuestionKey: 3,
            question: { ...structuredClone(radius), key: 3 },
            status: "answered",
            answer: { type: "radius", within: false },
        };
        const photoAnswered: GameQuestion = {
            ...pending,
            id: "photo-map",
            question: structuredClone(photo),
            status: "answered",
            answer: {
                type: "photo",
                response: "photo",
                uploadId: "3f39b808-6026-48ce-8438-a61f32fb6da7",
            },
        };
        const snapshot: GameSnapshot = {
            game: {
                code: "ABC234",
                createdAt: "2026-07-16T00:00:00.000Z",
            },
            players: [],
            questions: [pending, answered, photoAnswered],
        };

        const mapQuestions = selectMapQuestions("hider", [], snapshot, {
            "pending-map": { type: "radius", within: true },
        });

        expect(
            mapQuestions.map((question) =>
                question.id === "radius" ? question.data.within : null,
            ),
        ).toEqual([true, false]);
        expect(selectMapQuestions("hider", [], snapshot, {})).toHaveLength(1);
        expect(
            selectMapQuestions("seeker", [radius, photo], snapshot, {}),
        ).toEqual([radius]);

        const sharedSeekerMap = selectMapQuestions(
            "seeker",
            [radius, photo],
            snapshot,
            {},
            "another-seeker",
        );
        expect(sharedSeekerMap).toMatchObject([
            { id: "radius", key: 1, data: { drag: true, within: true } },
            { id: "radius", key: 1, data: { drag: false, within: true } },
            { id: "radius", key: 3, data: { drag: false, within: false } },
        ]);

        const originatingSeekerMap = selectMapQuestions(
            "seeker",
            [radius, photo],
            snapshot,
            {},
            "seeker",
        );
        expect(originatingSeekerMap).toMatchObject([
            { id: "radius", key: 1, data: { drag: false, within: true } },
            { id: "radius", key: 3, data: { drag: false, within: false } },
        ]);
    });

    it("syncs every submitted pending question to every seeker as locked authoritative state", () => {
        const submittedByAnotherSeeker: GameQuestion = {
            id: "shared-pending",
            senderPlayerId: "seeker-one",
            clientQuestionKey: 9,
            question: {
                ...structuredClone(radius),
                key: 9,
            },
            status: "pending",
            answer: null,
            createdAt: "2026-07-17T00:00:00.000Z",
            answeredAt: null,
        };
        const snapshot: GameSnapshot = {
            game: {
                code: "ABC234",
                createdAt: "2026-07-17T00:00:00.000Z",
            },
            players: [
                { id: "seeker-one", name: "One", role: "seeker" },
                { id: "seeker-two", name: "Two", role: "seeker" },
            ],
            questions: [submittedByAnotherSeeker],
        };

        const sidebar = selectSidebarQuestions(
            "seeker",
            [radius],
            snapshot,
            "seeker-two",
        );
        expect(sidebar).toEqual([
            { source: "local", question: radius },
            { source: "remote", gameQuestion: submittedByAnotherSeeker },
        ]);

        const mapQuestions = selectMapQuestions(
            "seeker",
            [radius],
            snapshot,
            {},
            "seeker-two",
        );
        expect(mapQuestions).toHaveLength(2);
        expect(mapQuestions[1]).toMatchObject({
            key: 9,
            data: { drag: false },
        });
        expect(mapQuestions[1]).not.toBe(submittedByAnotherSeeker.question);
    });

    it("lets the originating seeker toggle a pending binary result without moving its locked pin", () => {
        const pending: GameQuestion = {
            id: "pending-binary",
            senderPlayerId: "seeker-one",
            clientQuestionKey: radius.key,
            question: structuredClone(radius),
            status: "pending",
            answer: null,
            createdAt: "2026-07-17T00:00:00.000Z",
            answeredAt: null,
        };
        const snapshot: GameSnapshot = {
            game: {
                code: "ABC234",
                createdAt: "2026-07-17T00:00:00.000Z",
            },
            players: [],
            questions: [pending],
        };
        const localPending = structuredClone(radius);
        localPending.data.lat = 9;
        localPending.data.lng = 10;
        localPending.data.within = false;
        localPending.data.drag = false;

        const ownerMapQuestion = selectMapQuestions(
            "seeker",
            [localPending],
            snapshot,
            {},
            "seeker-one",
        )[0];
        expect(ownerMapQuestion).toMatchObject({
            data: {
                lat: radius.data.lat,
                lng: radius.data.lng,
                within: false,
                drag: false,
            },
        });

        const otherSeekerMapQuestion = selectMapQuestions(
            "seeker",
            [],
            snapshot,
            {},
            "seeker-two",
        )[0];
        expect(otherSeekerMapQuestion).toMatchObject({
            data: { within: true, drag: false },
        });
    });

    it("prevents sending a stale answer while automatic calculation is running", () => {
        const preview = { type: "radius", within: true } as const;

        expect(canSendHiderAnswer(undefined, false)).toBe(false);
        expect(canSendHiderAnswer(preview, false)).toBe(true);
        expect(canSendHiderAnswer(preview, true)).toBe(false);
    });

    it("derives pending and blocked seeker question submission states", () => {
        const pending: GameQuestion = {
            id: "pending-own",
            senderPlayerId: "seeker-one",
            clientQuestionKey: 1,
            question: structuredClone(radius),
            status: "pending",
            answer: null,
            createdAt: "2026-07-16T00:00:00.000Z",
            answeredAt: null,
        };
        const answered: GameQuestion = {
            ...pending,
            id: "answered-own",
            clientQuestionKey: 2,
            status: "answered",
            answer: { type: "radius", within: true },
            answeredAt: "2026-07-16T00:01:00.000Z",
        };
        const snapshot: GameSnapshot = {
            game: {
                code: "ABC234",
                createdAt: "2026-07-16T00:00:00.000Z",
            },
            players: [],
            questions: [pending, answered],
        };

        expect(questionSubmissionState(snapshot, "seeker-one", 1)).toBe(
            "pending",
        );
        expect(questionSubmissionState(snapshot, "seeker-one", 2)).toBe(
            "answered",
        );
        expect(questionSubmissionState(snapshot, "seeker-one", 3)).toBe(
            "blocked",
        );
        expect(questionSubmissionState(snapshot, "seeker-two", 3)).toBe(
            "blocked",
        );
    });

    it("locks submitted geographic pins while preserving owner-only pending result edits", () => {
        const pending: GameQuestion = {
            id: "pending-own",
            senderPlayerId: "seeker-one",
            clientQuestionKey: 1,
            question: structuredClone(radius),
            status: "pending",
            answer: null,
            createdAt: "2026-07-16T00:00:00.000Z",
            answeredAt: null,
        };
        const session = {
            code: "ABC234",
            player: {
                id: "seeker-one",
                name: "Seeker",
                role: "seeker" as const,
            },
        };
        const snapshot: GameSnapshot = {
            game: {
                code: "ABC234",
                createdAt: "2026-07-16T00:00:00.000Z",
            },
            players: [session.player],
            questions: [pending],
        };

        expect(canEditPendingQuestionResult(session, pending)).toBe(true);
        expect([...submittedQuestionKeys(snapshot, "seeker-one")]).toEqual([1]);
        expect([...submittedQuestionKeys(snapshot, "another-seeker")]).toEqual(
            [],
        );
        expect(
            canEditPendingQuestionResult(
                {
                    ...session,
                    player: { ...session.player, id: "another-seeker" },
                },
                pending,
            ),
        ).toBe(false);
        expect(
            canEditPendingQuestionResult(session, {
                ...pending,
                status: "answered",
            }),
        ).toBe(false);
        const lockedMapQuestion = selectMapQuestions(
            "seeker",
            [],
            snapshot,
            {},
            "seeker-one",
        )[0];
        expect(lockedMapQuestion).toMatchObject({ data: { drag: false } });
        expect(lockedMapQuestion).not.toBe(pending.question);
    });

    it("notifies every seeker when a pending question is answered", () => {
        const before: GameQuestion = {
            id: "answer-notification",
            senderPlayerId: "originating-seeker",
            clientQuestionKey: 1,
            question: structuredClone(radius),
            status: "pending",
            answer: null,
            createdAt: "2026-07-16T00:00:00.000Z",
            answeredAt: null,
        };
        const after: GameQuestion = {
            ...before,
            status: "answered",
            answer: { type: "radius", within: true },
            answeredAt: "2026-07-16T00:01:00.000Z",
        };
        const seekerSession = {
            code: "ABC234",
            player: {
                id: "originating-seeker",
                name: "Seeker",
                role: "seeker" as const,
            },
        };

        expect(shouldNotifyAnsweredQuestion(seekerSession, before, after)).toBe(
            true,
        );
        expect(
            shouldNotifyAnsweredQuestion(
                {
                    ...seekerSession,
                    player: { ...seekerSession.player, id: "other-seeker" },
                },
                before,
                after,
            ),
        ).toBe(true);
        expect(
            shouldNotifyAnsweredQuestion(
                {
                    ...seekerSession,
                    player: { ...seekerSession.player, role: "hider" },
                },
                before,
                after,
            ),
        ).toBe(false);
        expect(shouldNotifyAnsweredQuestion(seekerSession, after, after)).toBe(
            false,
        );
    });

    it("describes the answered question and its result in notifications", () => {
        const answered: GameQuestion = {
            id: "answer-copy",
            senderPlayerId: "originating-seeker",
            clientQuestionKey: 1,
            question: {
                ...structuredClone(radius),
                data: { ...structuredClone(radius.data), radius: 1.6 },
            },
            status: "answered",
            answer: { type: "radius", within: false },
            createdAt: "2026-07-16T00:00:00.000Z",
            answeredAt: "2026-07-16T00:01:00.000Z",
        };

        expect(answeredQuestionNotificationText(answered)).toBe(
            "1.6km radar: Outside",
        );
    });

    it("shows explicit labels for both multiplayer roles", () => {
        expect(playerRoleLabel("hider")).toBe("Hider");
        expect(playerRoleLabel("seeker")).toBe("Seeker");
    });

    it("blocks a second hider in the client while allowing the existing hider to resume", async () => {
        const snapshot: GameSnapshot = {
            game: {
                code: "ABC234",
                createdAt: "2026-07-17T00:00:00.000Z",
            },
            players: [
                {
                    id: "existing-hider",
                    name: "Original Hider",
                    role: "hider",
                },
            ],
            questions: [],
        };
        expect(hiderRoleUnavailable(snapshot, "Other Person")).toBe(true);
        expect(hiderRoleUnavailable(snapshot, " original hider ")).toBe(false);
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(snapshot), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            joinGame("abc234", "Other Person", "hider"),
        ).rejects.toThrow("This game already has a hider");
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("leaves locally without waiting for push cleanup", async () => {
        gameSession.set({
            code: "ABC234",
            player: { id: "player", name: "Seeker", role: "seeker" },
        });
        gameSnapshot.set({
            game: {
                code: "ABC234",
                createdAt: "2026-07-17T00:00:00.000Z",
            },
            players: [],
            questions: [],
        });
        gameConnection.set("online");

        let finishCleanup!: () => void;
        const cleanup = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    finishCleanup = resolve;
                }),
        );

        const result = leaveGameAndCleanUpPush(cleanup);

        expect(cleanup).toHaveBeenCalledOnce();
        expect(gameSession.get()).toBeNull();
        expect(gameSnapshot.get()).toBeNull();
        expect(gameConnection.get()).toBe("offline");

        finishCleanup();
        await expect(result).resolves.toBe(true);
    });

    it("keeps notification enablement successful when the confirmation cannot display", async () => {
        const showNotification = vi
            .fn()
            .mockRejectedValue(new Error("notification artwork unavailable"));

        await expect(showPushConfirmation({ showNotification })).resolves.toBe(
            false,
        );
    });

    it("builds a same-origin QR join URL with only the game code", () => {
        expect(gameJoinUrl("https://map.jro.sg/current/path", "abc234")).toBe(
            "https://map.jro.sg/?game=ABC234",
        );
    });

    it("automatically synchronizes hider mode with the multiplayer role", () => {
        hiderMode.set(false);
        syncHiderModeForRole("hider", { latitude: 1.25, longitude: 103.8 });
        expect(hiderMode.get()).toEqual({ latitude: 1.25, longitude: 103.8 });

        syncHiderModeForRole("hider", { latitude: 0, longitude: 0 });
        expect(hiderMode.get()).toEqual({ latitude: 1.25, longitude: 103.8 });

        syncHiderModeForRole("seeker");
        expect(hiderMode.get()).toBe(false);

        hiderMode.set({ latitude: 2, longitude: 3 });
        syncHiderModeForRole(null);
        expect(hiderMode.get()).toBe(false);
    });

    it("shows a local confirmation after notifications are enabled", async () => {
        const showNotification = vi.fn().mockResolvedValue(undefined);

        await showPushConfirmation({ showNotification });

        expect(showNotification).toHaveBeenCalledWith(
            "Notifications enabled",
            expect.objectContaining({
                tag: "notifications-enabled",
                body: expect.stringMatching(/question|answer/i),
            }),
        );
    });

    it("applies an answer to a cloned and locked question", () => {
        const result = applyAnswer(radius, { type: "radius", within: false });
        expect(result).not.toBe(radius);
        expect(result.data.within).toBe(false);
        expect(result.data.drag).toBe(false);
        expect(radius.data.within).toBe(true);
    });

    it("extracts only the result fields", () => {
        expect(extractAnswer(radius)).toEqual({ type: "radius", within: true });
    });

    it("rejects a mismatched answer", () => {
        expect(() =>
            applyAnswer(radius, { type: "measuring", hiderCloser: true }),
        ).toThrow(/type/i);
    });

    it("applies an answer to the persisted sent snapshot instead of a later local edit", () => {
        const item: GameQuestion = {
            id: "question-1",
            senderPlayerId: "player-1",
            clientQuestionKey: 1,
            question: radius,
            status: "answered",
            answer: { type: "radius", within: false },
            createdAt: "2026-07-16T00:00:00.000Z",
            answeredAt: "2026-07-16T00:01:00.000Z",
        };
        const laterLocalEdit = {
            ...radius,
            data: { ...radius.data, lat: 9, lng: 9 },
        };

        const result = applyPersistedAnswer(item, laterLocalEdit);

        expect(result.id).toBe("radius");
        if (result.id !== "radius") throw new Error("Expected radius question");
        expect(result.data.lat).toBe(1);
        expect(result.data.lng).toBe(2);
        expect(result.data.within).toBe(false);
        expect(result.key).toBe(laterLocalEdit.key);
    });

    it("does not let an older REST snapshot erase newer socket state", () => {
        const answered: GameQuestion = {
            id: "question-1",
            senderPlayerId: "player-1",
            clientQuestionKey: 1,
            question: radius,
            status: "answered",
            answer: { type: "radius", within: false },
            createdAt: "2026-07-16T00:00:00.000Z",
            answeredAt: "2026-07-16T00:01:00.000Z",
        };
        const socketOnly: GameQuestion = {
            ...answered,
            id: "question-2",
            status: "pending",
            answer: null,
            answeredAt: null,
            createdAt: "2026-07-16T00:02:00.000Z",
        };
        const current: GameSnapshot = {
            game: {
                code: "ABC234",
                createdAt: "2026-07-16T00:00:00.000Z",
            },
            players: [],
            questions: [answered, socketOnly],
        };
        const staleIncoming: GameSnapshot = {
            ...current,
            questions: [
                {
                    ...answered,
                    status: "pending",
                    answer: null,
                    answeredAt: null,
                },
            ],
        };

        const result = reconcileSnapshot(current, staleIncoming);

        expect(result.questions).toHaveLength(2);
        expect(
            result.questions.find((item) => item.id === "question-1")?.status,
        ).toBe("answered");
        expect(result.questions.some((item) => item.id === "question-2")).toBe(
            true,
        );
    });

    it("restores the authoritative snapshot without waiting for Socket.IO", async () => {
        const snapshot: GameSnapshot = {
            game: {
                code: "ABC234",
                createdAt: "2026-07-16T00:00:00.000Z",
            },
            players: [],
            questions: [],
        };
        gameSession.set({
            code: "ABC234",
            player: { id: "hider", name: "Hider", role: "hider" },
        });
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify(snapshot), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
            ),
        );

        await restoreGameSessionSnapshot();

        expect(gameSnapshot.get()).toEqual(snapshot);
    });

    it("syncs durable game questions into every player's sidebar", () => {
        const remoteQuestion: GameQuestion = {
            id: "remote-question",
            senderPlayerId: "seeker-player",
            clientQuestionKey: 7,
            question: { ...radius, key: 7 },
            status: "pending",
            answer: null,
            createdAt: "2026-07-16T00:00:00.000Z",
            answeredAt: null,
        };
        const snapshot: GameSnapshot = {
            game: {
                code: "ABC234",
                createdAt: "2026-07-16T00:00:00.000Z",
            },
            players: [],
            questions: [remoteQuestion],
        };

        const hiderItems = selectSidebarQuestions("hider", [radius], snapshot);
        const seekerItems = selectSidebarQuestions(
            "seeker",
            [radius],
            snapshot,
        );
        const lateJoinerItems = selectSidebarQuestions(
            "seeker",
            [radius],
            snapshot,
            "late-seeker",
        );
        const originatingSeekerItems = selectSidebarQuestions(
            "seeker",
            [{ ...radius, key: 7 }],
            snapshot,
            "seeker-player",
        );

        expect(hiderItems).toEqual([
            { source: "remote", gameQuestion: remoteQuestion },
        ]);
        expect(seekerItems).toEqual([{ source: "local", question: radius }]);
        expect(lateJoinerItems).toEqual([
            { source: "local", question: radius },
            { source: "remote", gameQuestion: remoteQuestion },
        ]);
        expect(originatingSeekerItems).toEqual([
            { source: "remote", gameQuestion: remoteQuestion },
        ]);
    });

    it("un-asks an owned pending question and removes it locally", async () => {
        const pending: GameQuestion = {
            id: "pending-question",
            senderPlayerId: "seeker-player",
            clientQuestionKey: radius.key,
            question: structuredClone(radius),
            status: "pending",
            answer: null,
            createdAt: "2026-07-17T00:00:00.000Z",
            answeredAt: null,
        };
        gameSession.set({
            code: "ABC234",
            player: { id: "seeker-player", name: "Seeker", role: "seeker" },
        });
        gameSnapshot.set({
            game: {
                code: "ABC234",
                createdAt: "2026-07-17T00:00:00.000Z",
            },
            players: [],
            questions: [pending],
        });
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ questionId: pending.id }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await unaskQuestion(pending.id);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/games/ABC234/questions/pending-question",
            expect.objectContaining({
                method: "DELETE",
                body: JSON.stringify({ playerId: "seeker-player" }),
            }),
        );
        expect(gameSnapshot.get()?.questions).toEqual([]);
    });

    it("uploads a photo answer with the local hider identity", async () => {
        gameSession.set({
            code: "ABC234",
            player: { id: "hider-id", name: "Hider", role: "hider" },
        });
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    question: {
                        id: "question-id",
                        status: "answered",
                        answer: {
                            type: "photo",
                            response: "photo",
                            uploadId: "53a6b836-f89d-4d3a-8757-e791de08d42b",
                        },
                    },
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );
        vi.stubGlobal("fetch", fetchMock);
        const file = new File([new Uint8Array([1, 2, 3])], "tree.png", {
            type: "image/png",
        });

        await sendPhotoAnswer("question-id", file);

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(
            "/api/games/ABC234/questions/question-id/photo-answer",
        );
        expect(init.method).toBe("POST");
        expect(init.credentials).toBe("same-origin");
        expect(init.body).toBeInstanceOf(FormData);
        expect(init.body.get("playerId")).toBe("hider-id");
        const uploadedPhoto = init.body.get("photo");
        expect(uploadedPhoto).toBeInstanceOf(Blob);
        expect(uploadedPhoto).not.toBe(file);
        expect(uploadedPhoto.type).toBe("image/png");
        expect(
            Array.from(new Uint8Array(await uploadedPhoto.arrayBuffer())),
        ).toEqual([1, 2, 3]);
    });

    it("derives due and overdue states from the server deadline", () => {
        expect(
            questionDeadlineState(
                "2026-07-17T12:05:00.000Z",
                "pending",
                Date.parse("2026-07-17T12:03:30.000Z"),
            ),
        ).toEqual({ kind: "due", milliseconds: 90_000 });
        expect(
            questionDeadlineState(
                "2026-07-17T12:05:00.000Z",
                "pending",
                Date.parse("2026-07-17T12:05:01.000Z"),
            ),
        ).toEqual({ kind: "overdue", milliseconds: 1_000 });
        expect(
            questionDeadlineState(
                "2026-07-17T12:05:00.000Z",
                "answered",
                Date.parse("2026-07-17T12:06:00.000Z"),
            ),
        ).toEqual({ kind: "answered", milliseconds: 0 });
    });
});
