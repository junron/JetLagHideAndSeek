import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import sharp from "sharp";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp, type PushSender } from "../server/src/app";

const subscription = {
    endpoint: "https://push.example.test/subscription/1",
    keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

const radiusQuestion = {
    id: "radius",
    key: 0.42,
    data: {
        lat: 1.3,
        lng: 103.8,
        radius: 1.6,
        unit: "kilometers",
        within: true,
        drag: true,
        color: "blue",
        collapsed: false,
    },
};

function photoMultipart(playerId: string, image: Buffer) {
    const boundary = "----jetlag-photo-test";
    return {
        boundary,
        body: Buffer.concat([
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="playerId"\r\n\r\n${playerId}\r\n`,
            ),
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="location.png"\r\nContent-Type: image/png\r\n\r\n`,
            ),
            image,
            Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
    };
}

async function injectJson(
    app: Awaited<ReturnType<typeof buildApp>>,
    method: string,
    url: string,
    payload?: unknown,
) {
    const response = await app.inject({ method: method as any, url, payload });
    expect(response.statusCode).toBeLessThan(400);
    return response.json();
}

describe("multiplayer server", () => {
    const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

    afterEach(async () => {
        await Promise.all(apps.splice(0).map((app) => app.close()));
    });

    it("creates a game, joins by code, and persists a pending question until the hider explicitly answers", async () => {
        const sent: Array<{ endpoint: string; payload: string }> = [];
        let clock = "2026-07-17T12:00:00.000Z";
        const pushSender: PushSender = async (sub, payload) => {
            sent.push({ endpoint: sub.endpoint, payload });
        };
        const app = await buildApp({
            databasePath: ":memory:",
            pushSender,
            now: () => clock,
        });
        apps.push(app);

        const created = await app.inject({
            method: "POST",
            url: "/api/games",
            payload: { name: "Hider", role: "hider" },
        });
        expect(created.statusCode).toBe(201);
        const { game, player: hider } = created.json();
        expect(game.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

        const joined = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/join`,
            payload: { name: "Seeker", role: "seeker" },
        });
        expect(joined.statusCode).toBe(201);
        const seeker = joined.json().player;

        await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/push-subscriptions`,
            payload: { playerId: hider.id, subscription },
        });

        const submitted = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/questions`,
            payload: {
                playerId: seeker.id,
                clientQuestionKey: radiusQuestion.key,
                question: radiusQuestion,
            },
        });
        expect(submitted.statusCode).toBe(201);
        const submittedQuestion = submitted.json().question;
        expect(submittedQuestion.status).toBe("pending");
        expect(submittedQuestion.answer).toBeNull();
        expect(
            Date.parse(submittedQuestion.answerDueAt) -
                Date.parse(submittedQuestion.createdAt),
        ).toBe(5 * 60 * 1000);

        const observerJoined = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/join`,
            payload: { name: "Observer", role: "seeker" },
        });
        expect(observerJoined.statusCode).toBe(201);
        const observer = observerJoined.json().player;

        const lateJoinSnapshot = await app.inject({
            method: "GET",
            url: `/api/games/${game.code}/snapshot`,
        });
        expect(lateJoinSnapshot.json()).toMatchObject({
            players: expect.arrayContaining([
                expect.objectContaining({ id: observer.id, role: "seeker" }),
            ]),
            questions: [
                expect.objectContaining({
                    id: submittedQuestion.id,
                    senderPlayerId: seeker.id,
                    status: "pending",
                }),
            ],
        });

        await app.drainPush();
        expect(sent).toHaveLength(1);
        expect(JSON.parse(sent[0].payload)).toMatchObject({
            kind: "question_received",
            gameCode: game.code,
            questionId: submittedQuestion.id,
            url: `/?game=${game.code}`,
        });

        clock = "2026-07-17T12:03:59.000Z";
        await app.drainPush();
        expect(sent).toHaveLength(1);

        clock = "2026-07-17T12:04:00.000Z";
        await app.drainPush();
        expect(sent).toHaveLength(2);
        expect(sent[1].endpoint).toBe(
            "https://push.example.test/subscription/1",
        );
        expect(JSON.parse(sent[1].payload)).toMatchObject({
            kind: "answer_due_soon",
            gameCode: game.code,
            questionId: submittedQuestion.id,
            title: "1 minute left",
            body: "1 minute left to answer 1.6km radar",
            url: `/?game=${game.code}`,
        });
        await app.drainPush();
        expect(sent).toHaveLength(2);

        const stillPending = await app.inject({
            method: "GET",
            url: `/api/games/${game.code}/snapshot`,
        });
        expect(stillPending.json().questions[0].status).toBe("pending");
        expect(stillPending.json().questions[0].answer).toBeNull();

        await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/push-subscriptions`,
            payload: {
                playerId: seeker.id,
                subscription: {
                    ...subscription,
                    endpoint: "https://push.example.test/subscription/2",
                },
            },
        });
        await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/push-subscriptions`,
            payload: {
                playerId: observer.id,
                subscription: {
                    ...subscription,
                    endpoint: "https://push.example.test/subscription/3",
                },
            },
        });

        clock = "2026-07-17T12:06:00.000Z";
        const answered = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/questions/${submittedQuestion.id}/answer`,
            payload: {
                playerId: hider.id,
                answer: { type: "radius", within: false },
            },
        });
        expect(answered.statusCode).toBe(200);
        expect(answered.json().question).toMatchObject({
            status: "answered",
            answer: { type: "radius", within: false },
            answeredLate: true,
        });
        const answeredRetraction = await app.inject({
            method: "DELETE",
            url: `/api/games/${game.code}/questions/${submittedQuestion.id}`,
            payload: { playerId: seeker.id },
        });
        expect(answeredRetraction.statusCode).toBe(409);
        expect(answeredRetraction.json().error.code).toBe(
            "QUESTION_ALREADY_ANSWERED",
        );

        await app.drainPush();
        expect(sent).toHaveLength(4);
        expect(new Set(sent.slice(2).map((entry) => entry.endpoint))).toEqual(
            new Set([
                "https://push.example.test/subscription/2",
                "https://push.example.test/subscription/3",
            ]),
        );
        for (const delivery of sent.slice(2)) {
            expect(JSON.parse(delivery.payload)).toMatchObject({
                kind: "answer_received",
                gameCode: game.code,
                questionId: submittedQuestion.id,
                title: "Answer received",
                body: "1.6km radar: Outside",
                url: `/?game=${game.code}`,
            });
        }
    });

    it("cancels the one-minute reminder when the question is answered early", async () => {
        const sent: Array<{ endpoint: string; payload: string }> = [];
        let clock = "2026-07-17T12:00:00.000Z";
        const app = await buildApp({
            databasePath: ":memory:",
            now: () => clock,
            pushSender: async (sub, payload) => {
                sent.push({ endpoint: sub.endpoint, payload });
            },
        });
        apps.push(app);

        const created = await injectJson(app, "POST", "/api/games", {
            name: "Hider",
            role: "hider",
        });
        const seeker = (
            await injectJson(
                app,
                "POST",
                `/api/games/${created.game.code}/join`,
                { name: "Seeker", role: "seeker" },
            )
        ).player;
        await injectJson(
            app,
            "POST",
            `/api/games/${created.game.code}/push-subscriptions`,
            { playerId: created.player.id, subscription },
        );
        await injectJson(
            app,
            "POST",
            `/api/games/${created.game.code}/push-subscriptions`,
            {
                playerId: seeker.id,
                subscription: {
                    ...subscription,
                    endpoint: "https://push.example.test/subscription/seeker",
                },
            },
        );
        const question = (
            await injectJson(
                app,
                "POST",
                `/api/games/${created.game.code}/questions`,
                {
                    playerId: seeker.id,
                    clientQuestionKey: radiusQuestion.key,
                    question: radiusQuestion,
                },
            )
        ).question;
        await app.drainPush();

        clock = "2026-07-17T12:03:00.000Z";
        await injectJson(
            app,
            "POST",
            `/api/games/${created.game.code}/questions/${question.id}/answer`,
            {
                playerId: created.player.id,
                answer: { type: "radius", within: true },
            },
        );
        await app.drainPush();
        clock = "2026-07-17T12:04:00.000Z";
        await app.drainPush();

        expect(
            sent.map((delivery) => JSON.parse(delivery.payload).kind),
        ).toEqual(["question_received", "answer_received"]);
    });

    it("lets only the originating seeker un-ask a pending question", async () => {
        const sent: string[] = [];
        const app = await buildApp({
            databasePath: ":memory:",
            pushSender: async (_subscription, payload) => {
                sent.push(payload);
            },
        });
        apps.push(app);
        const created = await injectJson(app, "POST", "/api/games", {
            name: "Hider",
            role: "hider",
        });
        const owner = (
            await injectJson(
                app,
                "POST",
                `/api/games/${created.game.code}/join`,
                { name: "Owner", role: "seeker" },
            )
        ).player;
        const other = (
            await injectJson(
                app,
                "POST",
                `/api/games/${created.game.code}/join`,
                { name: "Other", role: "seeker" },
            )
        ).player;
        await injectJson(
            app,
            "POST",
            `/api/games/${created.game.code}/push-subscriptions`,
            { playerId: created.player.id, subscription },
        );
        const submitted = await injectJson(
            app,
            "POST",
            `/api/games/${created.game.code}/questions`,
            {
                playerId: owner.id,
                clientQuestionKey: radiusQuestion.key,
                question: radiusQuestion,
            },
        );

        const otherRetraction = await app.inject({
            method: "DELETE",
            url: `/api/games/${created.game.code}/questions/${submitted.question.id}`,
            payload: { playerId: other.id },
        });
        expect(otherRetraction.statusCode).toBe(403);

        const retracted = await app.inject({
            method: "DELETE",
            url: `/api/games/${created.game.code}/questions/${submitted.question.id}`,
            payload: { playerId: owner.id },
        });
        expect(retracted.statusCode).toBe(200);
        expect(retracted.json()).toEqual({ questionId: submitted.question.id });

        const snapshot = await injectJson(
            app,
            "GET",
            `/api/games/${created.game.code}/snapshot`,
        );
        expect(snapshot.questions).toEqual([]);
        await app.drainPush();
        expect(sent).toHaveLength(1);

        const resent = await app.inject({
            method: "POST",
            url: `/api/games/${created.game.code}/questions`,
            payload: {
                playerId: owner.id,
                clientQuestionKey: radiusQuestion.key,
                question: radiusQuestion,
            },
        });
        expect(resent.statusCode).toBe(201);
    });

    it("accepts a sanitized photo answer and assigns the documented ten-minute deadline", async () => {
        const uploadDirectory = mkdtempSync(join(tmpdir(), "jetlag-photos-"));
        try {
            const app = await buildApp({
                databasePath: ":memory:",
                uploadDirectory,
            });
            apps.push(app);
            const created = await injectJson(app, "POST", "/api/games", {
                name: "Photo Hider",
                role: "hider",
            });
            const joined = await injectJson(
                app,
                "POST",
                `/api/games/${created.game.code}/join`,
                { name: "Photo Seeker", role: "seeker" },
            );
            const submitted = await app.inject({
                method: "POST",
                url: `/api/games/${created.game.code}/questions`,
                payload: {
                    playerId: joined.player.id,
                    clientQuestionKey: 9.5,
                    question: {
                        id: "photo",
                        key: 9.5,
                        data: { subject: "tree", collapsed: false },
                    },
                },
            });
            expect(submitted.statusCode).toBe(201);
            const question = submitted.json().question;
            expect(
                Date.parse(question.answerDueAt) -
                    Date.parse(question.createdAt),
            ).toBe(10 * 60 * 1000);

            const wrongRoleMultipart = photoMultipart(
                joined.player.id,
                Buffer.from("not an image"),
            );
            const wrongRole = await app.inject({
                method: "POST",
                url: `/api/games/${created.game.code}/questions/${question.id}/photo-answer`,
                headers: {
                    "content-type": `multipart/form-data; boundary=${wrongRoleMultipart.boundary}`,
                },
                payload: wrongRoleMultipart.body,
            });
            expect(wrongRole.statusCode).toBe(403);
            expect(wrongRole.json().error.code).toBe("HIDER_REQUIRED");

            const invalidMultipart = photoMultipart(
                created.player.id,
                Buffer.from("not an image"),
            );
            const invalid = await app.inject({
                method: "POST",
                url: `/api/games/${created.game.code}/questions/${question.id}/photo-answer`,
                headers: {
                    "content-type": `multipart/form-data; boundary=${invalidMultipart.boundary}`,
                },
                payload: invalidMultipart.body,
            });
            expect(invalid.statusCode).toBe(415);
            expect(invalid.json().error.code).toBe("INVALID_PHOTO");

            const image = await sharp({
                create: {
                    width: 3,
                    height: 2,
                    channels: 3,
                    background: "#336699",
                },
            })
                .withMetadata({ orientation: 6 })
                .png()
                .toBuffer();
            const multipart = photoMultipart(created.player.id, image);
            const answered = await app.inject({
                method: "POST",
                url: `/api/games/${created.game.code}/questions/${question.id}/photo-answer`,
                headers: {
                    "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
                },
                payload: multipart.body,
            });
            expect(answered.statusCode).toBe(200);
            expect(answered.json().question.answer).toMatchObject({
                type: "photo",
                response: "photo",
                uploadId: expect.any(String),
            });
            expect(answered.json().question.answeredLate).toBe(false);

            const uploadId = answered.json().question.answer.uploadId;
            const media = await app.inject({
                method: "GET",
                url: `/api/games/${created.game.code}/photos/${uploadId}`,
            });
            expect(media.statusCode).toBe(200);
            const wrongGame = await app.inject({
                method: "GET",
                url: `/api/games/ZZZZZZ/photos/${uploadId}`,
            });
            expect(wrongGame.statusCode).toBe(404);
            expect(media.headers["content-type"]).toBe("image/jpeg");
            expect(media.headers["cache-control"]).toBe("private, no-store");
            expect(media.headers["cross-origin-resource-policy"]).toBe(
                "same-origin",
            );
            expect(media.headers["x-content-type-options"]).toBe("nosniff");
            const metadata = await sharp(media.rawPayload).metadata();
            expect(metadata.width).toBe(2);
            expect(metadata.height).toBe(3);
            expect(metadata.exif).toBeUndefined();
            expect(metadata.xmp).toBeUndefined();

            const unavailableQuestion = await injectJson(
                app,
                "POST",
                `/api/games/${created.game.code}/questions`,
                {
                    playerId: joined.player.id,
                    clientQuestionKey: 9.6,
                    question: {
                        id: "photo",
                        key: 9.6,
                        data: {
                            subject: "place_of_worship",
                            collapsed: false,
                        },
                    },
                },
            );
            const unavailableAnswer = await injectJson(
                app,
                "POST",
                `/api/games/${created.game.code}/questions/${unavailableQuestion.question.id}/answer`,
                {
                    playerId: created.player.id,
                    answer: {
                        type: "photo",
                        response: "cannot_answer",
                    },
                },
            );
            expect(unavailableAnswer.question.answer).toEqual({
                type: "photo",
                response: "cannot_answer",
            });
        } finally {
            rmSync(uploadDirectory, { recursive: true, force: true });
        }
    });

    it("rejects a second pending question from any seeker until the first is answered", async () => {
        const app = await buildApp({ databasePath: ":memory:" });
        apps.push(app);
        const { game, player: hider } = await injectJson(
            app,
            "POST",
            "/api/games",
            { name: "Pending Hider", role: "hider" },
        );
        const { player: seeker } = await injectJson(
            app,
            "POST",
            `/api/games/${game.code}/join`,
            { name: "Pending Seeker", role: "seeker" },
        );
        const { player: otherSeeker } = await injectJson(
            app,
            "POST",
            `/api/games/${game.code}/join`,
            { name: "Other Seeker", role: "seeker" },
        );
        const first = await injectJson(
            app,
            "POST",
            `/api/games/${game.code}/questions`,
            {
                playerId: seeker.id,
                clientQuestionKey: radiusQuestion.key,
                question: radiusQuestion,
            },
        );

        const duplicate = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/questions`,
            payload: {
                playerId: seeker.id,
                clientQuestionKey: radiusQuestion.key,
                question: radiusQuestion,
            },
        });
        expect(duplicate.statusCode).toBe(200);
        expect(duplicate.json().question.id).toBe(first.question.id);

        const secondQuestion = {
            ...radiusQuestion,
            key: 0.43,
            data: { ...radiusQuestion.data, radius: 10 },
        };
        const blocked = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/questions`,
            payload: {
                playerId: otherSeeker.id,
                clientQuestionKey: secondQuestion.key,
                question: secondQuestion,
            },
        });
        expect(blocked.statusCode).toBe(409);
        expect(blocked.json().error.code).toBe("PENDING_QUESTION_EXISTS");

        await injectJson(
            app,
            "POST",
            `/api/games/${game.code}/questions/${first.question.id}/answer`,
            {
                playerId: hider.id,
                answer: { type: "radius", within: true },
            },
        );
        const allowed = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/questions`,
            payload: {
                playerId: otherSeeker.id,
                clientQuestionKey: secondQuestion.key,
                question: secondQuestion,
            },
        });
        expect(allowed.statusCode).toBe(201);
        expect(allowed.json().question.status).toBe("pending");
    });

    it("coalesces concurrent push drains so one delivery is not sent twice", async () => {
        let releasePush!: () => void;
        let enteredPush!: () => void;
        const release = new Promise<void>((resolve) => {
            releasePush = resolve;
        });
        const entered = new Promise<void>((resolve) => {
            enteredPush = resolve;
        });
        let sends = 0;
        const app = await buildApp({
            databasePath: ":memory:",
            pushPollMs: 60_000,
            pushSender: async () => {
                sends += 1;
                enteredPush();
                await release;
            },
            vapidPublicKey: "test-public-key",
        });
        apps.push(app);

        const { game, player: hider } = await injectJson(
            app,
            "POST",
            "/api/games",
            {
                name: "Push Hider",
                role: "hider",
            },
        );
        const { player: seeker } = await injectJson(
            app,
            "POST",
            `/api/games/${game.code}/join`,
            {
                name: "Push Seeker",
                role: "seeker",
            },
        );
        await injectJson(
            app,
            "POST",
            `/api/games/${game.code}/push-subscriptions`,
            {
                playerId: hider.id,
                subscription,
            },
        );
        await injectJson(app, "POST", `/api/games/${game.code}/questions`, {
            playerId: seeker.id,
            clientQuestionKey: 444,
            question: { ...radiusQuestion, key: 444 },
        });

        await entered;
        const drains = Promise.all([app.drainPush(), app.drainPush()]);
        releasePush();
        await drains;
        expect(sends).toBe(1);
    });

    it("cancels queued deliveries when a push endpoint changes owners", async () => {
        let sends = 0;
        const app = await buildApp({
            databasePath: ":memory:",
            pushPollMs: 60_000,
            pushSender: async () => {
                sends += 1;
                throw new Error("temporary push failure");
            },
        });
        apps.push(app);

        const { game, player: hider } = await injectJson(
            app,
            "POST",
            "/api/games",
            { name: "Original Hider", role: "hider" },
        );
        const { player: seeker } = await injectJson(
            app,
            "POST",
            `/api/games/${game.code}/join`,
            { name: "New Owner", role: "seeker" },
        );
        await injectJson(
            app,
            "POST",
            `/api/games/${game.code}/push-subscriptions`,
            { playerId: hider.id, subscription },
        );
        await injectJson(app, "POST", `/api/games/${game.code}/questions`, {
            playerId: seeker.id,
            clientQuestionKey: 555,
            question: { ...radiusQuestion, key: 555 },
        });
        await app.drainPush();
        expect(sends).toBe(1);

        await injectJson(
            app,
            "POST",
            `/api/games/${game.code}/push-subscriptions`,
            { playerId: seeker.id, subscription },
        );
        await new Promise((resolve) => setTimeout(resolve, 1_100));
        await app.drainPush();

        expect(sends).toBe(1);
    });

    it("restores durable game state after closing and reopening SQLite", async () => {
        const directory = mkdtempSync(join(tmpdir(), "jetlag-multiplayer-"));
        const databasePath = join(directory, "game.db");
        let first: Awaited<ReturnType<typeof buildApp>> | null = null;
        let second: Awaited<ReturnType<typeof buildApp>> | null = null;
        try {
            first = await buildApp({ databasePath });
            const { game } = await injectJson(first, "POST", "/api/games", {
                name: "Persistent Hider",
                role: "hider",
            });
            await first.close();
            first = null;

            second = await buildApp({ databasePath });
            const restored = await second.inject({
                method: "GET",
                url: `/api/games/${game.code}/snapshot`,
            });

            expect(restored.statusCode).toBe(200);
            expect(restored.json()).toMatchObject({
                game: { code: game.code },
                players: [{ name: "Persistent Hider", role: "hider" }],
            });
        } finally {
            if (first) await first.close();
            if (second) await second.close();
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it("migrates legacy per-seeker pending rows without discarding questions", async () => {
        const directory = mkdtempSync(join(tmpdir(), "jetlag-legacy-pending-"));
        const databasePath = join(directory, "game.db");
        const legacyDb = new DatabaseSync(databasePath);
        legacyDb.exec(`
            PRAGMA foreign_keys = ON;
            CREATE TABLE games (
                id TEXT PRIMARY KEY,
                code TEXT NOT NULL UNIQUE COLLATE NOCASE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE players (
                id TEXT PRIMARY KEY,
                game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                name TEXT NOT NULL COLLATE NOCASE,
                role TEXT NOT NULL CHECK (role IN ('hider', 'seeker')),
                joined_at TEXT NOT NULL,
                UNIQUE (game_id, name)
            );
            CREATE TABLE questions (
                id TEXT PRIMARY KEY,
                game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                sender_player_id TEXT NOT NULL REFERENCES players(id),
                client_question_key REAL NOT NULL,
                question_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered')),
                created_at TEXT NOT NULL,
                answer_due_at TEXT NOT NULL,
                UNIQUE (sender_player_id, client_question_key)
            );
            CREATE UNIQUE INDEX one_pending_question_per_seeker
                ON questions(game_id, sender_player_id) WHERE status = 'pending';
            CREATE TABLE push_subscriptions (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth_secret TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE push_deliveries (
                id TEXT PRIMARY KEY,
                subscription_id TEXT REFERENCES push_subscriptions(id) ON DELETE SET NULL,
                game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                target_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
                kind TEXT NOT NULL CHECK (kind IN ('question_received', 'answer_received')),
                payload_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dead')),
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at TEXT NOT NULL,
                last_error TEXT,
                created_at TEXT NOT NULL,
                sent_at TEXT,
                UNIQUE (subscription_id, kind, question_id)
            );
        `);
        const timestamp = "2026-07-17T00:00:00.000Z";
        legacyDb
            .prepare("INSERT INTO games VALUES (?, ?, ?)")
            .run("game", "ABC234", timestamp);
        const insertPlayer = legacyDb.prepare(
            "INSERT INTO players VALUES (?, ?, ?, ?, ?)",
        );
        const seekerOneId = "00000000-0000-4000-8000-000000000001";
        const seekerTwoId = "00000000-0000-4000-8000-000000000002";
        insertPlayer.run(seekerOneId, "game", "One", "seeker", timestamp);
        insertPlayer.run(seekerTwoId, "game", "Two", "seeker", timestamp);
        const insertQuestion = legacyDb.prepare(
            "INSERT INTO questions VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
        );
        insertQuestion.run(
            "question-one",
            "game",
            seekerOneId,
            1,
            JSON.stringify({ ...radiusQuestion, key: 1 }),
            timestamp,
            timestamp,
        );
        insertQuestion.run(
            "question-two",
            "game",
            seekerTwoId,
            2,
            JSON.stringify({ ...radiusQuestion, key: 2 }),
            timestamp,
            timestamp,
        );
        legacyDb
            .prepare(
                "INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .run(
                "subscription",
                seekerOneId,
                subscription.endpoint,
                subscription.keys.p256dh,
                subscription.keys.auth,
                timestamp,
                timestamp,
            );
        legacyDb
            .prepare(
                `INSERT INTO push_deliveries
                 (id, subscription_id, game_id, target_player_id, question_id, kind,
                  payload_json, status, attempts, next_attempt_at, created_at)
                 VALUES (?, ?, ?, ?, ?, 'question_received', '{}', 'sent', 0, ?, ?)`,
            )
            .run(
                "delivery",
                "subscription",
                "game",
                seekerOneId,
                "question-one",
                timestamp,
                timestamp,
            );
        legacyDb.close();

        let app: Awaited<ReturnType<typeof buildApp>> | null = null;
        try {
            app = await buildApp({ databasePath });
            const snapshot = await app.inject({
                method: "GET",
                url: "/api/games/ABC234/snapshot",
            });
            expect(snapshot.statusCode).toBe(200);
            expect(snapshot.json().questions).toHaveLength(2);

            const unasked = await app.inject({
                method: "DELETE",
                url: "/api/games/ABC234/questions/question-two",
                payload: { playerId: seekerTwoId },
            });
            expect(unasked.statusCode).toBe(200);
            await app.close();
            app = null;

            const migratedDb = new DatabaseSync(databasePath);
            const gameWideIndex = migratedDb
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'one_pending_question_per_game'",
                )
                .get();
            const pushDeliveryTable = migratedDb
                .prepare(
                    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'push_deliveries'",
                )
                .get() as { sql: string };
            const preservedDelivery = migratedDb
                .prepare(
                    "SELECT kind, status FROM push_deliveries WHERE id = 'delivery'",
                )
                .get();
            migratedDb.close();
            expect(gameWideIndex).toBeTruthy();
            expect(pushDeliveryTable.sql).toContain("answer_due_soon");
            expect(preservedDelivery).toEqual({
                kind: "question_received",
                status: "sent",
            });
        } finally {
            if (app) await app.close();
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it("emits an initial snapshot and committed questions over Socket.IO", async () => {
        const app = await buildApp({ databasePath: ":memory:" });
        apps.push(app);
        const { game, player: seeker } = await injectJson(
            app,
            "POST",
            "/api/games",
            { name: "Socket Seeker", role: "seeker" },
        );
        const { player: observer } = await injectJson(
            app,
            "POST",
            `/api/games/${game.code}/join`,
            { name: "Socket Observer", role: "seeker" },
        );
        const address = await app.listen({ host: "127.0.0.1", port: 0 });
        let client: Socket | null = null;
        let observerClient: Socket | null = null;
        try {
            client = ioClient(address, {
                path: "/socket.io",
                query: { gameCode: game.code, playerId: seeker.id },
                transports: ["websocket"],
            });
            observerClient = ioClient(address, {
                path: "/socket.io",
                query: { gameCode: game.code, playerId: observer.id },
                transports: ["websocket"],
            });
            const [initial, observerInitial] = await Promise.all(
                [client, observerClient].map(
                    (socket) =>
                        new Promise<any>((resolve, reject) => {
                            socket.once("game:snapshot", resolve);
                            socket.once("connect_error", reject);
                        }),
                ),
            );
            expect(initial.game.code).toBe(game.code);
            expect(observerInitial.game.code).toBe(game.code);

            const receivedBySeekers = [client, observerClient].map(
                (socket) =>
                    new Promise<any>((resolve) =>
                        socket.once("question:created", resolve),
                    ),
            );
            await injectJson(app, "POST", `/api/games/${game.code}/questions`, {
                playerId: seeker.id,
                clientQuestionKey: 777,
                question: { ...radiusQuestion, key: 777 },
            });

            const receivedQuestions = await Promise.all(receivedBySeekers);
            expect(receivedQuestions).toHaveLength(2);
            for (const received of receivedQuestions) {
                expect(received).toMatchObject({
                    clientQuestionKey: 777,
                    status: "pending",
                });
            }
        } finally {
            client?.disconnect();
            observerClient?.disconnect();
        }
    });

    it("rejects malformed question-specific data", async () => {
        const app = await buildApp({ databasePath: ":memory:" });
        apps.push(app);
        const { game, player: seeker } = await injectJson(
            app,
            "POST",
            "/api/games",
            { name: "Schema Seeker", role: "seeker" },
        );

        const response = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/questions`,
            payload: {
                playerId: seeker.id,
                clientQuestionKey: 999,
                question: {
                    id: "radius",
                    key: 999,
                    data: { radius: 5 },
                },
            },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("INVALID_QUESTION");
    });

    it("accepts the standard nullable push subscription expirationTime", async () => {
        const app = await buildApp({ databasePath: ":memory:" });
        apps.push(app);
        const { game, player } = await injectJson(app, "POST", "/api/games", {
            name: "Browser Push Hider",
            role: "hider",
        });

        const response = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/push-subscriptions`,
            payload: {
                playerId: player.id,
                subscription: { ...subscription, expirationTime: null },
            },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({ subscribed: true });
    });

    it("rejects non-HTTPS push endpoints", async () => {
        const app = await buildApp({ databasePath: ":memory:" });
        apps.push(app);
        const { game, player } = await injectJson(app, "POST", "/api/games", {
            name: "Safe Push Hider",
            role: "hider",
        });

        const response = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/push-subscriptions`,
            payload: {
                playerId: player.id,
                subscription: {
                    ...subscription,
                    endpoint: "http://127.0.0.1:8080/internal",
                },
            },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("INVALID_SUBSCRIPTION");
    });

    it("enforces one hider and role rules without application authentication", async () => {
        const app = await buildApp({
            databasePath: ":memory:",
            pushSender: async () => {},
        });
        apps.push(app);
        const created = await app.inject({
            method: "POST",
            url: "/api/games",
            payload: { name: "Hider", role: "hider" },
        });
        const { game, player: hider } = created.json();

        const duplicateHider = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/join`,
            payload: { name: "Other", role: "hider" },
        });
        expect(duplicateHider.statusCode).toBe(409);

        const hiderSubmitting = await app.inject({
            method: "POST",
            url: `/api/games/${game.code}/questions`,
            payload: {
                playerId: hider.id,
                clientQuestionKey: 1,
                question: radiusQuestion,
            },
        });
        expect(hiderSubmitting.statusCode).toBe(403);
    });
});
