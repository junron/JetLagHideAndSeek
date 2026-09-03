import { persistentAtom } from "@nanostores/persistent";
import { atom } from "nanostores";
import { io, type Socket } from "socket.io-client";

import { hiderMode, leafletMapContext, questions } from "@/lib/context";
import { hiderifyQuestion } from "@/maps";
import type { Question } from "@/maps/schema";

export type PlayerRole = "hider" | "seeker";

export function playerRoleLabel(role: PlayerRole) {
    return role === "hider" ? "Hider" : "Seeker";
}

const normalizedPlayerName = (name: string) => name.trim().toLocaleLowerCase();

export function hiderRoleUnavailable(snapshot: GameSnapshot, name: string) {
    const hider = snapshot.players.find((player) => player.role === "hider");
    return Boolean(
        hider &&
            normalizedPlayerName(hider.name) !== normalizedPlayerName(name),
    );
}

export function gameJoinUrl(origin: string, code: string) {
    const url = new URL("/", origin);
    url.searchParams.set("game", code.trim().toUpperCase());
    return url.toString();
}

export function syncHiderModeForRole(
    role: PlayerRole | null,
    defaultLocation?: { latitude: number; longitude: number },
) {
    if (role !== "hider") {
        hiderMode.set(false);
        return;
    }
    if (hiderMode.get() !== false) return;

    const center = leafletMapContext.get()?.getCenter();
    hiderMode.set(
        defaultLocation ?? {
            latitude: center?.lat ?? 0,
            longitude: center?.lng ?? 0,
        },
    );
}

export type GameAnswer =
    | { type: "radius"; within: boolean }
    | { type: "thermometer"; warmer: boolean }
    | { type: "tentacles"; location: false | Record<string, unknown> }
    | {
          type: "matching";
          same: boolean;
          lengthComparison?: "shorter" | "same" | "longer";
      }
    | { type: "measuring"; hiderCloser: boolean }
    | { type: "photo"; response: "cannot_answer" }
    | { type: "photo"; response: "photo"; uploadId: string };

export type GamePlayer = {
    id: string;
    name: string;
    role: PlayerRole;
    joinedAt?: string;
};
export type GameQuestion = {
    id: string;
    senderPlayerId: string;
    clientQuestionKey: number;
    question: Question;
    status: "pending" | "answered";
    answer: GameAnswer | null;
    createdAt: string;
    answerDueAt?: string;
    answeredAt: string | null;
    answeredLate?: boolean | null;
};
export type GameSnapshot = {
    game: { code: string; createdAt: string };
    players: GamePlayer[];
    questions: GameQuestion[];
};

export type QuestionDeadlineState = {
    kind: "due" | "overdue" | "answered";
    milliseconds: number;
};

export function questionDeadlineState(
    answerDueAt: string,
    status: GameQuestion["status"],
    nowMs = Date.now(),
): QuestionDeadlineState {
    if (status === "answered") return { kind: "answered", milliseconds: 0 };
    const difference = Date.parse(answerDueAt) - nowMs;
    if (difference > 0) return { kind: "due", milliseconds: difference };
    return { kind: "overdue", milliseconds: Math.abs(difference) };
}
export type GameSession = { code: string; player: GamePlayer };
export type SidebarQuestion =
    | { source: "local"; question: Question }
    | { source: "remote"; gameQuestion: GameQuestion };

export function selectSidebarQuestions(
    role: PlayerRole | null,
    localQuestions: Question[],
    snapshot: GameSnapshot | null,
    playerId?: string,
): SidebarQuestion[] {
    const remoteQuestions = (snapshot?.questions ?? []).map((gameQuestion) => ({
        source: "remote" as const,
        gameQuestion,
    }));
    if (role === "hider") return remoteQuestions;

    const ownSentKeys =
        role === "seeker" && snapshot && playerId
            ? new Set(
                  snapshot.questions
                      .filter((item) => item.senderPlayerId === playerId)
                      .map((item) => item.clientQuestionKey),
              )
            : null;
    const localItems = localQuestions
        .filter((question) => !ownSentKeys?.has(question.key))
        .map((question) => ({
            source: "local" as const,
            question,
        }));

    if (role !== "seeker" || !snapshot || !playerId) return localItems;
    return [...localItems, ...remoteQuestions];
}

