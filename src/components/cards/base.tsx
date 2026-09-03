import { useStore } from "@nanostores/react";
import { LockIcon, UnlockIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VscChevronDown, VscShare, VscTrash } from "react-icons/vsc";
import { toast } from "react-toastify";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
} from "@/components/ui/sidebar-l";
import {
    type GameQuestion,
    gameSession,
    gameSnapshot,
    questionSubmissionState,
    sendQuestion,
} from "@/game/multiplayer";
import {
    initialQuestionCollapsed,
    type QuestionPresentationStatus,
    shouldAutoCollapseQuestion,
} from "@/game/questionPresentation";
import { isLoading, questions } from "@/lib/context";
import { cn } from "@/lib/utils";

export const QuestionCard = ({
    children,
    questionKey,
    className,
    label,
    sub,
    collapsed,
    locked,
    setLocked,
    setCollapsed,
    status,
    footer,
}: {
    children: React.ReactNode;
    questionKey: number;
    className?: string;
    label?: string;
    sub?: string;
    collapsed?: boolean;
    locked?: boolean;
    setLocked?: (locked: boolean) => void;
    setCollapsed?: (collapsed: boolean) => void;
    status?: GameQuestion["status"];
    footer?: React.ReactNode;
}) => {
    const $questions = useStore(questions);
    const $isLoading = useStore(isLoading);
    const $gameSession = useStore(gameSession);
    const $gameSnapshot = useStore(gameSnapshot);
    const submissionState =
        $gameSession?.player.role === "seeker"
            ? questionSubmissionState(
                  $gameSnapshot,
                  $gameSession.player.id,
                  questionKey,
              )
            : "ready";
    const presentationStatus: QuestionPresentationStatus =
        status ??
        (submissionState === "pending" || submissionState === "answered"
            ? submissionState
            : undefined);
    const [isCollapsed, setIsCollapsed] = useState(() =>
        initialQuestionCollapsed(collapsed, presentationStatus),
    );
    const previousStatus = useRef(presentationStatus);
    const isRemoteTranscript =
        $gameSession?.player.role === "seeker" && Boolean(sub);
    const copyButtonRef = useRef<HTMLButtonElement>(null);
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

    useEffect(() => {
        if (
            shouldAutoCollapseQuestion(
                previousStatus.current,
                presentationStatus,
            )
        ) {
            setIsCollapsed(true);
            setCollapsed?.(true);
        }
        previousStatus.current = presentationStatus;
    }, [presentationStatus, setCollapsed]);

    const toggleCollapse = () => {
        if (setCollapsed) {
            setCollapsed(!isCollapsed);
        }
        setIsCollapsed((prevState) => !prevState);
    };

    return (
        <>
            <SidebarGroup className={className}>
                <div className="relative">
                    <button
                        onClick={toggleCollapse}
                        className={cn(
                            "absolute top-2 left-2 text-white border rounded-md transition-all duration-500",
                            isCollapsed && "-rotate-90",
                        )}
                    >
                        <VscChevronDown />
                    </button>
                    <SidebarGroupLabel
                        className="ml-8 mr-8 cursor-pointer"
                        onClick={toggleCollapse}
                    >
                        <span>
                            {label} {sub && `(${sub})`}
                        </span>
                        {presentationStatus === "pending" && (
                            <span className="ml-2 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                                Pending
                            </span>
                        )}
                        {presentationStatus === "answered" && (
                            <span className="ml-2 rounded bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-300">
                                Answered
                            </span>
                        )}
                    </SidebarGroupLabel>
                    <SidebarGroupContent
                        aria-hidden={isCollapsed}
                        inert={isCollapsed ? true : undefined}
                        className={cn(
                            "overflow-hidden transition-all duration-1000 max-h-[100rem]", // 100rem is arbitrary
                            isCollapsed && "max-h-0",
                        )}
                    >
                        <SidebarMenu>{children}</SidebarMenu>
                        <div
                            className={cn(
                                "flex gap-2 pt-2 px-2 justify-center",
                                ($gameSession?.player.role === "hider" ||
                                    isRemoteTranscript) &&
                                    "hidden",
                            )}
                        >
                            {$gameSession?.player.role === "seeker" && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    title={
                                        submissionState === "blocked"
                                            ? "Wait for the pending question to be answered"
                                            : "Send question to hider"
                                    }
                                    disabled={submissionState !== "ready"}
                                    onClick={() => {
                                        if (submissionState !== "ready") return;
                                        toast.promise(
                                            sendQuestion(questionKey),
                                            {
                                                pending: "Sending question",
                                                success:
                                                    "Question sent to hider",
                                                error: "Could not send question",
                                            },
                                        );
                                    }}
                                >
                                    {submissionState === "ready"
                                        ? "Send"
                                        : submissionState === "pending"
                                          ? "Pending"
                                          : submissionState === "answered"
                                            ? "Answered"
                                            : "Waiting for answer"}
                                </Button>
                            )}
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <VscShare />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle className="text-2xl">
                                            Share this Question!
                                        </DialogTitle>
                                        <DialogDescription>
                                            Below you can access the JSON
                                            representing the question. Send this
                                            to another player for them to copy.
                                            They can then click &ldquo;Paste
                                            Question&rdquo; at the bottom of the
                                            &ldquo;Questions&rdquo; sidebar.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mb-2 sm:mb-0 transition-colors"
                                        ref={copyButtonRef}
                                        onClick={() => {
                                            navigator.clipboard
                                                .writeText(
                                                    JSON.stringify(
                                                        $questions.find(
                                                            (q) =>
                                                                q.key ===
                                                                questionKey,
                                                        ),
                                                        null,
                                                        4,
                                                    ),
                                                )
                                                .then(() => {
                                                    if (copyButtonRef.current) {
                                                        copyButtonRef.current.textContent =
                                                            "Copied!";
                                                        copyButtonRef.current.classList.add(
                                                            "bg-green-500",
                                                        );
                                                        setTimeout(() => {
                                                            if (
                                                                copyButtonRef.current
                                                            ) {
                                                                copyButtonRef.current.textContent =
                                                                    "Copy to Clipboard";
                                                                copyButtonRef.current.classList.remove(
                                                                    "bg-green-500",
                                                                );
                                                            }
                                                        }, 2000);
                                                    }
                                                })
                                                .catch(() => {
                                                    if (copyButtonRef.current) {
                                                        copyButtonRef.current.textContent =
                                                            "Failed to Copy";
                                                        copyButtonRef.current.classList.add(
                                                            "bg-red-500",
                                                        );
                                                        setTimeout(() => {
                                                            if (
                                                                copyButtonRef.current
                                                            ) {
                                                                copyButtonRef.current.textContent =
                                                                    "Copy to Clipboard";
                                                                copyButtonRef.current.classList.remove(
                                                                    "bg-red-500",
                                                                );
                                                            }
                                                        }, 2000);
                                                    }
                                                });
                                        }}
                                    >
                                        Copy to Clipboard
                                    </Button>
                                    <textarea
                                        className="w-full h-[300px] bg-slate-900 text-white rounded-md p-2"
                                        readOnly
                                        value={JSON.stringify(
                                            $questions.find(
                                                (q) => q.key === questionKey,
                                            ),
                                            null,
                                            4,
                                        )}
                                    ></textarea>
                                </DialogContent>
                            </Dialog>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={$isLoading}
                                    >
                                        <VscTrash />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Are you absolutely sure?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This
                                            will permanently delete the
                                            question.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => {
                                                setShowDeleteAllConfirm(true);
                                            }}
                                        >
                                            Delete All Questions
                                        </AlertDialogAction>
                                        <AlertDialogAction
                                            onClick={() => {
                                                questions.set(
                                                    $questions.filter(
                                                        (q) =>
                                                            q.key !==
                                                            questionKey,
                                                    ),
                                                );
                                            }}
                                            className="mb-2 sm:mb-0"
                                        >
                                            Delete Question
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <AlertDialog
                                open={showDeleteAllConfirm}
                                onOpenChange={(open) =>
                                    setShowDeleteAllConfirm(open)
                                }
                            >
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Confirm delete all questions
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete all
                                            questions. This action cannot be
                                            undone. Are you sure you want to
                                            continue?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => {
                                                questions.set([]);
                                                setShowDeleteAllConfirm(false);
                                            }}
                                        >
                                            Confirm Delete All
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            {locked !== undefined && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setLocked!(!locked)}
                                    disabled={$isLoading}
                                >
                                    {locked ? <LockIcon /> : <UnlockIcon />}
                                </Button>
                            )}
                        </div>
                        {footer}
                    </SidebarGroupContent>
                </div>
            </SidebarGroup>
            <Separator className="h-1" />
        </>
    );
};
