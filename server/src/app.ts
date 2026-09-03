import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import sharp from "sharp";
import { Server as SocketServer } from "socket.io";
import { z } from "zod";

const ROLES = ["hider", "seeker"] as const;
const PHOTO_SUBJECTS = [
    "any_building_visible_from_transit_station",
    "widest_street",
    "tree",
    "tallest_structure_in_sightline",
    "you",
    "sky",
    "tallest_building_visible_from_transit_station",
    "trace_nearest_street_or_path",
    "two_buildings",
    "restaurant_interior",
    "park",
    "grocery_store_aisle",
    "place_of_worship",
    "train_platform",
] as const;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const participantSchema = z
    .object({
        name: z.string().trim().min(1).max(32),
        role: z.enum(ROLES),
    })
    .strict();

const latitudeSchema = z.number().finite().min(-90).max(90);
const longitudeSchema = z.number().finite().min(-180).max(180);
const unitsSchema = z.enum(["miles", "kilometers", "meters"]);
const colorSchema = z.enum([
    "green",
    "black",
    "blue",
    "gold",
    "grey",
    "orange",
    "red",
    "violet",
]);
const ordinaryQuestionData = z
    .object({
        lat: latitudeSchema,
        lng: longitudeSchema,
        drag: z.boolean(),
        color: colorSchema,
        collapsed: z.boolean(),
    })
    .passthrough();
const questionEnvelope = <T extends z.ZodTypeAny>(
    id:
        | "radius"
        | "thermometer"
        | "tentacles"
        | "matching"
        | "measuring"
        | "photo",
    data: T,
) =>
    z
        .object({
            id: z.literal(id),
            key: z.number().finite(),
            data,
        })
        .strict();

const questionSchema = z.discriminatedUnion("id", [
    questionEnvelope(
        "radius",
        ordinaryQuestionData.extend({
            radius: z.number().finite().min(0),
            unit: unitsSchema,
            within: z.boolean(),
        }),
    ),
    questionEnvelope(
        "thermometer",
        z
            .object({
                latA: latitudeSchema,
                lngA: longitudeSchema,
                latB: latitudeSchema,
                lngB: longitudeSchema,
                warmer: z.boolean(),
                colorA: colorSchema,
                colorB: colorSchema,
                drag: z.boolean(),
                collapsed: z.boolean(),
            })
            .passthrough(),
    ),
    questionEnvelope(
        "tentacles",
        ordinaryQuestionData.extend({
            radius: z.number().finite().min(0),
            unit: unitsSchema,
            locationType: z.string().min(1).max(64),
            location: z.union([
                z.literal(false),
                z.record(z.string(), z.unknown()),
            ]),
            places: z.array(z.unknown()).max(10_000).optional(),
        }),
    ),
    questionEnvelope(
        "matching",
        ordinaryQuestionData.extend({
            type: z.string().min(1).max(64),
            same: z.boolean(),
            lengthComparison: z.enum(["shorter", "same", "longer"]).optional(),
        }),
    ),
    questionEnvelope(
        "measuring",
        ordinaryQuestionData.extend({
            type: z.string().min(1).max(64),
            hiderCloser: z.boolean(),
        }),
    ),
    questionEnvelope(
        "photo",
        z
            .object({
                subject: z.enum(PHOTO_SUBJECTS),
                collapsed: z.boolean(),
                response: z.literal("unanswered").optional(),
                drag: z.literal(false).optional(),
            })
            .strict(),
    ),
]);

const submitQuestionSchema = z
    .object({
        playerId: z.string().uuid(),
        clientQuestionKey: z.number().finite(),
        question: questionSchema,
    })
    .strict();

const answerSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("radius"), within: z.boolean() }).strict(),
    z.object({ type: z.literal("thermometer"), warmer: z.boolean() }).strict(),
    z
        .object({
            type: z.literal("tentacles"),
            location: z.union([
                z.literal(false),
                z.record(z.string(), z.unknown()),
            ]),
        })
        .strict(),
    z
        .object({
            type: z.literal("matching"),
            same: z.boolean(),
            lengthComparison: z.enum(["shorter", "same", "longer"]).optional(),
        })
        .strict(),
    z
        .object({ type: z.literal("measuring"), hiderCloser: z.boolean() })
        .strict(),
    z
        .object({
            type: z.literal("photo"),
            response: z.literal("cannot_answer"),
        })
        .strict(),
]);

const answerRequestSchema = z
    .object({
        playerId: z.string().uuid(),
        answer: answerSchema,
    })
    .strict();

const playerRequestSchema = z.object({ playerId: z.string().uuid() }).strict();

const pushEndpointSchema = z
    .string()
    .url()
    .max(4096)
    .refine((value) => {
        const url = new URL(value);
        return (
            url.protocol === "https:" &&
            url.username === "" &&
            url.password === "" &&
            url.hash === ""
        );
    }, "Push endpoints must be credential-free HTTPS URLs");

const pushSubscriptionSchema = z
    .object({
        endpoint: pushEndpointSchema,
        expirationTime: z.number().finite().nonnegative().nullable().optional(),
        keys: z
            .object({
                p256dh: z.string().min(1).max(512),
                auth: z.string().min(1).max(512),
            })
            .strict(),
    })
    .strict();

const pushRequestSchema = z
    .object({
        playerId: z.string().uuid(),
        subscription: pushSubscriptionSchema,
    })
    .strict();

const deletePushSchema = z
    .object({
        playerId: z.string().uuid(),
        endpoint: pushEndpointSchema,
    })
    .strict();

export type PushSubscriptionRecord = z.infer<typeof pushSubscriptionSchema>;
export type PushSender = (
    subscription: PushSubscriptionRecord,
    payload: string,
) => Promise<void>;

export type MultiplayerApp = FastifyInstance & {
    drainPush: () => Promise<void>;
};

export interface BuildAppOptions {
    databasePath: string;
    pushSender?: PushSender;
    vapidPublicKey?: string;
    logger?: boolean;
    pushPollMs?: number;
    uploadDirectory?: string;
    now?: () => string;
}

function now() {
    return new Date().toISOString();
}