export function submittedQuestionKeys(
    snapshot: GameSnapshot | null,
    playerId: string | undefined,
) {
    return new Set(
        (snapshot?.questions ?? [])
            .filter((item) => item.senderPlayerId === playerId)
            .map((item) => item.clientQuestionKey),
    );
}

export function canEditPendingQuestionResult(
    session: GameSession | null,
    item: GameQuestion,
) {
    return (
        session?.player.role === "seeker" &&
        item.senderPlayerId === session.player.id &&
        item.status === "pending" &&
        item.question.id !== "photo"
    );
}

export function selectMapQuestions(
    role: PlayerRole | null,
    localQuestions: Question[],
    snapshot: GameSnapshot | null,
    previews: Record<string, GameAnswer>,
    playerId?: string,
): Question[] {
    if (role !== "hider") {
        const localGeographicQuestions = localQuestions.filter(
            (question) => question.id !== "photo",
        );
        if (role !== "seeker" || !snapshot || !playerId)
            return localGeographicQuestions;

        const ownSubmittedKeys = submittedQuestionKeys(snapshot, playerId);
        const localDrafts = localGeographicQuestions.filter(
            (question) => !ownSubmittedKeys.has(question.key),
        );
        const authoritativeQuestions = snapshot.questions.flatMap((item) => {
            if (item.question.id === "photo") return [];
            const localPending =
                item.status === "pending" && item.senderPlayerId === playerId
                    ? localGeographicQuestions.find(
                          (question) =>
                              question.key === item.clientQuestionKey &&
                              question.id === item.question.id,
                      )
                    : undefined;
            const question =
                item.status === "answered" && item.answer
                    ? applyAnswer(item.question, item.answer)
                    : localPending
                      ? applyAnswer(item.question, extractAnswer(localPending))
                      : cloneQuestion(item.question);
            if ("drag" in question.data)
                Object.assign(question.data, { drag: false });
            return [question];
        });
        return [...localDrafts, ...authoritativeQuestions];
    }
    if (!snapshot) return [];
    return snapshot.questions.flatMap((item) => {
        if (item.question.id === "photo") return [];
        const answer = item.answer ?? previews[item.id];
        return answer ? [applyAnswer(item.question, answer)] : [];
    });
}

export type QuestionSubmissionState =
    | "ready"
    | "pending"
    | "answered"
    | "blocked";

export function questionSubmissionState(
    snapshot: GameSnapshot | null,
    playerId: string,
    clientQuestionKey: number,
): QuestionSubmissionState {
    const snapshotQuestions = snapshot?.questions ?? [];
    const current = snapshotQuestions.find(
        (item) =>
            item.senderPlayerId === playerId &&
            item.clientQuestionKey === clientQuestionKey,
    );
    if (current) return current.status;
    return snapshotQuestions.some((item) => item.status === "pending")
        ? "blocked"
        : "ready";
}

export function shouldNotifyAnsweredQuestion(
    session: GameSession | null,
    previous: GameQuestion | undefined,
    answered: GameQuestion,
): boolean {
    return (
        session?.player.role === "seeker" &&
        previous?.status === "pending" &&
        answered.status === "answered"
    );
}

const notificationUnit = (unit: string) =>
    ({ kilometers: "km", miles: "mi", meters: "m" })[unit] ?? unit;

const notificationType = (value: string) =>
    value
        .replace(/-full$/, "")
        .replaceAll("_", " ")
        .replaceAll("-", " ");

