export type QuestionPresentationStatus = "pending" | "answered" | undefined;

export function initialQuestionCollapsed(
    collapsed: boolean | undefined,
    status: QuestionPresentationStatus,
) {
    return status === "answered" ? true : (collapsed ?? false);
}

export function shouldAutoCollapseQuestion(
    previousStatus: QuestionPresentationStatus,
    status: QuestionPresentationStatus,
) {
    return previousStatus === "pending" && status === "answered";
}
