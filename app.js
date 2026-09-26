import { classifySubject } from './subject_classifier.js';
import { subjectBreakdown } from './exam_analysis.js';
import { validateAuthPayload } from './auth_validation.js';

const state = {
    sets: [],
    currentSet: null,
    questions: [],
    index: 0,
    answers: new Map(),
    authMode: 'login',
    authUser: null,
};

const elements = {
    workspace: document.querySelector('.workspace'),
    libraryToggle: document.querySelector('#libraryToggle'),
    libraryPanel: document.querySelector('#libraryPanel'),
    groups: document.querySelector('#setGroups'),
    search: document.querySelector('#setSearch'),
    title: document.querySelector('#setTitle'),
    eyebrow: document.querySelector('#setEyebrow'),
    description: document.querySelector('#setDescription'),
    position: document.querySelector('#questionPosition'),
    answered: document.querySelector('#answeredCount'),
    progress: document.querySelector('#progressBar'),
    progressTrack: document.querySelector('.progress-track'),
    number: document.querySelector('#questionNumber'),
    question: document.querySelector('#questionText'),
    image: document.querySelector('#questionImage'),
    options: document.querySelector('#answerOptions'),
    feedback: document.querySelector('#answerFeedback'),
    previous: document.querySelector('#previousButton'),
    next: document.querySelector('#nextButton'),
    finish: document.querySelector('#finishButton'),
    shuffle: document.querySelector('#shuffleToggle'),
    hint: document.querySelector('#selectionHint'),
    stage: document.querySelector('#questionStage'),
    status: document.querySelector('#statusMessage'),
    libraryToggle: document.querySelector('#libraryToggle'),
    authGreeting: document.querySelector('#authGreeting'),
    accountLink: document.querySelector('#accountLink'),
    authButton: document.querySelector('#authButton'),
    logoutButton: document.querySelector('#logoutButton'),
    authDialog: document.querySelector('#authDialog'),
    authClose: document.querySelector('#authClose'),
    authForm: document.querySelector('#authForm'),
    authNameField: document.querySelector('#authNameField'),
    authName: document.querySelector('#authName'),
    authEmail: document.querySelector('#authEmail'),
    authPassword: document.querySelector('#authPassword'),
    authHeading: document.querySelector('#authHeading'),
    authIntro: document.querySelector('#authIntro'),
    authMessage: document.querySelector('#authMessage'),
    authSubmit: document.querySelector('#authSubmit'),
};

async function readJson(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`โหลด ${path} ไม่สำเร็จ`);
    return response.json();
}