export function answeredQuestionNotificationText(item: GameQuestion) {
    const answer = item.answer;
    if (!answer) return "Question answered";

    switch (item.question.id) {
        case "radius":
            return `${item.question.data.radius}${notificationUnit(item.question.data.unit)} radar: ${answer.type === "radius" && answer.within ? "Inside" : "Outside"}`;
        case "thermometer":
            return `Thermometer: ${answer.type === "thermometer" && answer.warmer ? "Warmer" : "Colder"}`;
        case "tentacles": {
            const location =
                answer.type === "tentacles" ? answer.location : false;
            const result =
                (location && (location as any).properties?.name) ||
                (location ? "Location found" : "No matching location");
            return `${item.question.data.radius}${notificationUnit(item.question.data.unit)} ${notificationType(item.question.data.locationType)} tentacles: ${result}`;
        }
        case "matching": {
            const result =
                answer.type === "matching" && answer.lengthComparison
                    ? notificationType(answer.lengthComparison)
                    : answer.type === "matching" && answer.same
                      ? "Same"
                      : "Different";
            return `${notificationType(item.question.data.type)} matching: ${result}`;
        }
        case "measuring":
            return `${notificationType(item.question.data.type)} measuring: ${answer.type === "measuring" && answer.hiderCloser ? "Hider closer" : "Seeker closer"}`;
        case "photo":
            return `${notificationType(item.question.data.subject)} photo: ${answer.type === "photo" && answer.response === "photo" ? "Photo received" : "Cannot answer"}`;
    }
}

export const gameSession = persistentAtom<GameSession | null>(
    "multiplayerSession",
    null,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const gameSnapshot = atom<GameSnapshot | null>(null);
export const hiderAnswerPreviews = atom<Record<string, GameAnswer>>({});
export const hiderAnswersUpdating = atom(false);
export function canSendHiderAnswer(
    answer: GameAnswer | undefined,
    updating: boolean,
): answer is GameAnswer {
    return answer !== undefined && !updating;
}
export const gameConnection = atom<
    "offline" | "connecting" | "online" | "error"
>("offline");

let socket: Socket | null = null;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
    });
    const body = await response.json();
    if (!response.ok)
        throw new Error(
            body?.error?.message ?? `Request failed (${response.status})`,
        );
    return body as T;
}

export function cloneQuestion(question: Question): Question {
    if (typeof structuredClone === "function") return structuredClone(question);
    return JSON.parse(JSON.stringify(question)) as Question;
}

export function applyAnswer(question: Question, answer: GameAnswer): Question {
    if (question.id !== answer.type)
        throw new Error("Answer type does not match question type");
    const next = cloneQuestion(question);
    switch (answer.type) {
        case "radius":
            if (next.id === "radius") next.data.within = answer.within;
            break;
        case "thermometer":
            if (next.id === "thermometer") next.data.warmer = answer.warmer;
            break;
        case "tentacles":
            if (next.id === "tentacles")
                next.data.location = answer.location as any;
            break;
        case "matching":
            if (next.id === "matching") {
                next.data.same = answer.same;
                if (answer.lengthComparison !== undefined)
                    next.data.lengthComparison = answer.lengthComparison;
            }
            break;
        case "measuring":
            if (next.id === "measuring")
                next.data.hiderCloser = answer.hiderCloser;
            break;
        case "photo":
            if (next.id === "photo") {
                next.data.response = answer.response;
                if (answer.response === "photo") {
                    next.data.uploadId = answer.uploadId;
                } else {
                    delete next.data.uploadId;
                }
            }
            break;
    }
    if ("drag" in next.data) Object.assign(next.data, { drag: false });
    return next;
}

export function applyPersistedAnswer(
    item: GameQuestion,
    currentQuestion: Question,
): Question {
    if (!item.answer) throw new Error("Question has no persisted answer");
    const persisted = cloneQuestion(item.question);
    persisted.key = currentQuestion.key;
    return applyAnswer(persisted, item.answer);
}

export function reconcileSnapshot(
    current: GameSnapshot | null,
    incoming: GameSnapshot,
): GameSnapshot {
    if (!current || current.game.code !== incoming.game.code) return incoming;

    const players = [...incoming.players];
    for (const player of current.players) {
        if (!players.some((candidate) => candidate.id === player.id)) {
            players.push(player);
        }
    }

    const snapshotQuestions = incoming.questions.map((candidate) => {
        const existing = current.questions.find(
            (question) => question.id === candidate.id,
        );
        if (existing?.status === "answered" && candidate.status === "pending") {
            return existing;
        }
        return candidate;
    });
    for (const question of current.questions) {
        if (
            !snapshotQuestions.some((candidate) => candidate.id === question.id)
        ) {
            snapshotQuestions.push(question);
        }
    }

    return { ...incoming, players, questions: snapshotQuestions };
}

