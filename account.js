import { validatePasswordChange, validateProfileUpdatePayload } from './auth_validation.js';

const elements = {
    greeting: document.querySelector('#accountGreeting'),
    email: document.querySelector('#accountEmail'),
    created: document.querySelector('#accountCreated'),
    logout: document.querySelector('#accountLogout'),
    profileForm: document.querySelector('#profileForm'),
    profileName: document.querySelector('#profileName'),
    profileEmail: document.querySelector('#profileEmail'),
    profileCurrentPassword: document.querySelector('#profileCurrentPassword'),
    profileMessage: document.querySelector('#profileMessage'),
    passwordForm: document.querySelector('#passwordForm'),
    currentPassword: document.querySelector('#currentPassword'),
    newPassword: document.querySelector('#newPassword'),
    passwordMessage: document.querySelector('#passwordMessage'),
    clearHistory: document.querySelector('#clearHistory'),
    historyMessage: document.querySelector('#historyMessage'),
    attemptList: document.querySelector('#attemptList'),
    subjectAnalysisMessage: document.querySelector('#subjectAnalysisMessage'),
    subjectAnalysisList: document.querySelector('#subjectAnalysisList'),
    deleteAccountForm: document.querySelector('#deleteAccountForm'),
    deleteAccountPassword: document.querySelector('#deleteAccountPassword'),
    deleteAccountMessage: document.querySelector('#deleteAccountMessage'),
};