async function requestAuth(path, payload) {
    const response = await fetch(path, {
        method: payload ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'ไม่สามารถเชื่อมต่อระบบบัญชีได้');
    return result;
}

function updateAuthUser(user) {
    state.authUser = user;
    elements.authGreeting.hidden = !user;
    elements.authGreeting.textContent = user ? `สวัสดี ${user.name}` : '';
    elements.accountLink.hidden = !user;
    elements.authButton.hidden = Boolean(user);
    elements.logoutButton.hidden = !user;
}

function setAuthMode(mode) {
    state.authMode = mode;
    const registering = mode === 'register';
    elements.authNameField.hidden = !registering;
    elements.authName.required = registering;
    elements.authPassword.autocomplete = registering ? 'new-password' : 'current-password';
    elements.authHeading.textContent = registering ? 'สร้างบัญชี' : 'เข้าสู่ระบบ';
    elements.authIntro.textContent = registering ? 'สร้างบัญชีสำหรับใช้งาน IPASS บนเครื่องนี้' : 'เข้าสู่ระบบเพื่อใช้บัญชีของคุณ';
    elements.authSubmit.textContent = registering ? 'สร้างบัญชีและเข้าสู่ระบบ' : 'เข้าสู่ระบบ';
    elements.authMessage.textContent = '';
    for (const button of document.querySelectorAll('[data-auth-mode]')) {
        button.setAttribute('aria-pressed', String(button.dataset.authMode === mode));
    }
}

async function restoreAuthSession() {
    try {
        const { user } = await requestAuth('/api/session');
        updateAuthUser(user);
    } catch {
        updateAuthUser(null);
    }
    if (new URLSearchParams(window.location.search).get('auth') === 'login' && !state.authUser) {
        setAuthMode('login');
        elements.authDialog.showModal();
    }
}

function normalizeQuestion(question, answer, category = '') {
    const sourceOptions = question.options ?? question.choices ?? {};
    const options = Array.isArray(sourceOptions)
        ? sourceOptions.map((value, index) => normalizeOption(String(index + 1), value))
        : Object.entries(sourceOptions).map(([key, value]) => normalizeOption(key, value));
    const answerKey = Array.isArray(sourceOptions)
        ? options.find((option) => option.text === answer)?.key
        : answer;
    const imageMatch = question.image_file?.match(/(?:^|\/)img\/(.+)$/);
    const sourceCategory = String(category || question.category || question.subject || '').trim();
    const explicitSubject = ['テクノロジ', 'マネジメント', 'ストラテジ'].includes(sourceCategory)
        ? sourceCategory
        : sourceCategory === 'プロジェクトマネジメント' ? 'マネジメント' : sourceCategory ? 'テクノロジ' : '';
    const optionHints = Object.values(sourceOptions)
        .filter((value) => typeof value === 'string' && !/\.(?:png|jpe?g|gif|webp)$/i.test(value))
        .join(' ');
    const classification = explicitSubject ? null : classifySubject(question.question, optionHints);

    return {
        prompt: question.question ?? '',
        options,
        correctKey: answerKey,
        explanation: question.explanation ?? '',
        category: sourceCategory || classification.category,
        subject: explicitSubject || classification.subject,
        subjectConfidence: explicitSubject ? 'explicit' : classification.confidence,
        image: imageMatch ? `img/${imageMatch[1]}` : '',
    };
}

function normalizeOption(key, value) {
    const imageMatch = typeof value === 'string' && value.match(/(?:^|\/)img\/(.+\.(?:png|jpe?g|gif|webp))$/i);
    const legacyImageMatch = !imageMatch && typeof value === 'string' && value.match(/kakomon\/([^/]+\/[^/]+\.(?:png|jpe?g|gif|webp))$/i);
    const image = imageMatch
        ? `img/${imageMatch[1]}`
        : legacyImageMatch ? `img/${legacyImageMatch[1]}` : '';

    return { key, text: image ? '' : value, image };
}

function makeSet(id, group, title, description, items) {
    return { id, group, title, description, items };
}

async function loadLibrary() {
    try {
        const [practice, categories, publicExams, courseExams, answerSets] = await Promise.all([
            readJson('questions.json'),
            readJson('category_questions.json'),
            readJson('kakomon_questionsA.json'),
            readJson('kakomon_questionsS.json'),
            readJson('kakomon_answers.json'),
        ]);

        state.sets = [
            makeSet('practice', 'ชุดฝึก', 'โจทย์ฝึกพื้นฐาน', 'โจทย์รวมพร้อมเฉลยและคำอธิบาย',
                practice.map((question) => normalizeQuestion(question, question.answer, question.category))),
            ...Object.entries(categories).map(([category, questions]) => makeSet(
                `category-${category}`, 'แยกตามหมวด', category, `${questions.length} ข้อ`,
                questions.map((question) => normalizeQuestion(question, question.answer, category)),
            )),
            ...publicExams.exam_data.map((exam) => makeSet(
                `public-${exam.year}`, '科目 A · ข้อสอบเผยแพร่', exam.title, `${exam.questions.length} ข้อ · ${exam.era_name}`,
                exam.questions.map((question) => normalizeQuestion(
                    question, answerSets['科目A試験']?.[String(exam.year)]?.[String(question.id)],
                    question.category,
                )),
            )),
            ...courseExams.exam_data.map((exam) => makeSet(
                `course-${exam.year}`, '修了認定 · ข้อสอบย้อนหลัง', exam.title, `${exam.questions.length} ข้อ · ${exam.era_name}`,
                exam.questions.map((question) => normalizeQuestion(
                    question, answerSets['科目A修了認定試験']?.[String(exam.year)]?.[String(question.id)],
                    question.category,
                )),
            )),
        ];

        renderLibrary();
        startSet(state.sets[0]);
    } catch (error) {
        elements.groups.innerHTML = '<p class="empty-search">เปิดคลังข้อสอบไม่สำเร็จ กรุณาเรียกเว็บผ่าน local server</p>';
        elements.title.textContent = 'โหลดข้อมูลไม่ได้';
        elements.description.textContent = error.message;
        elements.status.textContent = 'หากเปิดไฟล์ index.html โดยตรง เบราว์เซอร์อาจบล็อกการอ่าน JSON';
    }
}

function renderLibrary() {
    const query = elements.search.value.trim().toLocaleLowerCase();
    const filtered = state.sets.filter((set) => `${set.title} ${set.group}`.toLocaleLowerCase().includes(query));
    const groups = new Map();
    for (const set of filtered) {
        if (!groups.has(set.group)) groups.set(set.group, []);
        groups.get(set.group).push(set);
    }

    elements.groups.replaceChildren();
    if (!filtered.length) {
        elements.groups.innerHTML = '<p class="empty-search">ไม่พบชุดข้อสอบที่ตรงกัน</p>';
        return;
    }

    for (const [groupName, sets] of groups) {
        const group = document.createElement('section');
        group.className = 'set-group';
        const heading = document.createElement('h2');
        heading.className = 'set-group-title';
        heading.textContent = groupName;
        group.append(heading);

        for (const set of sets) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'set-button';
            button.setAttribute('aria-current', String(state.currentSet?.id === set.id));
            button.innerHTML = '<span></span><span class="set-button-count"></span>';
            button.firstElementChild.textContent = set.title;
            button.lastElementChild.textContent = `${set.items.length} ข้อ`;
            button.addEventListener('click', () => startSet(set));
            group.append(button);
        }
        elements.groups.append(group);
    }
}

