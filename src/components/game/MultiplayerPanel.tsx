import { useStore } from "@nanostores/react";
import { Bell, BellOff, Gamepad2, LogOut, QrCode, Send, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    calculateHiderAnswerPreviews,
    canSendHiderAnswer,
    connectGame,
    createGame,
    disablePush,
    enablePush,
    fetchGameSnapshot,
    gameConnection,
    gameJoinUrl,
    type GameQuestion,
    gameSession,
    type GameSnapshot,
    gameSnapshot,
    hiderAnswerPreviews,
    hiderAnswersUpdating,
    hiderRoleUnavailable,
    isPushEnabled,
    joinGame,
    leaveGameAndCleanUpPush,
    type PlayerRole,
    playerRoleLabel,
    sendAnswer,
    testPushNotification,
} from "@/game/multiplayer";
import { hiderMode } from "@/lib/context";

import { PhotoAnswerControls } from "./PhotoAnswerControls";
import { QuestionDeadline } from "./QuestionDeadline";

const questionLabel = (question: GameQuestion) =>
    question.question.id.charAt(0).toUpperCase() +
    question.question.id.slice(1);

export function MultiplayerPanel() {
    const session = useStore(gameSession);
    const snapshot = useStore(gameSnapshot);
    const connection = useStore(gameConnection);
    const hiderLocation = useStore(hiderMode);
    const previews = useStore(hiderAnswerPreviews);
    const answersUpdating = useStore(hiderAnswersUpdating);
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<"create" | "join">("join");
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [role, setRole] = useState<PlayerRole>("seeker");
    const [busy, setBusy] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [showJoinQr, setShowJoinQr] = useState(false);
    const [joinGameSnapshot, setJoinGameSnapshot] =
        useState<GameSnapshot | null>(null);
    const joinHiderUnavailable =
        mode === "join" &&
        joinGameSnapshot !== null &&
        hiderRoleUnavailable(joinGameSnapshot, name);
    const joinUrl =
        session && typeof window !== "undefined"
            ? gameJoinUrl(window.location.origin, session.code)
            : null;

    useEffect(() => {
        if (session) void connectGame();
        void isPushEnabled()
            .then(async (enabled) => {
                setPushEnabled(enabled);
                if (enabled && session) await enablePush(false);
            })
            .catch(() => undefined);
        const search = new URLSearchParams(window.location.search);
        const linkedGame = search.get("game");
        if (linkedGame && session?.code !== linkedGame.toUpperCase()) {
            setCode(linkedGame.toUpperCase());
            setMode("join");
            setOpen(true);
        }
    }, []);

    useEffect(() => {
        const normalizedCode = code.trim().toUpperCase();
        if (mode !== "join" || normalizedCode.length !== 6) {
            setJoinGameSnapshot(null);
            return;
        }
        let cancelled = false;
        void fetchGameSnapshot(normalizedCode)
            .then((incoming) => {
                if (!cancelled) setJoinGameSnapshot(incoming);
            })
            .catch(() => {
                if (!cancelled) setJoinGameSnapshot(null);
            });
        return () => {
            cancelled = true;
        };
    }, [code, mode]);

    useEffect(() => {
        if (joinHiderUnavailable && role === "hider") setRole("seeker");
    }, [joinHiderUnavailable, role]);

    useEffect(() => {
        const showAnswerNotification = (event: Event) => {
            const detail = (event as CustomEvent<{ message: string }>).detail;
            toast.info(detail.message);
        };
        window.addEventListener(
            "multiplayer:answer-received",
            showAnswerNotification,
        );
        return () =>
            window.removeEventListener(
                "multiplayer:answer-received",
                showAnswerNotification,
            );
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (
            session?.player.role !== "hider" ||
            !snapshot ||
            hiderLocation === false
        ) {
            hiderAnswerPreviews.set({});
            hiderAnswersUpdating.set(false);
            return;
        }

        hiderAnswersUpdating.set(true);
        void calculateHiderAnswerPreviews(snapshot.questions)
            .then((answers) => {
                if (!cancelled) {
                    hiderAnswerPreviews.set(answers);
                    hiderAnswersUpdating.set(false);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    hiderAnswersUpdating.set(false);
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : "Could not update hider answers",
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [hiderLocation, session?.player.role, snapshot]);


    useEffect(() => {
        if (!open) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [open]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        try {
            if (mode === "create") await createGame(name, role);
            else await joinGame(code, name, role);
            if (pushEnabled) {
                await enablePush(false).catch(() =>
                    toast.warning(
                        "Joined, but notifications could not be linked to this game",
                    ),
                );
            }
            toast.success(mode === "create" ? "Game created" : "Joined game");
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Could not join game",
            );
        } finally {
            setBusy(false);
        }
    };

    const submitAnswer = async (item: GameQuestion) => {
        const answer = previews[item.id];
        if (!canSendHiderAnswer(answer, hiderAnswersUpdating.get())) return;
        setBusy(true);
        try {
            await sendAnswer(item.id, answer);
            toast.success("Answer sent");
            const next = { ...hiderAnswerPreviews.get() };
            delete next[item.id];
            hiderAnswerPreviews.set(next);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Could not send answer",
            );
        } finally {
            setBusy(false);
        }
    };

    const togglePush = async () => {
        try {
            if (pushEnabled) {
                await disablePush();
                setPushEnabled(false);
                toast.success("Notifications disabled");
            } else {
                await enablePush();
                setPushEnabled(true);
                toast.success("Notifications enabled");
            }
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Could not update notifications",
            );
        }
    };

    const leave = async () => {
        setPushEnabled(false);
        if (!(await leaveGameAndCleanUpPush())) {
            toast.warning(
                "Left the game, but this browser may still receive its notifications",
            );
        }
    };

    return (
        <div className="pointer-events-none absolute inset-x-0 top-2.5 z-[1040] flex justify-center font-poppins">
            <Button
                type="button"
                className="pointer-events-auto h-10 gap-2 !bg-black px-3 text-white shadow-lg hover:!bg-black"
                onClick={() => setOpen(true)}
                aria-label={
                    session
                        ? `Open multiplayer game panel. You are the ${playerRoleLabel(session.player.role)} in game ${session.code}; ${connection}.`
                        : "Open multiplayer game panel"
                }
            >
                <Gamepad2 className="h-4 w-4 shrink-0" />
                {session ? (
                    <>
                        <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-extrabold tracking-wide ${
                                session.player.role === "hider"
                                    ? "border-amber-400/70 bg-amber-500/20 text-amber-200"
                                    : "border-cyan-400/70 bg-cyan-500/20 text-cyan-200"
                            }`}
                        >
                            {playerRoleLabel(session.player.role)}
                        </span>
                        <span className="font-mono text-sm font-bold tracking-[0.16em]">
                            {session.code}
                        </span>
                        <span
                            className="hidden h-4 w-px bg-slate-600 sm:block"
                            aria-hidden="true"
                        />
                        <span className="flex items-center gap-1.5 text-xs capitalize text-slate-300">
                            <span
                                className={`h-2 w-2 rounded-full ${
                                    connection === "online"
                                        ? "bg-emerald-400"
                                        : connection === "connecting"
                                          ? "bg-amber-400"
                                          : connection === "error"
                                            ? "bg-red-400"
                                            : "bg-slate-400"
                                }`}
                                aria-hidden="true"
                            />
                            <span className="hidden sm:inline">
                                {connection}
                            </span>
                        </span>
                    </>
                ) : (
                    <span>Multiplayer</span>
                )}
            </Button>

            {open && (
                <div className="pointer-events-auto fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4">
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="multiplayer-dialog-title"
                        className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-600 bg-slate-950 p-5 text-white shadow-2xl"
                    >
                        <Button
                            className="absolute right-3 top-3"
                            variant="ghost"
                            size="sm"
                            onClick={() => setOpen(false)}
                            aria-label="Close multiplayer panel"
                        >
                            <X />
                        </Button>
                        <h2
                            id="multiplayer-dialog-title"
                            className="mb-4 text-2xl font-bold"
                        >
                            Multiplayer game
                        </h2>

                        {!session ? (
                            <>
                                <div className="mb-4 flex gap-2">
                                    <Button
                                        variant={
                                            mode === "join"
                                                ? "default"
                                                : "outline"
                                        }
                                        onClick={() => setMode("join")}
                                    >
                                        Join
                                    </Button>
                                    <Button
                                        variant={
                                            mode === "create"
                                                ? "default"
                                                : "outline"
                                        }
                                        onClick={() => setMode("create")}
                                    >
                                        Create
                                    </Button>
                                </div>
                                <form className="space-y-3" onSubmit={submit}>
                                    {mode === "join" && (
                                        <label className="block">
                                            <span className="mb-1 block text-sm">
                                                Game code
                                            </span>
                                            <Input
                                                value={code}
                                                onChange={(event) =>
                                                    setCode(
                                                        event.target.value.toUpperCase(),
                                                    )
                                                }
                                                maxLength={6}
                                                required
                                            />
                                        </label>
                                    )}
                                    <label className="block">
                                        <span className="mb-1 block text-sm">
                                            Your name
                                        </span>
                                        <Input
                                            value={name}
                                            onChange={(event) =>
                                                setName(event.target.value)
                                            }
                                            maxLength={32}
                                            required
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-sm">
                                            Role
                                        </span>
                                        <select
                                            className="w-full rounded-md border border-slate-600 bg-slate-900 p-2"
                                            value={role}
                                            onChange={(event) =>
                                                setRole(
                                                    event.target
                                                        .value as PlayerRole,
                                                )
                                            }
                                        >
                                            <option value="seeker">
                                                Seeker
                                            </option>
                                            <option
                                                value="hider"
                                                disabled={joinHiderUnavailable}
                                            >
                                                {joinHiderUnavailable
                                                    ? "Hider (already taken)"
                                                    : "Hider"}
                                            </option>
                                        </select>
                                        {mode === "join" &&
                                            joinGameSnapshot?.players.some(
                                                (player) =>
                                                    player.role === "hider",
                                            ) && (
                                                <span className="mt-1 block text-xs text-slate-400">
                                                    This game already has a
                                                    hider. Enter the same hider
                                                    name to resume that role.
                                                </span>
                                            )}
                                    </label>
                                    <Button
                                        type="submit"
                                        disabled={
                                            busy ||
                                            (role === "hider" &&
                                                joinHiderUnavailable)
                                        }
                                    >
                                        {busy
                                            ? "Working…"
                                            : mode === "join"
                                              ? "Join game"
                                              : "Create game"}
                                    </Button>
                                </form>
                            </>
                        ) : (
                            <div className="space-y-5">
                                <div className="rounded-lg bg-slate-900 p-3">
                                    <div className="text-sm text-slate-400">
                                        Game code
                                    </div>
                                    <div className="text-3xl font-bold tracking-[0.25em]">
                                        {session.code}
                                    </div>
                                    <div className="mt-1 text-sm">
                                        {session.player.name} ·{" "}
                                        {session.player.role} · {connection}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={togglePush}
                                    >
                                        {pushEnabled ? (
                                            <BellOff className="mr-2 h-4 w-4" />
                                        ) : (
                                            <Bell className="mr-2 h-4 w-4" />
                                        )}
                                        {pushEnabled
                                            ? "Disable notifications"
                                            : "Enable notifications"}
                                    </Button>
                                    {pushEnabled && (
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                void testPushNotification().catch(
                                                    (error) =>
                                                        toast.error(
                                                            error instanceof
                                                                Error
                                                                ? error.message
                                                                : "Could not show test notification",
                                                        ),
                                                )
                                            }
                                        >
                                            <Bell className="mr-2 h-4 w-4" />
                                            Test notification
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            setShowJoinQr((visible) => !visible)
                                        }
                                    >
                                        <QrCode className="mr-2 h-4 w-4" />
                                        {showJoinQr
                                            ? "Hide join QR"
                                            : "Show join QR"}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => void leave()}
                                    >
                                        <LogOut className="mr-2 h-4 w-4" />{" "}
                                        Leave
                                    </Button>
                                </div>
                                {showJoinQr && joinUrl && (
                                    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-center">
                                        <h3 className="mb-3 font-semibold">
                                            Scan to join game {session.code}
                                        </h3>
                                        <div className="mx-auto w-fit rounded-lg bg-white p-3">
                                            <QRCodeSVG
                                                value={joinUrl}
                                                size={192}
                                                level="M"
                                                title={`Join game ${session.code}`}
                                            />
                                        </div>
                                        <p className="mt-3 break-all text-xs text-slate-400">
                                            {joinUrl}
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <h3 className="mb-2 font-semibold">
                                        Players
                                    </h3>
                                    <ul className="space-y-1 text-sm">
                                        {snapshot?.players.map((player) => (
                                            <li key={player.id}>
                                                {player.name} — {player.role}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div>
                                    <h3 className="mb-2 font-semibold">
                                        Questions
                                    </h3>
                                    {snapshot?.questions.length ? (
                                        <ul className="space-y-3">
                                            {snapshot.questions.map((item) => (
                                                <li
                                                    id={`game-question-${item.id}`}
                                                    key={item.id}
                                                    className="rounded-lg border border-slate-700 p-3"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span>
                                                            {questionLabel(
                                                                item,
                                                            )}
                                                        </span>
                                                        <span
                                                            className={
                                                                item.status ===
                                                                "answered"
                                                                    ? "text-green-400"
                                                                    : "text-amber-400"
                                                            }
                                                        >
                                                            {item.status}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-slate-400">
                                                        From{" "}
                                                        {snapshot.players.find(
                                                            (player) =>
                                                                player.id ===
                                                                item.senderPlayerId,
                                                        )?.name ?? "Seeker"}
                                                    </div>
                                                    <QuestionDeadline
                                                        answerDueAt={
                                                            item.answerDueAt
                                                        }
                                                        status={item.status}
                                                        answeredLate={
                                                            item.answeredLate
                                                        }
                                                    />
                                                    <details className="mt-2 text-xs text-slate-300">
                                                        <summary className="cursor-pointer">
                                                            Question details
                                                        </summary>
                                                        <pre className="mt-2 overflow-auto rounded bg-black p-2">
                                                            {JSON.stringify(
                                                                item.question
                                                                    .data,
                                                                null,
                                                                2,
                                                            )}
                                                        </pre>
                                                    </details>
                                                    {item.answer?.type ===
                                                        "photo" &&
                                                        item.answer.response ===
                                                            "photo" && (
                                                            <a
                                                                className="mt-2 block"
                                                                href={`/api/games/${encodeURIComponent(session.code)}/photos/${encodeURIComponent(item.answer.uploadId)}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                            >
                                                                <img
                                                                    className="max-h-72 w-full rounded border border-slate-700 object-contain"
                                                                    src={`/api/games/${encodeURIComponent(session.code)}/photos/${encodeURIComponent(item.answer.uploadId)}`}
                                                                    alt="Photo answer"
                                                                    loading="lazy"
                                                                />
                                                            </a>
                                                        )}
                                                    {item.answer?.type ===
                                                        "photo" &&
                                                        item.answer.response ===
                                                            "cannot_answer" && (
                                                            <p className="mt-2 text-xs font-semibold text-amber-300">
                                                                The hider cannot
                                                                answer because
                                                                the subject does
                                                                not exist in the
                                                                hiding zone.
                                                            </p>
                                                        )}
                                                    {session.player.role ===
                                                        "hider" &&
                                                        item.status ===
                                                            "pending" && (
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                {item.question
                                                                    .id ===
                                                                "photo" ? (
                                                                    <PhotoAnswerControls
                                                                        question={
                                                                            item
                                                                        }
                                                                        disabled={
                                                                            busy
                                                                        }
                                                                    />
                                                                ) : canSendHiderAnswer(
                                                                      previews[
                                                                          item
                                                                              .id
                                                                      ],
                                                                      answersUpdating,
                                                                  ) ? (
                                                                    <Button
                                                                        size="sm"
                                                                        disabled={
                                                                            busy
                                                                        }
                                                                        onClick={() =>
                                                                            void submitAnswer(
                                                                                item,
                                                                            )
                                                                        }
                                                                    >
                                                                        <Send className="mr-1 h-4 w-4" />{" "}
                                                                        Send
                                                                        answer
                                                                    </Button>
                                                                ) : (
                                                                    <span className="text-xs text-slate-400">
                                                                        {hiderLocation ===
                                                                        false
                                                                            ? "Set the private hider location to preview the answer"
                                                                            : answersUpdating
                                                                              ? "Updating answer…"
                                                                              : "Answer preview unavailable"}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    {previews[item.id] && (
                                                        <pre className="mt-2 overflow-auto rounded bg-black p-2 text-xs">
                                                            {JSON.stringify(
                                                                previews[
                                                                    item.id
                                                                ],
                                                                null,
                                                                2,
                                                            )}
                                                        </pre>
                                                    )}
                                                    {item.answer && (
                                                        <pre className="mt-2 overflow-auto rounded bg-black p-2 text-xs">
                                                            {JSON.stringify(
                                                                item.answer,
                                                                null,
                                                                2,
                                                            )}
                                                        </pre>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-sm text-slate-400">
                                            No questions yet.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
