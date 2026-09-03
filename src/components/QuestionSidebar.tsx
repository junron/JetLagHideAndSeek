import { useStore } from "@nanostores/react";
import { SidebarCloseIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";

import { QuestionDeadline } from "@/components/game/QuestionDeadline";
import { Button } from "@/components/ui/button";
import {
    Sidebar,
    SidebarContent,
    SidebarContext,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import {
    applyAnswer,
    canEditPendingQuestionResult,
    canSendHiderAnswer,
    cloneQuestion,
    type GameQuestion,
    gameSession,
    gameSnapshot,
    hiderAnswerPreviews,
    hiderAnswersUpdating,
    selectSidebarQuestions,
    sendAnswer,
    unaskQuestion,
} from "@/game/multiplayer";
import {
    autoSave,
    hiderMode,
    isLoading,
    questions,
    save,
    triggerLocalRefresh,
} from "@/lib/context";
import type { Question } from "@/maps/schema";

import { AddQuestionDialog } from "./AddQuestionDialog";
import { PhotoAnswerControls } from "./game/PhotoAnswerControls";
import {
    MatchingQuestionComponent,
    MeasuringQuestionComponent,
    PhotoQuestionComponent,
    RadiusQuestionComponent,
    TentacleQuestionComponent,
    ThermometerQuestionComponent,
} from "./QuestionCards";

function renderQuestion(
    question: Question,
    reactKey: string | number,
    sub?: string,
    displayIndex?: number,
    resultEditable = false,
    footer?: React.ReactNode,
    status?: GameQuestion["status"],
) {
    const props = {
        questionKey: question.key,
        key: reactKey,
        sub,
        displayIndex,
        resultEditable,
        footer: footer,
        status,
    };
    switch (question.id) {
        case "radius":
            return <RadiusQuestionComponent {...props} data={question.data} />;
        case "thermometer":
            return (
                <ThermometerQuestionComponent {...props} data={question.data} />
            );
        case "tentacles":
            return (
                <TentacleQuestionComponent {...props} data={question.data} />
            );
        case "matching":
            return (
                <MatchingQuestionComponent {...props} data={question.data} />
            );
        case "measuring":
            return (
                <MeasuringQuestionComponent {...props} data={question.data} />
            );
        case "photo":
            return <PhotoQuestionComponent {...props} data={question.data} />;
    }
}

export const QuestionSidebar = () => {
    useStore(triggerLocalRefresh);
    const $questions = useStore(questions);
    const $autoSave = useStore(autoSave);
    const $isLoading = useStore(isLoading);
    const $session = useStore(gameSession);
    const $snapshot = useStore(gameSnapshot);
    const $hiderLocation = useStore(hiderMode);
    const previews = useStore(hiderAnswerPreviews);
    const answersUpdating = useStore(hiderAnswersUpdating);
    const [busyQuestion, setBusyQuestion] = useState<string | null>(null);
    const sidebarQuestions = selectSidebarQuestions(
        $session?.player.role ?? null,
        $questions,
        $snapshot,
        $session?.player.id,
    );
    const isHider = $session?.player.role === "hider";

    const submitAnswer = async (item: GameQuestion) => {
        const answer = previews[item.id];
        if (!canSendHiderAnswer(answer, hiderAnswersUpdating.get())) return;
        setBusyQuestion(item.id);
        try {
            await sendAnswer(item.id, answer);
            const next = { ...hiderAnswerPreviews.get() };
            delete next[item.id];
            hiderAnswerPreviews.set(next);
            toast.success("Answer sent");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Could not send answer",
            );
        } finally {
            setBusyQuestion(null);
        }
    };

    const retractQuestion = async (item: GameQuestion) => {
        setBusyQuestion(item.id);
        try {
            await unaskQuestion(item.id);
            toast.success("Question un-asked");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Could not un-ask question",
            );
        } finally {
            setBusyQuestion(null);
        }
    };

    return (
        <Sidebar>
            <div className="flex items-center justify-between">
                <h2 className="ml-4 mt-4 font-poppins text-2xl">Questions</h2>
                <SidebarCloseIcon
                    className="mr-2 visible md:hidden"
                    onClick={() => {
                        SidebarContext.get().setOpenMobile(false);
                    }}
                />
            </div>
            <SidebarContent>
                {isHider && sidebarQuestions.length === 0 && (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Waiting for a seeker to send a question…
                    </p>
                )}
                {sidebarQuestions.map((item, index) => {
                    if (item.source === "local") {
                        return renderQuestion(item.question, item.question.key);
                    }

                    const gameQuestion = item.gameQuestion;
                    const sender = $snapshot?.players.find(
                        (player) => player.id === gameQuestion.senderPlayerId,
                    );
                    const answer =
                        previews[gameQuestion.id] ?? gameQuestion.answer;
                    const resultEditable = canEditPendingQuestionResult(
                        $session,
                        gameQuestion,
                    );
                    const localPendingQuestion = resultEditable
                        ? $questions.find(
                              (question) =>
                                  question.key ===
                                  gameQuestion.clientQuestionKey,
                          )
                        : undefined;
                    const displayQuestion = answer
                        ? applyAnswer(gameQuestion.question, answer)
                        : resultEditable
                          ? (localPendingQuestion ?? gameQuestion.question)
                          : cloneQuestion(gameQuestion.question);
                    if ("drag" in displayQuestion.data)
                        Object.assign(displayQuestion.data, { drag: false });
                    const pending = gameQuestion.status === "pending";
                    const busy = busyQuestion === gameQuestion.id;

                    const footer = (
                        <>
                            <QuestionDeadline
                                answerDueAt={gameQuestion.answerDueAt}
                                status={gameQuestion.status}
                                answeredLate={gameQuestion.answeredLate}
                            />
                            <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900/50 p-2">
                                {isHider ? (
                                    pending ? (
                                        gameQuestion.question.id === "photo" ? (
                                            <PhotoAnswerControls
                                                question={gameQuestion}
                                                disabled={busy}
                                            />
                                        ) : canSendHiderAnswer(
                                              previews[gameQuestion.id],
                                              answersUpdating,
                                          ) ? (
                                            <Button
                                                size="sm"
                                                disabled={busy}
                                                onClick={() =>
                                                    void submitAnswer(
                                                        gameQuestion,
                                                    )
                                                }
                                            >
                                                Send answer
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-slate-400">
                                                {$hiderLocation === false
                                                    ? "Set the private hider location to preview the answer"
                                                    : answersUpdating
                                                      ? "Updating answer…"
                                                      : "Answer preview unavailable"}
                                            </span>
                                        )
                                    ) : (
                                        <span className="text-sm font-semibold text-green-400">
                                            Answer sent
                                        </span>
                                    )
                                ) : pending &&
                                  gameQuestion.senderPlayerId ===
                                      $session?.player.id ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() =>
                                            void retractQuestion(gameQuestion)
                                        }
                                    >
                                        {busy ? "Un-asking…" : "Un-ask"}
                                    </Button>
                                ) : (
                                    <span className="text-sm font-semibold text-slate-300">
                                        {pending
                                            ? "Waiting for hider"
                                            : "Answered"}
                                    </span>
                                )}
                            </div>
                        </>
                    );

                    return renderQuestion(
                        displayQuestion,
                        gameQuestion.id,
                        `${sender?.name ?? "Seeker"} · ${pending ? "Pending" : "Answered"}`,
                        index + 1,
                        resultEditable,
                        footer,
                        gameQuestion.status,
                    );
                })}
            </SidebarContent>
            {!isHider && (
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu data-tutorial-id="add-questions-buttons">
                            <SidebarMenuItem>
                                <AddQuestionDialog>
                                    <SidebarMenuButton disabled={$isLoading}>
                                        Add Question
                                    </SidebarMenuButton>
                                </AddQuestionDialog>
                            </SidebarMenuItem>
                            {!$autoSave && (
                                <SidebarMenuItem>
                                    <SidebarMenuButton
                                        className="rounded-md bg-blue-600 p-2 font-poppins font-semibold transition-shadow duration-500"
                                        onClick={save}
                                        disabled={$isLoading}
                                    >
                                        Save
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            )}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            )}
        </Sidebar>
    );
};