function shuffled(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
}

function startSet(set) {
    state.currentSet = set;
    state.questions = elements.shuffle.checked ? shuffled(set.items) : [...set.items];
    state.index = 0;
    state.answers = new Map();
    elements.title.textContent = set.title;
    elements.eyebrow.textContent = set.group;
    elements.description.textContent = set.description;
    elements.status.textContent = '';
    elements.stage.hidden = false;
    elements.finish.hidden = false;
    elements.stage.parentElement.querySelector('.result-view')?.remove();
    renderLibrary();
    renderQuestion();
}

function renderQuestion() {
    const question = state.questions[state.index];
    if (!question) return;
    const answeredCount = state.answers.size;
    const percent = Math.round((answeredCount / state.questions.length) * 100);
    elements.position.textContent = `ข้อ ${String(state.index + 1).padStart(2, '0')} / ${state.questions.length}`;
    elements.answered.textContent = `ตอบแล้ว ${answeredCount} ข้อ`;
    elements.progress.style.width = `${percent}%`;
    elements.progressTrack.setAttribute('aria-valuenow', String(percent));
    elements.number.textContent = String(state.index + 1).padStart(2, '0');
    elements.question.textContent = question.prompt;
    elements.previous.disabled = state.index === 0;
    elements.next.disabled = state.index === state.questions.length - 1;
    elements.hint.textContent = state.answers.has(state.index) ? 'คำตอบถูกบันทึกแล้ว' : 'เลือกคำตอบเพื่อบันทึก';
    const hasAnswer = state.answers.has(state.index);
    const selectedKey = state.answers.get(state.index);
    const legend = elements.options.querySelector('legend');
    elements.options.replaceChildren(legend);

    for (const option of question.options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'option-button';
        const isCorrectOption = hasAnswer && question.correctKey && option.key === question.correctKey;
        const isIncorrectSelection = hasAnswer && question.correctKey && option.key === selectedKey && !isCorrectOption;
        button.setAttribute('aria-pressed', String(selectedKey === option.key));
        button.classList.toggle('is-correct-option', Boolean(isCorrectOption));
        button.classList.toggle('is-incorrect-selection', Boolean(isIncorrectSelection));
        button.innerHTML = '<span class="option-key"></span><span class="option-text"></span><span class="option-check" aria-hidden="true">✓</span>';
        button.querySelector('.option-key').textContent = option.key;
        const optionContent = button.querySelector('.option-text');
        if (option.image) {
            const image = document.createElement('img');
            image.className = 'option-image';
            image.src = option.image;
            image.alt = `รูปภาพตัวเลือก ${option.key}`;
            image.onerror = () => { optionContent.textContent = 'โหลดรูปภาพตัวเลือกไม่สำเร็จ'; };
            optionContent.append(image);
        } else {
            optionContent.textContent = option.text;
        }
        button.addEventListener('click', () => {
            state.answers.set(state.index, option.key);
            renderQuestion();
        });
        elements.options.append(button);
    }

    elements.feedback.hidden = !hasAnswer;
    if (hasAnswer) {
        const isCorrect = Boolean(question.correctKey) && selectedKey === question.correctKey;
        elements.feedback.className = `answer-feedback ${question.correctKey ? (isCorrect ? 'is-correct' : 'is-incorrect') : 'is-unavailable'}`;
        elements.feedback.querySelector('.feedback-result').textContent = !question.correctKey
            ? 'บันทึกคำตอบแล้ว แต่ชุดนี้ไม่มีเฉลยในข้อมูล'
            : isCorrect ? '✓ ตอบถูกต้อง' : 'ยังไม่ถูกต้อง';
        elements.feedback.querySelector('.feedback-answer').textContent = question.correctKey
            ? `เฉลยที่ถูก: ${answerText(question, question.correctKey)}`
            : '';
        const explanation = elements.feedback.querySelector('.feedback-explanation');
        explanation.textContent = question.explanation;
        explanation.hidden = !question.explanation;
    }

    if (question.image) {
        const image = elements.image.querySelector('img');
        image.src = question.image;
        image.alt = `ภาพประกอบข้อ ${state.index + 1}`;
        image.onerror = () => { elements.image.hidden = true; };
        elements.image.hidden = false;
    } else {
        elements.image.hidden = true;
    }
}