export function extractAnswer(question: Question): GameAnswer {
    switch (question.id) {
        case "radius":
            return { type: "radius", within: question.data.within };
        case "thermometer":
            return { type: "thermometer", warmer: question.data.warmer };
        case "tentacles":
            return {
                type: "tentacles",
                location: question.data.location as any,
            };
        case "matching":
            return {
                type: "matching",
                same: question.data.same,
                ...(question.data.lengthComparison
                    ? { lengthComparison: question.data.lengthComparison }
                    : {}),
            };
        case "measuring":
            return {
                type: "measuring",
                hiderCloser: question.data.hiderCloser,
            };
        case "photo":
            if (question.data.response === "photo" && question.data.uploadId) {
                return {
                    type: "photo",
                    response: "photo",
                    uploadId: question.data.uploadId,
                };
            }
            if (question.data.response === "cannot_answer") {
                return { type: "photo", response: "cannot_answer" };
            }
            throw new Error("Photo answer has not been selected");
    }
}

export async function calculateHiderAnswerPreviews(
    gameQuestions: GameQuestion[],
): Promise<Record<string, GameAnswer>> {
    if (hiderMode.get() === false) return {};
    const pending = gameQuestions.filter(
        (item) => item.status === "pending" && item.question.id !== "photo",
    );
    const entries = await Promise.all(
        pending.map(async (item) => {
            const question = cloneQuestion(item.question);
            await hiderifyQuestion(question);
            return [item.id, extractAnswer(question)] as const;
        }),
    );
    return Object.fromEntries(entries);
}

function applyIncomingAnswer(item: GameQuestion) {
    const session = gameSession.get();
    if (!session || item.senderPlayerId !== session.player.id || !item.answer)
        return;
    const current = questions.get();
    const index = current.findIndex(
        (question) => question.key === item.clientQuestionKey,
    );
    if (index < 0) return;
    const next = [...current];
    next[index] = applyPersistedAnswer(item, next[index]);
    questions.set(next);
}

function mergeQuestion(item: GameQuestion) {
    const current = gameSnapshot.get();
    if (!current) return;
    const index = current.questions.findIndex(
        (question) => question.id === item.id,
    );
    const nextQuestions = [...current.questions];
    if (index >= 0) nextQuestions[index] = item;
    else nextQuestions.push(item);
    gameSnapshot.set({ ...current, questions: nextQuestions });
    if (item.status === "answered") applyIncomingAnswer(item);
}

function removeQuestion(questionId: string) {
    const current = gameSnapshot.get();
    if (!current) return;
    gameSnapshot.set({
        ...current,
        questions: current.questions.filter((item) => item.id !== questionId),
    });
}

function applySnapshot(incoming: GameSnapshot) {
    const reconciled = reconcileSnapshot(gameSnapshot.get(), incoming);
    gameSnapshot.set(reconciled);
    for (const item of reconciled.questions) {
        if (item.status === "answered") applyIncomingAnswer(item);
    }
}

export async function fetchGameSnapshot(code: string) {
    return api<GameSnapshot>(
        `/api/games/${code.trim().toUpperCase()}/snapshot`,
    );
}

export async function refreshSnapshot() {
    const session = gameSession.get();
    if (!session) return;
    const snapshot = await fetchGameSnapshot(session.code);
    applySnapshot(snapshot);
}

export async function restoreGameSessionSnapshot() {
    if (!gameSession.get()) return;
    await refreshSnapshot();
}

