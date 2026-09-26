export function subjectBreakdown(questions, answers) {
    const totals = new Map();

    for (const [index, question] of questions.entries()) {
        if (!question.subject || !question.correctKey) continue;

        const current = totals.get(question.subject) ?? {
            category: question.subject,
            correct: 0,
            total: 0,
            answered: 0,
        };

        current.total += 1;
        if (answers.has(index)) current.answered += 1;
        if (answers.get(index) === question.correctKey) current.correct += 1;
        totals.set(question.subject, current);
    }

    return [...totals.values()];
}