async function request(path, payload) {
    const response = await fetch(path, {
        method: payload ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'ไม่สามารถทำรายการได้');
    return result;
}

function setMessage(element, message, success = false) {
    element.textContent = message;
    element.classList.toggle('is-success', success);
}

function formatDate(timestamp) {
    return new Intl.DateTimeFormat('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(timestamp));
}

function updateHistoryCount(attempts) {
    elements.clearHistory.disabled = attempts.length === 0;
    elements.clearHistory.textContent = attempts.length ? `ล้างประวัติ (${attempts.length})` : 'ล้างประวัติ';
}

function appendAnswerValue(container, label, text, imagePath) {
    const value = document.createElement('p');
    value.className = 'attempt-answer-value';
    const heading = document.createElement('strong');
    heading.textContent = `${label}: `;
    value.append(heading, document.createTextNode(text || 'ไม่ได้เลือกคำตอบ'));
    if (imagePath) {
        const image = document.createElement('img');
        image.className = 'attempt-answer-image';
        image.src = imagePath;
        image.alt = `${label} รูปภาพตัวเลือก`;
        value.append(image);
    }
    container.append(value);
}

function renderAttemptAnswers(attempt) {
    const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
    if (!answers.length) {
        const note = document.createElement('p');
        note.className = 'attempt-details-unavailable';
        note.textContent = 'รายการนี้บันทึกก่อนมีระบบเก็บคำตอบรายข้อ';
        return note;
    }

    const disclosure = document.createElement('details');
    disclosure.className = 'attempt-answer-details';
    const summary = document.createElement('summary');
    summary.textContent = `ดูคำตอบรายข้อ (${answers.length})`;
    disclosure.append(summary);
    const list = document.createElement('div');
    list.className = 'attempt-answer-list';

    for (const answer of answers) {
        const item = document.createElement('article');
        item.className = `attempt-answer-item${answer.isCorrect === 1 ? ' is-correct' : answer.isCorrect === 0 ? ' is-wrong' : ''}`;
        const heading = document.createElement('div');
        heading.className = 'attempt-answer-heading';
        const number = document.createElement('strong');
        number.textContent = `ข้อ ${answer.questionNumber}`;
        const category = document.createElement('span');
        category.textContent = answer.category || 'ไม่ระบุวิชา';
        const status = document.createElement('span');
        status.className = 'attempt-answer-status';
        status.textContent = answer.isCorrect === null
            ? 'ไม่มีเฉลย'
            : answer.isCorrect === 1 ? 'ถูก' : answer.selectedKey ? 'ผิด' : 'ไม่ได้ตอบ';
        heading.append(number, category, status);

        const prompt = document.createElement('p');
        prompt.className = 'attempt-answer-prompt';
        prompt.textContent = answer.prompt;
        item.append(heading, prompt);
        if (answer.questionImage) {
            const image = document.createElement('img');
            image.className = 'attempt-question-image';
            image.src = answer.questionImage;
            image.alt = `ภาพประกอบข้อ ${answer.questionNumber}`;
            item.append(image);
        }
        appendAnswerValue(item, 'คำตอบของคุณ', answer.selectedText, answer.selectedImage);
        if (answer.correctKey) appendAnswerValue(item, 'เฉลย', answer.correctText, answer.correctImage);
        if (answer.explanation) {
            const explanation = document.createElement('p');
            explanation.className = 'attempt-answer-explanation';
            explanation.textContent = answer.explanation;
            item.append(explanation);
        }
        list.append(item);
    }
    disclosure.append(list);
    return disclosure;
}

function renderSubjectAnalysis(attempts) {
    const totals = new Map();
    let taggedAttempts = 0;
    let scorableQuestions = 0;
    for (const attempt of attempts) {
        scorableQuestions += attempt.scored_count ?? 0;
        if (!Array.isArray(attempt.breakdown) || !attempt.breakdown.length) continue;
        taggedAttempts += 1;
        for (const item of attempt.breakdown) {
            const current = totals.get(item.category) ?? {
                category: item.category,
                correct: 0,
                total: 0,
                answered: 0,
                attempts: 0,
            };
            current.correct += item.correct;
            current.total += item.total;
            current.answered += item.answered;
            current.attempts += 1;
            totals.set(item.category, current);
        }
    }

    elements.subjectAnalysisList.replaceChildren();
    const categorizedQuestions = [...totals.values()].reduce((sum, subject) => sum + subject.total, 0);
    const unclassifiedQuestions = Math.max(0, scorableQuestions - categorizedQuestions);
    if (!totals.size) {
        elements.subjectAnalysisMessage.textContent = attempts.length
            ? `ยังจัดหมวดรายวิชาไม่ได้ ${unclassifiedQuestions} ข้อ เพราะไม่มีข้อมูลที่มั่นใจพอ`
            : 'ทำข้อสอบที่มีข้อมูลแยกรายวิชาเพื่อเริ่มวิเคราะห์';
        return;
    }

    elements.subjectAnalysisMessage.textContent = `วิเคราะห์จาก ${taggedAttempts} ครั้ง · จัดหมวดได้ ${categorizedQuestions}/${scorableQuestions} ข้อ · ยังไม่ระบุ ${unclassifiedQuestions} ข้อ`;
    const subjects = [...totals.values()].sort((left, right) => (left.correct / left.total) - (right.correct / right.total));
    for (const subject of subjects) {
        const percentage = Math.round((subject.correct / subject.total) * 100);
        const status = subject.total < 3 ? 'ข้อมูลยังน้อย' : percentage >= 70 ? 'จุดแข็ง' : percentage < 60 ? 'ควรเสริม' : 'กำลังพัฒนา';
        const row = document.createElement('div');
        row.className = `subject-analysis-row${status === 'ควรเสริม' ? ' is-weak' : ''}`;
        const top = document.createElement('div');
        top.className = 'subject-analysis-top';
        const name = document.createElement('strong');
        name.textContent = subject.category;
        const label = document.createElement('span');
        label.className = `subject-analysis-label${status === 'จุดแข็ง' ? ' is-strong' : status === 'ควรเสริม' ? ' is-weak' : ''}`;
        label.textContent = status;
        top.append(name, label);

        const details = document.createElement('div');
        details.className = 'subject-analysis-details';
        details.textContent = `${subject.correct}/${subject.total} ข้อ · ตอบแล้ว ${subject.answered} ข้อ · ${subject.attempts} ครั้ง · ${percentage}%`;

        const track = document.createElement('div');
        track.className = 'subject-analysis-track';
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', `${subject.category} ${percentage}%`);
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', String(percentage));
        const fill = document.createElement('span');
        fill.style.width = `${percentage}%`;
        track.append(fill);
        row.append(top, details, track);
        elements.subjectAnalysisList.append(row);
    }
}

function renderAttempts(attempts) {
    elements.attemptList.replaceChildren();
    updateHistoryCount(attempts);
    if (!attempts.length) {
        const empty = document.createElement('p');
        empty.className = 'history-empty';
        empty.textContent = 'ยังไม่มีประวัติการสอบ';
        elements.attemptList.append(empty);
        return;
    }

    for (const attempt of attempts) {
        const row = document.createElement('article');
        row.className = 'attempt-row';

        const summary = document.createElement('div');
        const title = document.createElement('h3');
        title.className = 'attempt-title';
        title.textContent = attempt.set_title;
        const details = document.createElement('p');
        details.className = 'attempt-details';
        details.textContent = `ถูก ${attempt.correct_count}/${attempt.scored_count} ข้อ · ตอบ ${attempt.answered_count}/${attempt.question_count} ข้อ`;
        summary.append(title, details);

        const score = document.createElement('strong');
        score.className = `attempt-score${attempt.score_percent >= 70 ? ' is-pass' : ''}`;
        score.textContent = `${attempt.score_percent}%`;

        const date = document.createElement('p');
        date.className = 'attempt-date';
        date.textContent = formatDate(attempt.created_at);

        const remove = document.createElement('button');
        remove.className = 'delete-attempt';
        remove.type = 'button';
        remove.textContent = 'ลบรายการ';
        remove.setAttribute('aria-label', `ลบประวัติ ${attempt.set_title}`);
        remove.addEventListener('click', async () => {
            if (!window.confirm(`ลบประวัติการสอบ “${attempt.set_title}” หรือไม่?`)) return;
            remove.disabled = true;
            try {
                await request(`/api/attempts/${attempt.id}/delete`, {});
                await loadAccount();
                setMessage(elements.historyMessage, 'ลบประวัติแล้ว', true);
            } catch (error) {
                remove.disabled = false;
                setMessage(elements.historyMessage, error.message);
            }
        });

        row.append(summary, score, date, remove, renderAttemptAnswers(attempt));
        elements.attemptList.append(row);
    }
}

async function loadAccount() {
    const response = await request('/api/session');
    if (!response.user) {
        window.location.replace('./?auth=login');
        return;
    }

    const { user, attempts } = await request('/api/account');
    elements.greeting.textContent = user.name;
    elements.email.textContent = user.email;
    elements.created.textContent = user.createdAt
        ? `สร้างบัญชีเมื่อ ${formatDate(user.createdAt)}`
        : '';
    elements.profileName.value = user.name;
    elements.profileEmail.value = user.email;
    renderAttempts(attempts);
    renderSubjectAnalysis(attempts);
}

elements.profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.profileForm.reportValidity()) return;
    const submit = elements.profileForm.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    setMessage(elements.profileMessage, '');

    const validationMessage = validateProfileUpdatePayload({
        name: elements.profileName.value,
        email: elements.profileEmail.value,
        currentPassword: elements.profileCurrentPassword.value,
    });
    if (validationMessage) {
        setMessage(elements.profileMessage, validationMessage);
        submit.disabled = false;
        return;
    }

    try {
        const { user } = await request('/api/account/profile', {
            name: elements.profileName.value,
            email: elements.profileEmail.value,
            currentPassword: elements.profileCurrentPassword.value,
        });
        elements.greeting.textContent = user.name;
        elements.email.textContent = user.email;
        elements.profileName.value = user.name;
        elements.profileEmail.value = user.email;
        elements.profileCurrentPassword.value = '';
        setMessage(elements.profileMessage, 'บันทึกข้อมูลบัญชีแล้ว', true);
    } catch (error) {
        setMessage(elements.profileMessage, error.message);
    } finally {
        submit.disabled = false;
    }
});