export async function connectGame() {
    const session = gameSession.get();
    if (!session) return;
    syncHiderModeForRole(session.player.role);
    if (typeof window === "undefined") return;
    void restoreGameSessionSnapshot().catch(() => gameConnection.set("error"));
    socket?.disconnect();
    gameConnection.set("connecting");
    socket = io({
        path: "/socket.io",
        query: { gameCode: session.code, playerId: session.player.id },
        transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
        gameConnection.set("online");
        void refreshSnapshot().catch(() => gameConnection.set("error"));
    });
    socket.on("disconnect", () => gameConnection.set("offline"));
    socket.on("connect_error", () => gameConnection.set("error"));
    socket.on("game:snapshot", applySnapshot);
    socket.on("player:joined", (player: GamePlayer) => {
        const current = gameSnapshot.get();
        if (current && !current.players.some((item) => item.id === player.id)) {
            gameSnapshot.set({
                ...current,
                players: [...current.players, player],
            });
        }
    });
    socket.on("question:created", mergeQuestion);
    socket.on("question:removed", ({ questionId }: { questionId: string }) =>
        removeQuestion(questionId),
    );
    socket.on("question:answered", (item: GameQuestion) => {
        const previous = gameSnapshot
            .get()
            ?.questions.find((question) => question.id === item.id);
        mergeQuestion(item);
        if (
            shouldNotifyAnsweredQuestion(gameSession.get(), previous, item) &&
            typeof window !== "undefined"
        ) {
            window.dispatchEvent(
                new CustomEvent("multiplayer:answer-received", {
                    detail: {
                        questionId: item.id,
                        message: answeredQuestionNotificationText(item),
                    },
                }),
            );
        }
    });
}

export async function createGame(name: string, role: PlayerRole) {
    const result = await api<{
        game: { code: string; createdAt: string };
        player: GamePlayer;
    }>("/api/games", {
        method: "POST",
        body: JSON.stringify({ name, role }),
    });
    gameSession.set({ code: result.game.code, player: result.player });
    gameSnapshot.set({
        game: result.game,
        players: [result.player],
        questions: [],
    });
    await connectGame();
    return result;
}

export async function joinGame(code: string, name: string, role: PlayerRole) {
    const normalized = code.trim().toUpperCase();
    if (role === "hider") {
        const snapshot = await fetchGameSnapshot(normalized);
        if (hiderRoleUnavailable(snapshot, name))
            throw new Error("This game already has a hider");
    }
    const result = await api<{
        game: { code: string; createdAt: string };
        player: GamePlayer;
    }>(`/api/games/${normalized}/join`, {
        method: "POST",
        body: JSON.stringify({ name, role }),
    });
    gameSession.set({ code: result.game.code, player: result.player });
    gameSnapshot.set({
        game: result.game,
        players: [result.player],
        questions: [],
    });
    await connectGame();
    return result;
}

export function leaveGame() {
    socket?.disconnect();
    socket = null;
    gameSession.set(null);
    syncHiderModeForRole(null);
    gameSnapshot.set(null);
    gameConnection.set("offline");
}

export async function sendQuestion(questionKey: number) {
    const session = gameSession.get();
    if (!session || session.player.role !== "seeker")
        throw new Error("Join as a seeker first");
    const question = questions.get().find((item) => item.key === questionKey);
    if (!question) throw new Error("Question not found");
    const result = await api<{ question: GameQuestion }>(
        `/api/games/${session.code}/questions`,
        {
            method: "POST",
            body: JSON.stringify({
                playerId: session.player.id,
                clientQuestionKey: questionKey,
                question,
            }),
        },
    );
    mergeQuestion(result.question);
    return result;
}

export async function unaskQuestion(questionId: string) {
    const session = gameSession.get();
    if (!session || session.player.role !== "seeker")
        throw new Error("Join as a seeker first");
    const item = gameSnapshot
        .get()
        ?.questions.find((question) => question.id === questionId);
    if (!item || item.senderPlayerId !== session.player.id)
        throw new Error(
            "Only the seeker who asked this question can un-ask it",
        );
    if (item.status !== "pending")
        throw new Error("Answered questions cannot be un-asked");

    const result = await api<{ questionId: string }>(
        `/api/games/${session.code}/questions/${questionId}`,
        {
            method: "DELETE",
            body: JSON.stringify({ playerId: session.player.id }),
        },
    );
    removeQuestion(result.questionId);
    return result;
}