export function answerDeadlineAt(createdAt: string, questionType: string) {
    const durationMs = questionType === "photo" ? 10 * 60_000 : 5 * 60_000;
    return new Date(Date.parse(createdAt) + durationMs).toISOString();
}

function generateCode() {
    const bytes = randomBytes(6);
    return Array.from(
        bytes,
        (value) => CODE_ALPHABET[value % CODE_ALPHABET.length],
    ).join("");
}

function parseJson<T>(value: unknown): T | null {
    if (typeof value !== "string") return null;
    return JSON.parse(value) as T;
}

function ensurePendingQuestionIndex(db: DatabaseSync) {
    const duplicatePendingGame = db
        .prepare(
            "SELECT game_id FROM questions WHERE status = 'pending' GROUP BY game_id HAVING COUNT(*) > 1 LIMIT 1",
        )
        .get();
    if (duplicatePendingGame) return;
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS one_pending_question_per_game
            ON questions(game_id) WHERE status = 'pending';
    `);
}

function migrate(db: DatabaseSync) {
    db.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;

        CREATE TABLE IF NOT EXISTS games (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE COLLATE NOCASE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS players (
            id TEXT PRIMARY KEY,
            game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            name TEXT NOT NULL COLLATE NOCASE,
            role TEXT NOT NULL CHECK (role IN ('hider', 'seeker')),
            joined_at TEXT NOT NULL,
            UNIQUE (game_id, name)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS one_hider_per_game
            ON players(game_id) WHERE role = 'hider';
        CREATE TABLE IF NOT EXISTS questions (
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
        CREATE TABLE IF NOT EXISTS answers (
            id TEXT PRIMARY KEY,
            question_id TEXT NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
            responder_player_id TEXT NOT NULL REFERENCES players(id),
            answer_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS photo_uploads (
            id TEXT PRIMARY KEY,
            question_id TEXT NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
            uploader_player_id TEXT NOT NULL REFERENCES players(id),
            storage_name TEXT NOT NULL UNIQUE,
            mime_type TEXT NOT NULL CHECK (mime_type = 'image/jpeg'),
            byte_size INTEGER NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id TEXT PRIMARY KEY,
            player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL,
            auth_secret TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS push_deliveries (
            id TEXT PRIMARY KEY,
            subscription_id TEXT REFERENCES push_subscriptions(id) ON DELETE SET NULL,
            game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            target_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK (kind IN ('question_received', 'answer_received', 'answer_due_soon')),
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dead')),
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TEXT NOT NULL,
            last_error TEXT,
            created_at TEXT NOT NULL,
            sent_at TEXT,
            UNIQUE (subscription_id, kind, question_id)
        );
        CREATE INDEX IF NOT EXISTS questions_by_game_created ON questions(game_id, created_at);
        DROP INDEX IF EXISTS one_pending_question_per_seeker;
        CREATE INDEX IF NOT EXISTS pending_push_deliveries ON push_deliveries(status, next_attempt_at);
    `);

    const pushDeliveryTable = db
        .prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'push_deliveries'",
        )
        .get() as { sql?: string } | undefined;
    if (!pushDeliveryTable?.sql?.includes("answer_due_soon")) {
        db.exec("BEGIN IMMEDIATE");
        try {
            db.exec(`
                ALTER TABLE push_deliveries RENAME TO push_deliveries_legacy;
                CREATE TABLE push_deliveries (
                    id TEXT PRIMARY KEY,
                    subscription_id TEXT REFERENCES push_subscriptions(id) ON DELETE SET NULL,
                    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                    target_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
                    kind TEXT NOT NULL CHECK (kind IN ('question_received', 'answer_received', 'answer_due_soon')),
                    payload_json TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dead')),
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_attempt_at TEXT NOT NULL,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    sent_at TEXT,
                    UNIQUE (subscription_id, kind, question_id)
                );
                INSERT INTO push_deliveries
                    (id, subscription_id, game_id, target_player_id, question_id, kind,
                     payload_json, status, attempts, next_attempt_at, last_error, created_at, sent_at)
                SELECT id, subscription_id, game_id, target_player_id, question_id, kind,
                       payload_json, status, attempts, next_attempt_at, last_error, created_at, sent_at
                FROM push_deliveries_legacy;
                DROP TABLE push_deliveries_legacy;
                CREATE INDEX pending_push_deliveries
                    ON push_deliveries(status, next_attempt_at);
            `);
            db.exec("COMMIT");
        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }

    const questionColumns = db
        .prepare("PRAGMA table_info(questions)")
        .all() as Array<{
        name: string;
    }>;
    if (!questionColumns.some((column) => column.name === "answer_due_at")) {
        db.exec("ALTER TABLE questions ADD COLUMN answer_due_at TEXT");
    }
    const missingDeadlines = db
        .prepare(
            "SELECT id, question_json, created_at FROM questions WHERE answer_due_at IS NULL",
        )
        .all() as any[];
    const updateDeadline = db.prepare(
        "UPDATE questions SET answer_due_at = ? WHERE id = ?",
    );
    for (const row of missingDeadlines) {
        const question = parseJson<{ id?: string }>(row.question_json);
        updateDeadline.run(
            answerDeadlineAt(row.created_at, question?.id ?? "unknown"),
            row.id,
        );
    }
    ensurePendingQuestionIndex(db);
}

function errorReply(reply: any, status: number, code: string, message: string) {
    return reply.code(status).send({ error: { code, message } });
}

const shortUnit = (unit: string) =>
    ({ kilometers: "km", miles: "mi", meters: "m" })[unit] ?? unit;

const readableType = (value: string) =>
    value
        .replace(/-full$/, "")
        .replaceAll("_", " ")
        .replaceAll("-", " ");

function questionNotificationLabel(question: any) {
    switch (question.id) {
        case "radius":
            return `${question.data.radius}${shortUnit(question.data.unit)} radar`;
        case "thermometer":
            return "Thermometer";
        case "tentacles":
            return `${question.data.radius}${shortUnit(question.data.unit)} ${readableType(question.data.locationType)} tentacles`;
        case "matching":
            return `${readableType(question.data.type)} matching`;
        case "measuring":
            return `${readableType(question.data.type)} measuring`;
        case "photo":
            return `${readableType(question.data.subject)} photo`;
        default:
            return "question";
    }
}