function answerText(question, key) {
    if (!key) return 'ยังไม่ได้ตอบ';
    const option = question.options.find((item) => item.key === key);
    return option ? `${key}. ${option.image ? 'รูปภาพตัวเลือก' : option.text}` : 'ไม่มีเฉลยในคลังข้อมูล';
}

function attemptAnswerDetails(questions, answers) {
    return questions.map((question, index) => {
        const selectedKey = answers.get(index) ?? '';
        const selectedOption = question.options.find((option) => option.key === selectedKey);
        const correctOption = question.options.find((option) => option.key === question.correctKey);
        return {
            questionNumber: index + 1,
            category: question.category,
            prompt: question.prompt,
            selectedKey,
            correctKey: question.correctKey ?? '',
            selectedText: selectedOption?.image ? 'รูปภาพตัวเลือก' : selectedOption?.text ?? '',
            correctText: correctOption?.image ? 'รูปภาพตัวเลือก' : correctOption?.text ?? '',
            explanation: question.explanation,
            questionImage: question.image,
            selectedImage: selectedOption?.image ?? '',
            correctImage: correctOption?.image ?? '',
        };
    });
}

function renderSubjectAnalysis(breakdown, scorableCount) {
    const section = document.createElement('section');
    section.className = 'subject-analysis';
    const heading = document.createElement('h3');
    heading.textContent = 'วิเคราะห์รายวิชา';
    section.append(heading);

    if (!breakdown.length) {
        const empty = document.createElement('p');
        empty.className = 'subject-analysis-empty';
        empty.textContent = scorableCount
            ? `ยังจัดหมวดได้ 0/${scorableCount} ข้อ เพราะไม่มีแท็กหรือคำใบ้ที่มั่นใจพอ`
            : 'ชุดข้อสอบนี้ไม่มีเฉลยที่ใช้วิเคราะห์รายวิชาได้';
        section.append(empty);
        return section;
    }

    const list = document.createElement('div');
    list.className = 'subject-analysis-list';
    for (const item of breakdown) {
        const percentage = Math.round((item.correct / item.total) * 100);
        const status = item.total < 3 ? 'ข้อมูลยังน้อย' : percentage >= 70 ? 'จุดแข็ง' : percentage < 60 ? 'ควรเสริม' : 'กำลังพัฒนา';
        const row = document.createElement('div');
        row.className = `subject-analysis-row${status === 'ควรเสริม' ? ' is-weak' : ''}`;
        const top = document.createElement('div');
        top.className = 'subject-analysis-top';
        const name = document.createElement('strong');
        name.textContent = item.category;
        const label = document.createElement('span');
        label.className = `subject-analysis-label${status === 'จุดแข็ง' ? ' is-strong' : status === 'ควรเสริม' ? ' is-weak' : ''}`;
        label.textContent = status;
        top.append(name, label);
        const details = document.createElement('div');
        details.className = 'subject-analysis-details';
        details.textContent = `${item.correct}/${item.total} ข้อ · ตอบแล้ว ${item.answered}/${item.total} · ${percentage}%`;
        const track = document.createElement('div');
        track.className = 'subject-analysis-track';
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', `${item.category} ${percentage}%`);
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', String(percentage));
        const fill = document.createElement('span');
        fill.style.width = `${percentage}%`;
        track.append(fill);
        row.append(top, details, track);
        list.append(row);
    }
    section.append(list);
    const categorizedCount = breakdown.reduce((sum, item) => sum + item.total, 0);
    if (categorizedCount < scorableCount) {
        const note = document.createElement('p');
        note.className = 'subject-analysis-empty';
        note.textContent = `จัดหมวดได้ ${categorizedCount}/${scorableCount} ข้อ · อีก ${scorableCount - categorizedCount} ข้อยังไม่มีข้อมูลที่มั่นใจพอ`;
        section.append(note);
    }
    return section;
}