export async function sendAnswer(questionId: string, answer: GameAnswer) {
    const session = gameSession.get();
    if (!session || session.player.role !== "hider")
        throw new Error("Join as the hider first");
    const result = await api<{ question: GameQuestion }>(
        `/api/games/${session.code}/questions/${questionId}/answer`,
        {
            method: "POST",
            body: JSON.stringify({ playerId: session.player.id, answer }),
        },
    );
    mergeQuestion(result.question);
    return result;
}

export async function sendPhotoAnswer(questionId: string, photo: File) {
    const session = gameSession.get();
    if (!session || session.player.role !== "hider")
        throw new Error("Join as the hider first");
    let photoBytes: ArrayBuffer;
    try {
        photoBytes = await photo.arrayBuffer();
    } catch {
        throw new Error("Could not read the selected photo. Choose it again.");
    }
    const bufferedPhoto = new Blob([photoBytes], { type: photo.type });
    const form = new FormData();
    form.append("playerId", session.player.id);
    form.append("photo", bufferedPhoto, "photo-upload");
    const response = await fetch(
        `/api/games/${session.code}/questions/${questionId}/photo-answer`,
        { method: "POST", body: form, credentials: "same-origin" },
    );
    const body = await response.json();
    if (!response.ok)
        throw new Error(
            body?.error?.message ?? `Request failed (${response.status})`,
        );
    const result = body as { question: GameQuestion };
    mergeQuestion(result.question);
    return result;
}

function urlBase64ToUint8Array(value: string) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function showPushConfirmation(registration: {
    showNotification: (
        title: string,
        options?: NotificationOptions,
    ) => Promise<void>;
}) {
    const options: NotificationOptions & {
        image: string;
        vibrate: number[];
        renotify: boolean;
    } = {
        body: "You will be notified when a question or answer needs your attention.",
        icon: "/notification-icon-v3.png",
        badge: "/notification-badge-v3.png",
        image: "/notification-banner-v2.png",
        vibrate: [700, 120, 700, 120, 1400],
        renotify: true,
        silent: false,
        tag: "notifications-enabled",
        data: { url: "/" },
    };
    try {
        await registration.showNotification("Notifications enabled", options);
        return true;
    } catch {
        return false;
    }
}

export async function testPushNotification() {
    if (!("serviceWorker" in navigator))
        throw new Error("Notifications are not supported");
    if (Notification.permission !== "granted")
        throw new Error("Notification permission is not granted");
    await showPushConfirmation(await navigator.serviceWorker.ready);
}

export async function isPushEnabled() {
    if (
        typeof navigator === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
    ) {
        return false;
    }
    const registration = await navigator.serviceWorker.ready;
    return Boolean(await registration.pushManager.getSubscription());
}

export async function enablePush(showConfirmation = true) {
    const session = gameSession.get();
    if (!session) throw new Error("Join a game first");
    if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error("Push notifications are not supported");
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
        throw new Error("Notification permission was not granted");
    const registration = await navigator.serviceWorker.ready;
    const { publicKey } = await api<{ publicKey: string | null }>(
        "/api/push/vapid-public-key",
    );
    if (!publicKey) throw new Error("Push notifications are not configured");
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
    }
    await api(`/api/games/${session.code}/push-subscriptions`, {
        method: "POST",
        body: JSON.stringify({
            playerId: session.player.id,
            subscription: subscription.toJSON(),
        }),
    });
    if (showConfirmation) await showPushConfirmation(registration);
}

export async function leaveGameAndCleanUpPush(
    cleanUpPush: (session: GameSession | null) => Promise<void> = disablePush,
) {
    const session = gameSession.get();
    leaveGame();
    try {
        await cleanUpPush(session);
        return true;
    } catch {
        return false;
    }
}

export async function disablePush(session = gameSession.get()) {
    if (!session || !("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await api(`/api/games/${session.code}/push-subscriptions`, {
        method: "DELETE",
        body: JSON.stringify({
            playerId: session.player.id,
            endpoint: subscription.endpoint,
        }),
    });
    await subscription.unsubscribe();
}
