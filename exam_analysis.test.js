import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectBreakdown } from './exam_analysis.js';

test('subjectBreakdown aggregates by subject instead of raw category label', () => {
    const questions = [
        { subject: 'テクノロジ', category: '理論', correctKey: 'A', prompt: 'q1' },
        { subject: 'テクノロジ', category: 'ネットワーク', correctKey: 'B', prompt: 'q2' },
        { subject: 'マネジメント', category: 'プロジェクトマネジメント', correctKey: 'C', prompt: 'q3' },
    ];
    const answers = new Map([[0, 'A'], [1, 'X'], [2, 'C']]);

    assert.deepEqual(subjectBreakdown(questions, answers), [
        { category: 'テクノロジ', correct: 1, total: 2, answered: 2 },
        { category: 'マネジメント', correct: 1, total: 1, answered: 1 },
    ]);
});