function finishSet() {
    const unanswered = state.questions.length - state.answers.size;
    if (unanswered > 0 && !window.confirm(`ยังไม่ได้ตอบ ${unanswered} ข้อ ต้องการส่งคำตอบหรือไม่?`)) return;
    renderResults();
}

function renderResults() {
    const scored = state.questions
        .map((question, index) => ({ question, index }))
        .filter(({ question }) => question.correctKey);
    const correct = scored.filter(({ question, index }) => state.answers.get(index) === question.correctKey).length;
    const percentage = scored.length ? Math.round((correct / scored.length) * 100) : 0;
    const breakdown = subjectBreakdown(state.questions, state.answers);
    elements.stage.hidden = true;
    elements.finish.hidden = true;
    elements.position.textContent = 'สรุปผลการสอบ';
    elements.answered.textContent = `ตอบแล้ว ${state.answers.size} / ${state.questions.length} ข้อ`;
    elements.progress.style.width = `${percentage}%`;
    elements.progressTrack.setAttribute('aria-valuenow', String(percentage));

    const result = document.createElement('section');
    result.className = 'result-view';
    const summary = document.createElement('div');
    summary.className = 'result-summary';
    summary.innerHTML = '<div><p class="eyebrow">ผลการทำข้อสอบ</p><h3></h3><p></p></div><div class="score-stamp"><strong></strong><span>คะแนน</span></div>';
    summary.querySelector('h3').textContent = percentage >= 70 ? 'ทำได้ดี' : 'ทบทวนอีกครั้ง';
    summary.querySelector('.result-summary p:last-child').textContent = scored.length
        ? `ตอบถูก ${correct} จาก ${scored.length} ข้อ · คิดคะแนนจากข้อที่มีเฉลยในข้อมูล`
        : 'ชุดนี้ไม่มีข้อมูลเฉลยสำหรับคำนวณคะแนน';
    summary.querySelector('.score-stamp strong').textContent = `${percentage}%`;
    result.append(summary);
    result.append(renderSubjectAnalysis(breakdown, scored.length));

    const reviewHeading = document.createElement('div');
    reviewHeading.className = 'review-heading';
    reviewHeading.innerHTML = '<h3>ทบทวนคำตอบ</h3><span></span>';
    reviewHeading.querySelector('span').textContent = `${state.questions.length} ข้อ`;
    result.append(reviewHeading);

    const reviewList = document.createElement('div');
    reviewList.className = 'review-list';
    state.questions.forEach((question, index) => {
        const selected = state.answers.get(index);
        const hasCorrectAnswer = Boolean(question.correctKey);
        const isCorrect = hasCorrectAnswer && selected === question.correctKey;
        const item = document.createElement('article');
        item.className = `review-item ${isCorrect ? 'is-correct' : 'is-wrong'}`;
        const topLine = document.createElement('div');
        topLine.className = 'review-topline';
        topLine.innerHTML = '<span></span><span class="review-result"></span>';
        topLine.firstElementChild.textContent = `QUESTION ${String(index + 1).padStart(2, '0')}`;
        topLine.lastElementChild.textContent = !hasCorrectAnswer ? 'ไม่มีเฉลย' : isCorrect ? 'ถูกต้อง' : 'ควรทบทวน';
        const prompt = document.createElement('p');
        prompt.className = 'review-question';
        prompt.textContent = question.prompt;
        const selectedAnswer = document.createElement('p');
        selectedAnswer.className = 'review-answer';
        selectedAnswer.innerHTML = '<strong>คำตอบของคุณ:</strong> ';
        selectedAnswer.append(document.createTextNode(answerText(question, selected)));
        const correctAnswer = document.createElement('p');
        correctAnswer.className = 'review-answer';
        correctAnswer.innerHTML = '<strong>เฉลย:</strong> ';
        correctAnswer.append(document.createTextNode(answerText(question, question.correctKey)));
        item.append(topLine, prompt, selectedAnswer, correctAnswer);
        if (question.explanation) {
            const explanation = document.createElement('p');
            explanation.className = 'review-explanation';
            explanation.textContent = question.explanation;
            item.append(explanation);
        }
        reviewList.append(item);
    });
    result.append(reviewList);

    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'finish-button';
    retry.textContent = 'ทำชุดนี้อีกครั้ง ↻';
    retry.addEventListener('click', () => startSet(state.currentSet));
    actions.append(retry);
    result.append(actions);
    elements.stage.parentElement.append(result);
    if (state.authUser) {
        elements.status.textContent = 'กำลังบันทึกผลสอบ...';
        requestAuth('/api/attempts', {
            setId: state.currentSet.id,
            setTitle: state.currentSet.title,
            scorePercent: percentage,
            correctCount: correct,
            scoredCount: scored.length,
            answeredCount: state.answers.size,
            questionCount: state.questions.length,
            breakdown,
            items: attemptAnswerDetails(state.questions, state.answers),
        }).then(() => {
            elements.status.textContent = 'บันทึกผลสอบไว้ในประวัติแล้ว';
        }).catch((error) => {
            elements.status.textContent = `บันทึกประวัติไม่สำเร็จ: ${error.message}`;
        });
    } else {
        elements.status.textContent = 'เข้าสู่ระบบเพื่อบันทึกผลสอบไว้ในประวัติ';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

elements.search.addEventListener('input', renderLibrary);
elements.authButton.addEventListener('click', () => {
    setAuthMode('login');
    elements.authDialog.showModal();
});
elements.authClose.addEventListener('click', () => elements.authDialog.close());
for (const button of document.querySelectorAll('[data-auth-mode]')) {
    button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
}
elements.authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.authForm.reportValidity()) return;
    if (elements.authSubmit.disabled) return;

    const registering = state.authMode === 'register';
    const payload = {
        email: elements.authEmail.value,
        password: elements.authPassword.value,
    };
    if (registering) payload.name = elements.authName.value;

    const validationMessage = validateAuthPayload(payload, registering);
    if (validationMessage) {
        elements.authMessage.textContent = validationMessage;
        return;
    }

    elements.authSubmit.disabled = true;
    elements.authMessage.textContent = '';

    try {
        const { user } = await requestAuth(registering ? '/api/register' : '/api/login', payload);
        updateAuthUser(user);
        elements.authDialog.close();
        elements.authForm.reset();
        setAuthMode('login');
        elements.authMessage.textContent = registering ? 'สร้างบัญชีสำเร็จแล้ว' : 'เข้าสู่ระบบสำเร็จ';
    } catch (error) {
        elements.authMessage.textContent = error.message;
    } finally {
        elements.authSubmit.disabled = false;
    }
});
elements.logoutButton.addEventListener('click', async () => {
    elements.logoutButton.disabled = true;
    try {
        await requestAuth('/api/logout', {});
        updateAuthUser(null);
    } catch (error) {
        elements.status.textContent = error.message;
    } finally {
        elements.logoutButton.disabled = false;
    }
});
elements.libraryToggle.addEventListener('click', () => {
    const isExpanded = elements.libraryToggle.getAttribute('aria-expanded') === 'true';
    const nextExpanded = !isExpanded;
    const label = nextExpanded ? 'ซ่อนเมนูชุดข้อสอบ' : 'แสดงเมนูชุดข้อสอบ';
    elements.workspace.classList.toggle('library-collapsed', !nextExpanded);
    elements.libraryToggle.classList.toggle('is-collapsed', !nextExpanded);
    elements.libraryPanel.toggleAttribute('inert', !nextExpanded);
    elements.libraryPanel.setAttribute('aria-hidden', String(!nextExpanded));
    elements.libraryToggle.setAttribute('aria-expanded', String(nextExpanded));
    elements.libraryToggle.setAttribute('aria-label', label);
    elements.libraryToggle.title = label;
});
elements.previous.addEventListener('click', () => {
    if (state.index > 0) { state.index -= 1; renderQuestion(); }
});
elements.next.addEventListener('click', () => {
    if (state.index < state.questions.length - 1) { state.index += 1; renderQuestion(); }
});
elements.finish.addEventListener('click', finishSet);
elements.shuffle.addEventListener('change', () => {
    if (state.currentSet) startSet(state.currentSet);
});
document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        event.preventDefault();
        elements.search.focus();
    }
});

loadLibrary();
restoreAuthSession();