function answerNotificationBody(question: any, answer: any) {
    let result = "Answered";
    switch (question.id) {
        case "radius":
            result = answer.within ? "Inside" : "Outside";
            break;
        case "thermometer":
            result = answer.warmer ? "Warmer" : "Colder";
            break;
        case "tentacles":
            result =
                answer.location?.properties?.name ??
                (answer.location ? "Location found" : "No matching location");
            break;
        case "matching":
            result = answer.lengthComparison
                ? readableType(answer.lengthComparison)
                : answer.same
                  ? "Same"
                  : "Different";
            break;
        case "measuring":
            result = answer.hiderCloser ? "Hider closer" : "Seeker closer";
            break;
        case "photo":
            result =
                answer.response === "photo"
                    ? "Photo received"
                    : "Cannot answer";
            break;
    }
    return `${questionNotificationLabel(question)}: ${result}`;
}

function answerDueSoonPushPayload(
    gameCode: string,
    questionId: string,
    question: any,
) {
    return {
        kind: "answer_due_soon",
        gameCode,
        questionId,
        questionType: question?.id ?? "unknown",
        title: "1 minute left",
        body: `1 minute left to answer ${questionNotificationLabel(question)}`,
        url: `/?game=${encodeURIComponent(gameCode)}`,
    };
}