elements.passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.passwordForm.reportValidity()) return;
    const submit = elements.passwordForm.querySelector('[type="submit"]');
    if (submit.disabled) return;

    const currentPassword = elements.currentPassword.value;
    const newPassword = elements.newPassword.value;
    const validationMessage = validatePasswordChange(currentPassword, newPassword);
    if (validationMessage) {
        setMessage(elements.passwordMessage, validationMessage);
        return;
    }

    submit.disabled = true;
    setMessage(elements.passwordMessage, '');
    try {
        await request('/api/account/password', {
            currentPassword,
            newPassword,
        });
        elements.passwordForm.reset();
        setMessage(elements.passwordMessage, 'เปลี่ยนรหัสผ่านแล้ว', true);
    } catch (error) {
        setMessage(elements.passwordMessage, error.message);
    } finally {
        submit.disabled = false;
    }
});

elements.clearHistory.addEventListener('click', async () => {
    if (!window.confirm('ลบประวัติการสอบทั้งหมดในบัญชีนี้หรือไม่?')) return;
    if (elements.clearHistory.disabled) return;
    elements.clearHistory.disabled = true;
    setMessage(elements.historyMessage, '');
    try {
        await request('/api/account/history/clear', {});
        renderAttempts([]);
        setMessage(elements.historyMessage, 'ล้างประวัติทั้งหมดแล้ว', true);
    } catch (error) {
        setMessage(elements.historyMessage, error.message);
        elements.clearHistory.disabled = false;
    }
});

elements.deleteAccountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.deleteAccountForm.reportValidity()) return;
    if (!window.confirm('ลบบัญชีและประวัติการสอบทั้งหมดอย่างถาวรหรือไม่?')) return;

    const submit = elements.deleteAccountForm.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    setMessage(elements.deleteAccountMessage, '');
    try {
        await request('/api/account/delete', { currentPassword: elements.deleteAccountPassword.value });
        window.location.replace('./');
    } catch (error) {
        setMessage(elements.deleteAccountMessage, error.message);
        submit.disabled = false;
    }
});

elements.logout.addEventListener('click', async () => {
    if (elements.logout.disabled) return;
    elements.logout.disabled = true;
    try {
        await request('/api/logout', {});
        window.location.replace('./');
    } catch (error) {
        setMessage(elements.historyMessage, error.message);
        elements.logout.disabled = false;
    }
});

loadAccount().catch(() => window.location.replace('./?auth=login'));