export async function buildApp(
    options: BuildAppOptions,
): Promise<MultiplayerApp> {
    const clock = options.now ?? now;
    if (options.databasePath !== ":memory:") {
        mkdirSync(dirname(options.databasePath), { recursive: true });
    }
    const db = new DatabaseSync(options.databasePath);
    migrate(db);
    const uploadDirectory =
        options.uploadDirectory ??
        (options.databasePath === ":memory:"
            ? join("/tmp", "jetlag-map-uploads")
            : join(dirname(options.databasePath), "uploads"));
    mkdirSync(uploadDirectory, { recursive: true, mode: 0o700 });
    if (options.databasePath !== ":memory:") {
        const knownStorageNames = new Set(
            (
                db.prepare("SELECT storage_name FROM photo_uploads").all() as {
                    storage_name: string;
                }[]
            ).map((row) => row.storage_name),
        );
        for (const storageName of readdirSync(uploadDirectory)) {
            if (
                /^[0-9a-f-]{36}\.jpg$/.test(storageName) &&
                !knownStorageNames.has(storageName)
            ) {
                try {
                    unlinkSync(join(uploadDirectory, storageName));
                } catch {
                    // A concurrent cleanup or filesystem error is non-fatal here.
                }
            }
        }
    }

    const app = Fastify({
        logger: options.logger ?? false,
        bodyLimit: 64 * 1024,
        trustProxy: "127.0.0.1",
    }) as unknown as MultiplayerApp;
    await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
    await app.register(multipart, {
        limits: {
            fileSize: 10 * 1024 * 1024,
            files: 1,
            fields: 1,
            parts: 2,
        },
    });
    const io = new SocketServer(app.server, {
        path: "/socket.io",
        cors: { origin: false },
    });

    const getGame = (code: string) =>
        db
            .prepare("SELECT * FROM games WHERE code = ? COLLATE NOCASE")
            .get(code) as any;
    const getPlayer = (id: string, gameId: string) =>
        db
            .prepare("SELECT * FROM players WHERE id = ? AND game_id = ?")
            .get(id, gameId) as any;
    const playerResource = (row: any) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        joinedAt: row.joined_at,
    });
    const gameResource = (row: any) => ({
        code: row.code,
        createdAt: row.created_at,
    });

    const questionResource = (row: any) => {
        const answerRow = db
            .prepare(
                "SELECT answer_json, created_at, responder_player_id FROM answers WHERE question_id = ?",
            )
            .get(row.id) as any;
        return {
            id: row.id,
            senderPlayerId: row.sender_player_id,
            clientQuestionKey: row.client_question_key,
            question: parseJson(row.question_json),
            status: row.status,
            answer: answerRow ? parseJson(answerRow.answer_json) : null,
            createdAt: row.created_at,
            answerDueAt:
                row.answer_due_at ??
                answerDeadlineAt(
                    row.created_at,
                    parseJson<{ id?: string }>(row.question_json)?.id ??
                        "unknown",
                ),
            answeredAt: answerRow?.created_at ?? null,
            answeredLate: answerRow
                ? Date.parse(answerRow.created_at) >
                  Date.parse(
                      row.answer_due_at ??
                          answerDeadlineAt(
                              row.created_at,
                              parseJson<{ id?: string }>(row.question_json)
                                  ?.id ?? "unknown",
                          ),
                  )
                : null,
        };
    };

    const snapshot = (game: any) => ({
        game: gameResource(game),
        players: (
            db
                .prepare(
                    "SELECT * FROM players WHERE game_id = ? ORDER BY joined_at",
                )
                .all(game.id) as any[]
        ).map(playerResource),
        questions: (
            db
                .prepare(
                    "SELECT * FROM questions WHERE game_id = ? ORDER BY created_at",
                )
                .all(game.id) as any[]
        ).map(questionResource),
    });

    const enqueuePush = (
        game: any,
        targetPlayerId: string,
        questionId: string,
        kind: "question_received" | "answer_received" | "answer_due_soon",
        payload: Record<string, unknown>,
        nextAttemptAt?: string,
    ) => {
        const subscriptions = db
            .prepare("SELECT id FROM push_subscriptions WHERE player_id = ?")
            .all(targetPlayerId) as any[];
        const insert = db.prepare(`INSERT OR IGNORE INTO push_deliveries
            (id, subscription_id, game_id, target_player_id, question_id, kind, payload_json, next_attempt_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const subscription of subscriptions) {
            const timestamp = clock();
            insert.run(
                randomUUID(),
                subscription.id,
                game.id,
                targetPlayerId,
                questionId,
                kind,
                JSON.stringify(payload),
                nextAttemptAt ?? timestamp,
                timestamp,
            );
        }
    };

    const enqueueAnswerPushToSeekers = (
        game: any,
        questionId: string,
        question: any,
        answer: any,
        responderName: string,
    ) => {
        const seekers = db
            .prepare(
                "SELECT id FROM players WHERE game_id = ? AND role = 'seeker'",
            )
            .all(game.id) as { id: string }[];
        const payload = {
            kind: "answer_received",
            gameCode: game.code,
            questionId,
            questionType: question.id,
            from: responderName,
            title: "Answer received",
            body: answerNotificationBody(question, answer),
            url: `/?game=${encodeURIComponent(game.code)}`,
        };
        for (const seeker of seekers) {
            enqueuePush(
                game,
                seeker.id,
                questionId,
                "answer_received",
                payload,
            );
        }
    };

    const cancelPendingDeliveries = (
        subscriptionId: string,
        reason: string,
    ) => {
        db.prepare(
            "UPDATE push_deliveries SET status = 'dead', last_error = ? WHERE subscription_id = ? AND status = 'pending'",
        ).run(reason, subscriptionId);
    };

    const cancelAnswerDueSoonPush = (questionId: string) => {
        db.prepare(
            "UPDATE push_deliveries SET status = 'dead', last_error = 'question answered' WHERE question_id = ? AND kind = 'answer_due_soon' AND status = 'pending'",
        ).run(questionId);
    };

    const enqueueAnswerDueSoonPushes = () => {
        const timestamp = clock();
        const threshold = new Date(
            Date.parse(timestamp) + 60_000,
        ).toISOString();
        const reminders = db
            .prepare(
                `SELECT q.id AS question_id, q.question_json,
                        g.id AS game_id, g.code AS game_code,
                        h.id AS hider_player_id
                 FROM questions q
                 JOIN games g ON g.id = q.game_id
                 JOIN players h ON h.game_id = q.game_id AND h.role = 'hider'
                 WHERE q.status = 'pending'
                   AND q.answer_due_at > ?
                   AND q.answer_due_at <= ?`,
            )
            .all(timestamp, threshold) as any[];

        for (const reminder of reminders) {
            const question = parseJson<any>(reminder.question_json);
            enqueuePush(
                { id: reminder.game_id, code: reminder.game_code },
                reminder.hider_player_id,
                reminder.question_id,
                "answer_due_soon",
                answerDueSoonPushPayload(
                    reminder.game_code,
                    reminder.question_id,
                    question,
                ),
            );
        }
    };

    const performPushDrain = async () => {
        if (!options.pushSender) return;
        enqueueAnswerDueSoonPushes();
        const deliveries = db
            .prepare(
                `SELECT d.*, s.endpoint, s.p256dh, s.auth_secret
            FROM push_deliveries d JOIN push_subscriptions s
                ON s.id = d.subscription_id AND s.player_id = d.target_player_id
            JOIN questions q ON q.id = d.question_id
            WHERE d.status = 'pending'
              AND d.next_attempt_at <= ?
              AND (d.kind <> 'answer_due_soon' OR q.status = 'pending')
            ORDER BY d.created_at LIMIT 50`,
            )
            .all(clock()) as any[];
        await Promise.all(
            deliveries.map(async (delivery) => {
                try {
                    await options.pushSender!(
                        {
                            endpoint: delivery.endpoint,
                            keys: {
                                p256dh: delivery.p256dh,
                                auth: delivery.auth_secret,
                            },
                        },
                        delivery.payload_json,
                    );
                    db.prepare(
                        "UPDATE push_deliveries SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ?",
                    ).run(clock(), delivery.id);
                } catch (error: any) {
                    const statusCode = Number(error?.statusCode ?? 0);
                    if (statusCode === 404 || statusCode === 410) {
                        db.exec("BEGIN IMMEDIATE");
                        try {
                            cancelPendingDeliveries(
                                delivery.subscription_id,
                                `stale subscription (${statusCode})`,
                            );
                            db.prepare(
                                "DELETE FROM push_subscriptions WHERE id = ?",
                            ).run(delivery.subscription_id);
                            db.exec("COMMIT");
                        } catch (transactionError) {
                            db.exec("ROLLBACK");
                            throw transactionError;
                        }
                        return;
                    }

                    const attempts = Number(delivery.attempts) + 1;
                    const dead = attempts >= 10;
                    const retryAfterHeader = error?.headers?.["retry-after"];
                    const retryAfter = Array.isArray(retryAfterHeader)
                        ? retryAfterHeader[0]
                        : retryAfterHeader;
                    const retryAfterSeconds = Number(retryAfter);
                    const retryAfterDate =
                        typeof retryAfter === "string"
                            ? Date.parse(retryAfter)
                            : Number.NaN;
                    const retryAfterDelay = Number.isFinite(retryAfterSeconds)
                        ? retryAfterSeconds * 1000
                        : retryAfterDate - Date.now();
                    const exponentialDelay = Math.min(
                        60_000,
                        1000 * 2 ** Math.max(0, attempts - 1),
                    );
                    const delayMs =
                        Number.isFinite(retryAfterDelay) && retryAfterDelay > 0
                            ? Math.min(300_000, retryAfterDelay)
                            : exponentialDelay;
                    db.prepare(
                        "UPDATE push_deliveries SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?",
                    ).run(
                        dead ? "dead" : "pending",
                        attempts,
                        new Date(Date.now() + delayMs).toISOString(),
                        String(error?.message ?? error),
                        delivery.id,
                    );
                }
            }),
        );
    };
    let activePushDrain: Promise<void> | null = null;
    const drainPush = () => {
        if (!activePushDrain) {
            activePushDrain = performPushDrain().finally(() => {
                activePushDrain = null;
            });
        }
        return activePushDrain;
    };
    app.drainPush = drainPush;

    const pushTimer = setInterval(
        () => void drainPush(),
        options.pushPollMs ?? 2000,
    );
    pushTimer.unref();

    app.get("/healthz", async (_request, reply) => {
        try {
            db.prepare("SELECT 1").get();
            return {
                status: "ok",
                pushConfigured: Boolean(options.pushSender),
            };
        } catch {
            return reply.code(503).send({ status: "error" });
        }
    });

    app.post(
        "/api/games",
        { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
        async (request, reply) => {
            const parsed = participantSchema.safeParse(request.body);
            if (!parsed.success)
                return errorReply(
                    reply,
                    400,
                    "INVALID_PARTICIPANT",
                    parsed.error.issues[0]?.message ?? "Invalid participant",
                );
            let code = "";
            for (let attempt = 0; attempt < 10; attempt += 1) {
                code = generateCode();
                if (!getGame(code)) break;
            }
            const game = { id: randomUUID(), code, created_at: now() };
            const player = {
                id: randomUUID(),
                game_id: game.id,
                name: parsed.data.name,
                role: parsed.data.role,
                joined_at: now(),
            };
            db.exec("BEGIN IMMEDIATE");
            try {
                db.prepare(
                    "INSERT INTO games (id, code, created_at) VALUES (?, ?, ?)",
                ).run(game.id, game.code, game.created_at);
                db.prepare(
                    "INSERT INTO players (id, game_id, name, role, joined_at) VALUES (?, ?, ?, ?, ?)",
                ).run(
                    player.id,
                    player.game_id,
                    player.name,
                    player.role,
                    player.joined_at,
                );
                db.exec("COMMIT");
            } catch (error) {
                db.exec("ROLLBACK");
                throw error;
            }
            return reply.code(201).send({
                game: gameResource(game),
                player: playerResource(player),
            });
        },
    );

    app.post(
        "/api/games/:code/join",
        { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
        async (request: any, reply) => {
            const parsed = participantSchema.safeParse(request.body);
            if (!parsed.success)
                return errorReply(
                    reply,
                    400,
                    "INVALID_PARTICIPANT",
                    parsed.error.issues[0]?.message ?? "Invalid participant",
                );
            const game = getGame(request.params.code);
            if (!game)
                return errorReply(
                    reply,
                    404,
                    "GAME_NOT_FOUND",
                    "Game not found",
                );
            const existing = db
                .prepare(
                    "SELECT * FROM players WHERE game_id = ? AND name = ? COLLATE NOCASE",
                )
                .get(game.id, parsed.data.name) as any;
            if (existing) {
                if (existing.role !== parsed.data.role)
                    return errorReply(
                        reply,
                        409,
                        "ROLE_CONFLICT",
                        "That name already uses another role",
                    );
                return reply.send({
                    game: gameResource(game),
                    player: playerResource(existing),
                });
            }
            if (
                parsed.data.role === "hider" &&
                db
                    .prepare(
                        "SELECT 1 FROM players WHERE game_id = ? AND role = 'hider'",
                    )
                    .get(game.id)
            ) {
                return errorReply(
                    reply,
                    409,
                    "HIDER_TAKEN",
                    "This game already has a hider",
                );
            }
            const player = {
                id: randomUUID(),
                game_id: game.id,
                name: parsed.data.name,
                role: parsed.data.role,
                joined_at: now(),
            };
            db.prepare(
                "INSERT INTO players (id, game_id, name, role, joined_at) VALUES (?, ?, ?, ?, ?)",
            ).run(
                player.id,
                player.game_id,
                player.name,
                player.role,
                player.joined_at,
            );
            const resource = playerResource(player);
            io.to(`game:${game.id}`).emit("player:joined", resource);
            return reply
                .code(201)
                .send({ game: gameResource(game), player: resource });
        },
    );

    app.get("/api/games/:code/snapshot", async (request: any, reply) => {
        const game = getGame(request.params.code);
        if (!game)
            return errorReply(reply, 404, "GAME_NOT_FOUND", "Game not found");
        return snapshot(game);
    });

    app.post("/api/games/:code/questions", async (request: any, reply) => {
        const parsed = submitQuestionSchema.safeParse(request.body);
        if (!parsed.success)
            return errorReply(
                reply,
                400,
                "INVALID_QUESTION",
                parsed.error.issues[0]?.message ?? "Invalid question",
            );
        const game = getGame(request.params.code);
        if (!game)
            return errorReply(reply, 404, "GAME_NOT_FOUND", "Game not found");
        const player = getPlayer(parsed.data.playerId, game.id);
        if (!player)
            return errorReply(
                reply,
                403,
                "PLAYER_NOT_IN_GAME",
                "Player does not belong to this game",
            );
        if (player.role !== "seeker")
            return errorReply(
                reply,
                403,
                "SEEKER_REQUIRED",
                "Only seekers can submit questions",
            );
        const prior = db
            .prepare(
                "SELECT * FROM questions WHERE sender_player_id = ? AND client_question_key = ?",
            )
            .get(player.id, parsed.data.clientQuestionKey) as any;
        if (prior) return reply.send({ question: questionResource(prior) });
        const createdAt = clock();
        const question = {
            id: randomUUID(),
            game_id: game.id,
            sender_player_id: player.id,
            client_question_key: parsed.data.clientQuestionKey,
            question_json: JSON.stringify(parsed.data.question),
            status: "pending",
            created_at: createdAt,
            answer_due_at: answerDeadlineAt(createdAt, parsed.data.question.id),
        };
        const hider = db
            .prepare(
                "SELECT * FROM players WHERE game_id = ? AND role = 'hider'",
            )
            .get(game.id) as any;
        db.exec("BEGIN IMMEDIATE");
        try {
            const pending = db
                .prepare(
                    "SELECT id FROM questions WHERE game_id = ? AND status = 'pending' LIMIT 1",
                )
                .get(game.id);
            if (pending) {
                db.exec("ROLLBACK");
                return errorReply(
                    reply,
                    409,
                    "PENDING_QUESTION_EXISTS",
                    "Wait for the pending question to be answered before sending another",
                );
            }
            db.prepare(
                `INSERT INTO questions (id, game_id, sender_player_id, client_question_key, question_json, status, created_at, answer_due_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
                question.id,
                question.game_id,
                question.sender_player_id,
                question.client_question_key,
                question.question_json,
                question.status,
                question.created_at,
                question.answer_due_at,
            );
            if (hider) {
                enqueuePush(game, hider.id, question.id, "question_received", {
                    kind: "question_received",
                    gameCode: game.code,
                    questionId: question.id,
                    questionType: parsed.data.question.id,
                    from: player.name,
                    title: "New question",
                    body: `New ${parsed.data.question.id} question from ${player.name}`,
                    url: `/?game=${encodeURIComponent(game.code)}`,
                });
                enqueuePush(
                    game,
                    hider.id,
                    question.id,
                    "answer_due_soon",
                    answerDueSoonPushPayload(
                        game.code,
                        question.id,
                        parsed.data.question,
                    ),
                    new Date(
                        Date.parse(question.answer_due_at) - 60_000,
                    ).toISOString(),
                );
            }
            db.exec("COMMIT");
        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
        const resource = questionResource(question);
        io.to(`game:${game.id}`).emit("question:created", resource);
        void drainPush();
        return reply.code(201).send({ question: resource });
    });

    app.delete(
        "/api/games/:code/questions/:questionId",
        async (request: any, reply) => {
            const parsed = playerRequestSchema.safeParse(request.body);
            if (!parsed.success)
                return errorReply(
                    reply,
                    400,
                    "INVALID_UNASK_REQUEST",
                    "A valid seeker playerId is required",
                );
            const game = getGame(request.params.code);
            if (!game)
                return errorReply(
                    reply,
                    404,
                    "GAME_NOT_FOUND",
                    "Game not found",
                );
            const player = getPlayer(parsed.data.playerId, game.id);
            if (!player)
                return errorReply(
                    reply,
                    403,
                    "PLAYER_NOT_IN_GAME",
                    "Player does not belong to this game",
                );
            const question = db
                .prepare("SELECT * FROM questions WHERE id = ? AND game_id = ?")
                .get(request.params.questionId, game.id) as any;
            if (!question)
                return errorReply(
                    reply,
                    404,
                    "QUESTION_NOT_FOUND",
                    "Question not found",
                );
            if (question.sender_player_id !== player.id)
                return errorReply(
                    reply,
                    403,
                    "QUESTION_OWNER_REQUIRED",
                    "Only the seeker who asked this question can un-ask it",
                );
            if (question.status !== "pending")
                return errorReply(
                    reply,
                    409,
                    "QUESTION_ALREADY_ANSWERED",
                    "Answered questions cannot be un-asked",
                );

            db.exec("BEGIN IMMEDIATE");
            try {
                const deleted = db
                    .prepare(
                        "DELETE FROM questions WHERE id = ? AND game_id = ? AND sender_player_id = ? AND status = 'pending'",
                    )
                    .run(question.id, game.id, player.id);
                if (deleted.changes !== 1) {
                    db.exec("ROLLBACK");
                    return errorReply(
                        reply,
                        409,
                        "QUESTION_CHANGED",
                        "The question changed before it could be un-asked",
                    );
                }
                db.exec("COMMIT");
            } catch (error) {
                db.exec("ROLLBACK");
                throw error;
            }
            ensurePendingQuestionIndex(db);

            io.to(`game:${game.id}`).emit("question:removed", {
                questionId: question.id,
            });
            return reply.send({ questionId: question.id });
        },
    );

    app.post(
        "/api/games/:code/questions/:questionId/photo-answer",
        {
            config: {
                rateLimit: { max: 10, timeWindow: "1 minute" },
            },
        },
        async (request: any, reply) => {
            let playerId: string | null = null;
            let sourceImage: Buffer | null = null;
            try {
                for await (const part of request.parts()) {
                    if (part.type === "file") {
                        if (part.fieldname !== "photo" || sourceImage) {
                            part.file.resume();
                            return errorReply(
                                reply,
                                400,
                                "INVALID_PHOTO_UPLOAD",
                                "Exactly one photo file is required",
                            );
                        }
                        sourceImage = await part.toBuffer();
                        if (part.file.truncated) {
                            return errorReply(
                                reply,
                                413,
                                "PHOTO_TOO_LARGE",
                                "Photos must be 10 MiB or smaller",
                            );
                        }
                    } else if (part.fieldname === "playerId" && !playerId) {
                        playerId = String(part.value);
                    } else {
                        return errorReply(
                            reply,
                            400,
                            "INVALID_PHOTO_UPLOAD",
                            "Unexpected upload field",
                        );
                    }
                }
            } catch (error: any) {
                if (
                    error?.code === "FST_REQ_FILE_TOO_LARGE" ||
                    error?.name === "RequestFileTooLargeError"
                ) {
                    return errorReply(
                        reply,
                        413,
                        "PHOTO_TOO_LARGE",
                        "Photos must be 10 MiB or smaller",
                    );
                }
                throw error;
            }
            const parsedPlayerId = z.string().uuid().safeParse(playerId);
            if (!parsedPlayerId.success || !sourceImage) {
                return errorReply(
                    reply,
                    400,
                    "INVALID_PHOTO_UPLOAD",
                    "A hider playerId and photo file are required",
                );
            }

            const game = getGame(request.params.code);
            if (!game)
                return errorReply(
                    reply,
                    404,
                    "GAME_NOT_FOUND",
                    "Game not found",
                );
            const player = getPlayer(parsedPlayerId.data, game.id);
            if (!player)
                return errorReply(
                    reply,
                    403,
                    "PLAYER_NOT_IN_GAME",
                    "Player does not belong to this game",
                );
            if (player.role !== "hider")
                return errorReply(
                    reply,
                    403,
                    "HIDER_REQUIRED",
                    "Only the hider can answer questions",
                );
            const question = db
                .prepare("SELECT * FROM questions WHERE id = ? AND game_id = ?")
                .get(request.params.questionId, game.id) as any;
            if (!question)
                return errorReply(
                    reply,
                    404,
                    "QUESTION_NOT_FOUND",
                    "Question not found",
                );
            const original = parseJson<any>(question.question_json);
            if (original?.id !== "photo")
                return errorReply(
                    reply,
                    400,
                    "ANSWER_TYPE_MISMATCH",
                    "Photo uploads can only answer photo questions",
                );
            if (question.status === "answered")
                return errorReply(
                    reply,
                    409,
                    "ALREADY_ANSWERED",
                    "Question already answered",
                );

            let sanitized: Buffer;
            let width: number;
            let height: number;
            try {
                const metadata = await sharp(sourceImage, {
                    failOn: "warning",
                    limitInputPixels: 40_000_000,
                }).metadata();
                if (
                    !metadata.format ||
                    !["jpeg", "png", "webp"].includes(metadata.format)
                ) {
                    return errorReply(
                        reply,
                        415,
                        "UNSUPPORTED_PHOTO",
                        "Use a JPEG, PNG, or WebP photo",
                    );
                }
                if ((metadata.pages ?? 1) !== 1) {
                    return errorReply(
                        reply,
                        415,
                        "UNSUPPORTED_PHOTO",
                        "Animated or multi-page photos are not supported",
                    );
                }
                const processed = await sharp(sourceImage, {
                    failOn: "warning",
                    limitInputPixels: 40_000_000,
                })
                    .rotate()
                    .resize({
                        width: 2560,
                        height: 2560,
                        fit: "inside",
                        withoutEnlargement: true,
                    })
                    .flatten({ background: "#ffffff" })
                    .jpeg({ quality: 90, mozjpeg: true })
                    .toBuffer({ resolveWithObject: true });
                sanitized = processed.data;
                width = processed.info.width;
                height = processed.info.height;
            } catch {
                return errorReply(
                    reply,
                    415,
                    "INVALID_PHOTO",
                    "The uploaded file is not a valid supported image",
                );
            }

            const uploadId = randomUUID();
            const storageName = `${randomUUID()}.jpg`;
            const storagePath = join(uploadDirectory, storageName);
            await writeFile(storagePath, sanitized, {
                flag: "wx",
                mode: 0o600,
            });
            const answeredAt = clock();
            const answer = {
                type: "photo",
                response: "photo",
                uploadId,
            } as const;
            const sender = db
                .prepare("SELECT * FROM players WHERE id = ?")
                .get(question.sender_player_id) as any;
            try {
                db.exec("BEGIN IMMEDIATE");
                const current = db
                    .prepare("SELECT status FROM questions WHERE id = ?")
                    .get(question.id) as any;
                if (current?.status !== "pending") {
                    db.exec("ROLLBACK");
                    await unlink(storagePath).catch(() => undefined);
                    return errorReply(
                        reply,
                        409,
                        "ALREADY_ANSWERED",
                        "Question already answered",
                    );
                }
                db.prepare(
                    `INSERT INTO photo_uploads
                    (id, question_id, uploader_player_id, storage_name, mime_type, byte_size, width, height, created_at)
                    VALUES (?, ?, ?, ?, 'image/jpeg', ?, ?, ?, ?)`,
                ).run(
                    uploadId,
                    question.id,
                    player.id,
                    storageName,
                    sanitized.byteLength,
                    width,
                    height,
                    answeredAt,
                );
                db.prepare(
                    "UPDATE questions SET status = 'answered' WHERE id = ? AND status = 'pending'",
                ).run(question.id);
                cancelAnswerDueSoonPush(question.id);
                db.prepare(
                    "INSERT INTO answers (id, question_id, responder_player_id, answer_json, created_at) VALUES (?, ?, ?, ?, ?)",
                ).run(
                    randomUUID(),
                    question.id,
                    player.id,
                    JSON.stringify(answer),
                    answeredAt,
                );
                enqueueAnswerPushToSeekers(
                    game,
                    question.id,
                    JSON.parse(question.question_json),
                    answer,
                    player.name,
                );
                db.exec("COMMIT");
            } catch (error) {
                try {
                    db.exec("ROLLBACK");
                } catch {
                    // The transaction may already have been rolled back.
                }
                await unlink(storagePath).catch(() => undefined);
                throw error;
            }
            ensurePendingQuestionIndex(db);
            question.status = "answered";
            const resource = questionResource(question);
            io.to(`game:${game.id}`).emit("question:answered", resource);
            void drainPush();
            return reply.send({
                question: resource,
                sender: sender ? playerResource(sender) : null,
            });
        },
    );

    app.get(
        "/api/games/:code/photos/:uploadId",
        async (request: any, reply) => {
            const parsedId = z
                .string()
                .uuid()
                .safeParse(request.params.uploadId);
            if (!parsedId.success)
                return errorReply(
                    reply,
                    404,
                    "PHOTO_NOT_FOUND",
                    "Photo not found",
                );
            const upload = db
                .prepare(
                    `SELECT photo_uploads.*
                     FROM photo_uploads
                     JOIN questions ON questions.id = photo_uploads.question_id
                     JOIN games ON games.id = questions.game_id
                     WHERE photo_uploads.id = ? AND games.code = ? COLLATE NOCASE`,
                )
                .get(parsedId.data, request.params.code) as any;
            if (!upload || !/^[0-9a-f-]{36}\.jpg$/.test(upload.storage_name))
                return errorReply(
                    reply,
                    404,
                    "PHOTO_NOT_FOUND",
                    "Photo not found",
                );
            try {
                const file = await readFile(
                    join(uploadDirectory, upload.storage_name),
                );
                return reply
                    .header("Cache-Control", "private, no-store")
                    .header(
                        "Content-Disposition",
                        `inline; filename="photo-${parsedId.data}.jpg"`,
                    )
                    .header(
                        "Content-Security-Policy",
                        "default-src 'none'; sandbox",
                    )
                    .header("Cross-Origin-Resource-Policy", "same-origin")
                    .header("Referrer-Policy", "no-referrer")
                    .header("X-Content-Type-Options", "nosniff")
                    .type("image/jpeg")
                    .send(file);
            } catch {
                return errorReply(
                    reply,
                    404,
                    "PHOTO_NOT_FOUND",
                    "Photo not found",
                );
            }
        },
    );

    app.post(
        "/api/games/:code/questions/:questionId/answer",
        async (request: any, reply) => {
            const parsed = answerRequestSchema.safeParse(request.body);
            if (!parsed.success)
                return errorReply(
                    reply,
                    400,
                    "INVALID_ANSWER",
                    parsed.error.issues[0]?.message ?? "Invalid answer",
                );
            const game = getGame(request.params.code);
            if (!game)
                return errorReply(
                    reply,
                    404,
                    "GAME_NOT_FOUND",
                    "Game not found",
                );
            const player = getPlayer(parsed.data.playerId, game.id);
            if (!player)
                return errorReply(
                    reply,
                    403,
                    "PLAYER_NOT_IN_GAME",
                    "Player does not belong to this game",
                );
            if (player.role !== "hider")
                return errorReply(
                    reply,
                    403,
                    "HIDER_REQUIRED",
                    "Only the hider can answer questions",
                );
            const question = db
                .prepare("SELECT * FROM questions WHERE id = ? AND game_id = ?")
                .get(request.params.questionId, game.id) as any;
            if (!question)
                return errorReply(
                    reply,
                    404,
                    "QUESTION_NOT_FOUND",
                    "Question not found",
                );
            const original = parseJson<any>(question.question_json);
            if (original?.id !== parsed.data.answer.type)
                return errorReply(
                    reply,
                    400,
                    "ANSWER_TYPE_MISMATCH",
                    "Answer type does not match question",
                );
            if (question.status === "answered")
                return errorReply(
                    reply,
                    409,
                    "ALREADY_ANSWERED",
                    "Question already answered",
                );
            const answerId = randomUUID();
            const answeredAt = clock();
            const sender = db
                .prepare("SELECT * FROM players WHERE id = ?")
                .get(question.sender_player_id) as any;
            db.exec("BEGIN IMMEDIATE");
            try {
                db.prepare(
                    "UPDATE questions SET status = 'answered' WHERE id = ? AND status = 'pending'",
                ).run(question.id);
                cancelAnswerDueSoonPush(question.id);
                db.prepare(
                    "INSERT INTO answers (id, question_id, responder_player_id, answer_json, created_at) VALUES (?, ?, ?, ?, ?)",
                ).run(
                    answerId,
                    question.id,
                    player.id,
                    JSON.stringify(parsed.data.answer),
                    answeredAt,
                );
                enqueueAnswerPushToSeekers(
                    game,
                    question.id,
                    original,
                    parsed.data.answer,
                    player.name,
                );
                db.exec("COMMIT");
            } catch (error) {
                db.exec("ROLLBACK");
                throw error;
            }
            ensurePendingQuestionIndex(db);
            question.status = "answered";
            const resource = questionResource(question);
            io.to(`game:${game.id}`).emit("question:answered", resource);
            void drainPush();
            return reply.send({
                question: resource,
                sender: sender ? playerResource(sender) : null,
            });
        },
    );

    app.get("/api/push/vapid-public-key", async () => ({
        publicKey: options.vapidPublicKey ?? null,
    }));

    app.post(
        "/api/games/:code/push-subscriptions",
        async (request: any, reply) => {
            const parsed = pushRequestSchema.safeParse(request.body);
            if (!parsed.success)
                return errorReply(
                    reply,
                    400,
                    "INVALID_SUBSCRIPTION",
                    parsed.error.issues[0]?.message ?? "Invalid subscription",
                );
            const game = getGame(request.params.code);
            if (!game)
                return errorReply(
                    reply,
                    404,
                    "GAME_NOT_FOUND",
                    "Game not found",
                );
            const player = getPlayer(parsed.data.playerId, game.id);
            if (!player)
                return errorReply(
                    reply,
                    403,
                    "PLAYER_NOT_IN_GAME",
                    "Player does not belong to this game",
                );
            const timestamp = now();
            const existing = db
                .prepare(
                    "SELECT id, player_id FROM push_subscriptions WHERE endpoint = ?",
                )
                .get(parsed.data.subscription.endpoint) as any;
            if (existing) {
                db.exec("BEGIN IMMEDIATE");
                try {
                    if (existing.player_id !== player.id) {
                        cancelPendingDeliveries(
                            existing.id,
                            "push endpoint reassigned to another participant",
                        );
                    }
                    db.prepare(
                        "UPDATE push_subscriptions SET player_id = ?, p256dh = ?, auth_secret = ?, updated_at = ? WHERE id = ?",
                    ).run(
                        player.id,
                        parsed.data.subscription.keys.p256dh,
                        parsed.data.subscription.keys.auth,
                        timestamp,
                        existing.id,
                    );
                    db.exec("COMMIT");
                } catch (error) {
                    db.exec("ROLLBACK");
                    throw error;
                }
            } else {
                db.prepare(
                    "INSERT INTO push_subscriptions (id, player_id, endpoint, p256dh, auth_secret, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ).run(
                    randomUUID(),
                    player.id,
                    parsed.data.subscription.endpoint,
                    parsed.data.subscription.keys.p256dh,
                    parsed.data.subscription.keys.auth,
                    timestamp,
                    timestamp,
                );
            }
            return reply.code(201).send({ subscribed: true });
        },
    );

    app.delete(
        "/api/games/:code/push-subscriptions",
        async (request: any, reply) => {
            const parsed = deletePushSchema.safeParse(request.body);
            if (!parsed.success)
                return errorReply(
                    reply,
                    400,
                    "INVALID_SUBSCRIPTION",
                    parsed.error.issues[0]?.message ?? "Invalid subscription",
                );
            const game = getGame(request.params.code);
            if (!game)
                return errorReply(
                    reply,
                    404,
                    "GAME_NOT_FOUND",
                    "Game not found",
                );
            const player = getPlayer(parsed.data.playerId, game.id);
            if (!player)
                return errorReply(
                    reply,
                    403,
                    "PLAYER_NOT_IN_GAME",
                    "Player does not belong to this game",
                );
            const subscription = db
                .prepare(
                    "SELECT id FROM push_subscriptions WHERE player_id = ? AND endpoint = ?",
                )
                .get(player.id, parsed.data.endpoint) as any;
            if (subscription) {
                db.exec("BEGIN IMMEDIATE");
                try {
                    cancelPendingDeliveries(
                        subscription.id,
                        "push subscription disabled",
                    );
                    db.prepare(
                        "DELETE FROM push_subscriptions WHERE id = ?",
                    ).run(subscription.id);
                    db.exec("COMMIT");
                } catch (error) {
                    db.exec("ROLLBACK");
                    throw error;
                }
            }
            return reply.send({ subscribed: false });
        },
    );

    io.on("connection", (socket) => {
        const gameCode = String(socket.handshake.query.gameCode ?? "");
        const playerId = String(socket.handshake.query.playerId ?? "");
        const game = getGame(gameCode);
        if (!game || !getPlayer(playerId, game.id)) {
            socket.disconnect(true);
            return;
        }
        socket.join(`game:${game.id}`);
        socket.emit("game:snapshot", snapshot(game));
    });

    app.addHook("onClose", async () => {
        clearInterval(pushTimer);
        if (activePushDrain) await activePushDrain;
        await io.close();
        db.close();
    });

    return app;
}
