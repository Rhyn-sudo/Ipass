import { createServer } from 'node:http';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { isSameOriginHost } from './origin_validation.js';

const scrypt = promisify(scryptCallback);
const root = import.meta.dirname;
const dataDirectory = path.join(root, '.data');
const databasePath = path.join(dataDirectory, 'ipass.sqlite');
const port = Number(process.env.PORT ?? 4173);
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;
const maximumJsonBytes = 256 * 1024;
const loginAttempts = new Map();

mkdirSync(dataDirectory, { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS exam_attempts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        set_id TEXT NOT NULL,
        set_title TEXT NOT NULL,
        score_percent INTEGER NOT NULL CHECK(score_percent BETWEEN 0 AND 100),
        correct_count INTEGER NOT NULL,
        scored_count INTEGER NOT NULL,
        answered_count INTEGER NOT NULL,
        question_count INTEGER NOT NULL,
        breakdown_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attempts_by_user_date ON exam_attempts(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS attempt_answers (
        id INTEGER PRIMARY KEY,
        attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
        question_number INTEGER NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL,
        selected_key TEXT NOT NULL DEFAULT '',
        correct_key TEXT NOT NULL DEFAULT '',
        selected_text TEXT NOT NULL DEFAULT '',
        correct_text TEXT NOT NULL DEFAULT '',
        explanation TEXT NOT NULL DEFAULT '',
        question_image TEXT NOT NULL DEFAULT '',
        selected_image TEXT NOT NULL DEFAULT '',
        correct_image TEXT NOT NULL DEFAULT '',
        is_correct INTEGER CHECK(is_correct IN (0, 1) OR is_correct IS NULL),
        UNIQUE(attempt_id, question_number)
    );
    CREATE INDEX IF NOT EXISTS attempt_answers_by_attempt ON attempt_answers(attempt_id, question_number);
`);

const attemptColumns = database.prepare('PRAGMA table_info(exam_attempts)').all();
if (!attemptColumns.some((column) => column.name === 'breakdown_json')) {
    database.exec("ALTER TABLE exam_attempts ADD COLUMN breakdown_json TEXT NOT NULL DEFAULT '[]'");
}

const findUserByEmail = database.prepare('SELECT * FROM users WHERE email = ?');
const findSession = database.prepare(`
    SELECT sessions.expires_at, users.id, users.display_name, users.email, users.created_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
`);
const insertUser = database.prepare(`
    INSERT INTO users (display_name, email, password_salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
`);
const insertSession = database.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)
`);
const deleteSession = database.prepare('DELETE FROM sessions WHERE token_hash = ?');
const deleteExpiredSessions = database.prepare('DELETE FROM sessions WHERE expires_at <= ?');
const updateProfile = database.prepare('UPDATE users SET display_name = ?, email = ? WHERE id = ?');
const updatePassword = database.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?');
const deleteOtherSessions = database.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?');
const listAttempts = database.prepare(`
    SELECT id, set_id, set_title, score_percent, correct_count, scored_count,
           answered_count, question_count, breakdown_json, created_at
    FROM exam_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 100
`);
const insertAttempt = database.prepare(`
    INSERT INTO exam_attempts (
        user_id, set_id, set_title, score_percent, correct_count, scored_count,
        answered_count, question_count, breakdown_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const listAttemptAnswers = database.prepare(`
    SELECT question_number, category, prompt, selected_key, correct_key,
           selected_text, correct_text, explanation, question_image,
           selected_image, correct_image, is_correct
    FROM attempt_answers WHERE attempt_id = ? ORDER BY question_number
`);
const insertAttemptAnswer = database.prepare(`
    INSERT INTO attempt_answers (
        attempt_id, question_number, category, prompt, selected_key, correct_key,
        selected_text, correct_text, explanation, question_image, selected_image,
        correct_image, is_correct
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const deleteAttempt = database.prepare('DELETE FROM exam_attempts WHERE id = ? AND user_id = ?');
const clearAttempts = database.prepare('DELETE FROM exam_attempts WHERE user_id = ?');

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
    return {
        id: user.id,
        name: user.display_name,
        email: user.email,
        createdAt: user.created_at ? new Date(user.created_at).toISOString() : null,
    };
}

function cookieToken(request) {
    const cookieHeader = request.headers.cookie ?? '';
    const pair = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('ipass_session='));
    return pair ? decodeURIComponent(pair.slice('ipass_session='.length)) : '';
}

function sessionCookie(token, maxAge = sessionLifetimeSeconds) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `ipass_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function currentUser(request) {
    const token = cookieToken(request);
    if (!token) return null;

    const tokenHash = hashToken(token);
    const session = findSession.get(tokenHash);
    if (!session) return null;
    if (session.expires_at <= Date.now()) {
        deleteSession.run(tokenHash);
        return null;
    }

    return session;
}

function sendJson(response, status, payload, headers = {}) {
    response.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        ...headers,
    });
    response.end(JSON.stringify(payload));
}

function ensureSameOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return;

    try {
        const requestHost = request.headers.host ?? '';
        if (!isSameOriginHost(origin, requestHost)) {
            throw new HttpError(403, 'ไม่อนุญาตคำขอจาก origin นี้');
        }
    } catch {
        throw new HttpError(403, 'คำขอไม่ถูกต้อง');
    }
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let size = 0;
        let oversized = false;
        const chunks = [];

        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > maximumJsonBytes) {
                oversized = true;
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            if (oversized) return reject(new HttpError(413, 'ข้อมูลมีขนาดใหญ่เกินไป'));
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(new HttpError(400, 'รูปแบบข้อมูลไม่ถูกต้อง'));
            }
        });
        request.on('error', reject);
    });
}

function checkAttemptLimit(request) {
    const now = Date.now();
    const ip = request.socket.remoteAddress ?? 'unknown';
    const recent = (loginAttempts.get(ip) ?? []).filter((time) => now - time < 15 * 60 * 1000);
    if (recent.length >= 12) throw new HttpError(429, 'ลองใหม่อีกครั้งในภายหลัง');
    recent.push(now);
    loginAttempts.set(ip, recent);
}

function validateEmail(value) {
    const email = String(value ?? '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, 'กรุณากรอกอีเมลให้ถูกต้อง');
    }
    return email;
}

function validatePassword(value) {
    const password = String(value ?? '');
    if (password.length < 8) throw new HttpError(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    if (password.length > 128) throw new HttpError(400, 'รหัสผ่านยาวเกินไป');
    return password;
}

async function passwordMatches(user, password) {
    const candidate = await scrypt(password, user.password_salt, 64, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(candidate, Buffer.from(user.password_hash, 'hex'));
}

async function createSession(response, user) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + sessionLifetimeSeconds * 1000;
    insertSession.run(hashToken(token), user.id, expiresAt);
    sendJson(response, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(token) });
}

async function handleApi(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/session') {
        const user = currentUser(request);
        return sendJson(response, 200, { user: user ? publicUser(user) : null });
    }

    if (request.method === 'GET' && pathname === '/api/account') {
        const user = currentUser(request);
        if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
        const attempts = listAttempts.all(user.id).map(({ breakdown_json, ...attempt }) => ({
            ...attempt,
            breakdown: JSON.parse(breakdown_json || '[]'),
            answers: listAttemptAnswers.all(attempt.id).map((answer) => ({
                questionNumber: answer.question_number,
                category: answer.category,
                prompt: answer.prompt,
                selectedKey: answer.selected_key,
                correctKey: answer.correct_key,
                selectedText: answer.selected_text,
                correctText: answer.correct_text,
                explanation: answer.explanation,
                questionImage: answer.question_image,
                selectedImage: answer.selected_image,
                correctImage: answer.correct_image,
                isCorrect: answer.is_correct,
            })),
        }));
        return sendJson(response, 200, { user: publicUser(user), attempts });
    }

    if (request.method !== 'POST') throw new HttpError(405, 'ไม่รองรับ method นี้');
    ensureSameOrigin(request);
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        throw new HttpError(415, 'รองรับเฉพาะ JSON');
    }

    if (pathname === '/api/logout') {
        const token = cookieToken(request);
        if (token) deleteSession.run(hashToken(token));
        return sendJson(response, 200, { user: null }, { 'Set-Cookie': sessionCookie('', 0) });
    }

    if (pathname === '/api/account/history/clear') {
        const user = currentUser(request);
        if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
        clearAttempts.run(user.id);
        return sendJson(response, 200, { cleared: true });
    }

    if (pathname === '/api/account/delete') {
        const user = currentUser(request);
        if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
        const payload = await readJson(request);
        const currentPassword = validatePassword(payload.currentPassword);
        if (!await passwordMatches(findUserByEmail.get(user.email), currentPassword)) {
            throw new HttpError(401, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
        }
        database.prepare('DELETE FROM users WHERE id = ?').run(user.id);
        return sendJson(response, 200, { deleted: true }, { 'Set-Cookie': sessionCookie('', 0) });
    }

    const attemptDeleteMatch = pathname.match(/^\/api\/attempts\/(\d+)\/delete$/);
    if (attemptDeleteMatch) {
        const user = currentUser(request);
        if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
        const result = deleteAttempt.run(Number(attemptDeleteMatch[1]), user.id);
        if (!result.changes) throw new HttpError(404, 'ไม่พบประวัติการสอบนี้');
        return sendJson(response, 200, { deleted: true });
    }

    if (pathname === '/api/account/profile') {
        const user = currentUser(request);
        if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
        const payload = await readJson(request);
        const currentPassword = validatePassword(payload.currentPassword);
        if (!await passwordMatches(findUserByEmail.get(user.email), currentPassword)) {
            throw new HttpError(401, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
        }

        const name = String(payload.name ?? '').trim();
        const email = validateEmail(payload.email);
        if (!name || name.length > 60) throw new HttpError(400, 'กรุณากรอกชื่อไม่เกิน 60 ตัวอักษร');
        const existingUser = findUserByEmail.get(email);
        if (existingUser && existingUser.id !== user.id) throw new HttpError(409, 'อีเมลนี้มีบัญชีแล้ว');

        updateProfile.run(name, email, user.id);
        deleteOtherSessions.run(user.id, hashToken(cookieToken(request)));
        return sendJson(response, 200, { user: publicUser({ ...user, display_name: name, email }) });
    }

    if (pathname === '/api/account/password') {
        const user = currentUser(request);
        if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
        const payload = await readJson(request);
        const currentPassword = validatePassword(payload.currentPassword);
        const newPassword = validatePassword(payload.newPassword);
        const storedUser = findUserByEmail.get(user.email);
        if (!await passwordMatches(storedUser, currentPassword)) {
            throw new HttpError(401, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
        }

        const salt = randomBytes(16).toString('hex');
        const passwordHash = await scrypt(newPassword, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
        updatePassword.run(salt, passwordHash.toString('hex'), user.id);
        deleteOtherSessions.run(user.id, hashToken(cookieToken(request)));
        return sendJson(response, 200, { changed: true });
    }

    if (pathname === '/api/attempts') {
        const user = currentUser(request);
        if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
        const payload = await readJson(request);
        const setId = String(payload.setId ?? '').trim();
        const setTitle = String(payload.setTitle ?? '').trim();
        const correctCount = Number(payload.correctCount);
        const scoredCount = Number(payload.scoredCount);
        const answeredCount = Number(payload.answeredCount);
        const questionCount = Number(payload.questionCount);
        const breakdown = Array.isArray(payload.breakdown) ? payload.breakdown : [];
        const answerItems = Array.isArray(payload.items) ? payload.items : [];
        if (!setId || setId.length > 100 || !setTitle || setTitle.length > 240) {
            throw new HttpError(400, 'ข้อมูลชุดข้อสอบไม่ถูกต้อง');
        }
        if (![correctCount, scoredCount, answeredCount, questionCount].every(Number.isSafeInteger)
            || correctCount < 0 || scoredCount < 0 || correctCount > scoredCount
            || answeredCount < 0 || questionCount < 1 || answeredCount > questionCount) {
            throw new HttpError(400, 'ข้อมูลคะแนนไม่ถูกต้อง');
        }
        if (breakdown.length > 12) throw new HttpError(400, 'ข้อมูลวิเคราะห์รายวิชาไม่ถูกต้อง');
        const normalizedBreakdown = breakdown.map((item) => {
            const category = String(item.category ?? '').trim();
            const correct = Number(item.correct);
            const total = Number(item.total);
            const answered = Number(item.answered);
            if (!category || category.length > 80
                || ![correct, total, answered].every(Number.isSafeInteger)
                || total < 1 || correct < 0 || correct > answered || answered > total) {
                throw new HttpError(400, 'ข้อมูลวิเคราะห์รายวิชาไม่ถูกต้อง');
            }
            return { category, correct, total, answered };
        });
        if (answerItems.length && answerItems.length !== questionCount) {
            throw new HttpError(400, 'จำนวนรายละเอียดคำตอบไม่ตรงกับจำนวนข้อ');
        }
        if (answerItems.length > 100) throw new HttpError(400, 'มีจำนวนรายละเอียดคำตอบมากเกินไป');
        const normalizedAnswers = answerItems.map((item, index) => {
            const questionNumber = Number(item.questionNumber);
            const category = String(item.category ?? '').trim();
            const prompt = String(item.prompt ?? '');
            const selectedKey = String(item.selectedKey ?? '').trim();
            const correctKey = String(item.correctKey ?? '').trim();
            const selectedText = String(item.selectedText ?? '');
            const correctText = String(item.correctText ?? '');
            const explanation = String(item.explanation ?? '');
            const validateImage = (value) => {
                const image = String(value ?? '').trim();
                if (!image) return '';
                if (image.length > 300 || !/^img\/[\w./-]+\.(?:png|jpe?g|gif|webp)$/i.test(image)
                    || image.split('/').includes('..')) {
                    throw new HttpError(400, 'path ภาพในรายละเอียดคำตอบไม่ถูกต้อง');
                }
                return image;
            };
            if (!Number.isSafeInteger(questionNumber) || questionNumber !== index + 1
                || !prompt || prompt.length > 12000
                || category.length > 80 || selectedKey.length > 24 || correctKey.length > 24
                || selectedText.length > 3000 || correctText.length > 3000 || explanation.length > 12000) {
                throw new HttpError(400, 'รายละเอียดคำตอบไม่ถูกต้อง');
            }
            return {
                questionNumber,
                category,
                prompt,
                selectedKey,
                correctKey,
                selectedText,
                correctText,
                explanation,
                questionImage: validateImage(item.questionImage),
                selectedImage: validateImage(item.selectedImage),
                correctImage: validateImage(item.correctImage),
                isCorrect: correctKey ? Number(Boolean(selectedKey) && selectedKey === correctKey) : null,
            };
        });
        const scorePercent = scoredCount ? Math.round((correctCount / scoredCount) * 100) : 0;
        database.exec('BEGIN');
        let result;
        try {
            result = insertAttempt.run(
                user.id, setId, setTitle, scorePercent, correctCount, scoredCount,
                answeredCount, questionCount, JSON.stringify(normalizedBreakdown), Date.now(),
            );
            for (const answer of normalizedAnswers) {
                insertAttemptAnswer.run(
                    result.lastInsertRowid, answer.questionNumber, answer.category, answer.prompt,
                    answer.selectedKey, answer.correctKey, answer.selectedText, answer.correctText,
                    answer.explanation, answer.questionImage, answer.selectedImage,
                    answer.correctImage, answer.isCorrect,
                );
            }
            database.exec('COMMIT');
        } catch (error) {
            database.exec('ROLLBACK');
            throw error;
        }
        return sendJson(response, 201, { attemptId: Number(result.lastInsertRowid) });
    }

    if (pathname !== '/api/register' && pathname !== '/api/login') {
        throw new HttpError(404, 'ไม่พบ endpoint');
    }

    const clientIp = request.socket.remoteAddress ?? 'unknown';
    checkAttemptLimit(request);
    const payload = await readJson(request);
    const email = validateEmail(payload.email);
    const password = validatePassword(payload.password);

    if (pathname === '/api/register') {
        const name = String(payload.name ?? '').trim();
        if (!name || name.length > 60) throw new HttpError(400, 'กรุณากรอกชื่อไม่เกิน 60 ตัวอักษร');
        if (findUserByEmail.get(email)) throw new HttpError(409, 'อีเมลนี้มีบัญชีแล้ว');

        const salt = randomBytes(16).toString('hex');
        const passwordHash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
        let result;
        try {
            result = insertUser.run(name, email, salt, passwordHash.toString('hex'), Date.now());
        } catch (error) {
            if (String(error.message).includes('UNIQUE constraint failed')) throw new HttpError(409, 'อีเมลนี้มีบัญชีแล้ว');
            throw error;
        }
        return createSession(response, { id: Number(result.lastInsertRowid), display_name: name, email });
    }

    const user = findUserByEmail.get(email);
    const salt = user?.password_salt ?? randomBytes(16).toString('hex');
    const candidate = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    if (!user || !timingSafeEqual(candidate, Buffer.from(user.password_hash, 'hex'))) {
        throw new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    return createSession(response, user);
}

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
};

function staticFilePath(pathname) {
    const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const segments = relativePath.split(/[\\/]/);
    if (segments.some((segment) => segment.startsWith('.') || segment === 'node_modules')) return null;
    if (['server.js', 'package.json'].includes(relativePath)) return null;

    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) return null;
    return filePath;
}

async function serveStatic(request, response, pathname) {
    let filePath;
    try {
        filePath = staticFilePath(pathname);
    } catch {
        throw new HttpError(400, 'path ไม่ถูกต้อง');
    }
    if (!filePath) throw new HttpError(404, 'ไม่พบไฟล์');

    let stats;
    try {
        stats = statSync(filePath);
        if (stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
            stats = statSync(filePath);
        }
    } catch {
        throw new HttpError(404, 'ไม่พบไฟล์');
    }
    if (!stats.isFile()) throw new HttpError(404, 'ไม่พบไฟล์');

    const contentType = mimeTypes[path.extname(filePath).toLowerCase()];
    if (!contentType) throw new HttpError(404, 'ไม่รองรับชนิดไฟล์นี้');
    response.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Length': stats.size,
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
    });
    if (request.method === 'HEAD') return response.end();
    response.end(readFileSync(filePath));
}

async function handleRequest(request, response) {
    let pathname;
    try {
        pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
        if (pathname.startsWith('/api/')) return await handleApi(request, response, pathname);
        if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'ไม่รองรับ method นี้');
        return await serveStatic(request, response, pathname);
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = error instanceof HttpError ? error.message : 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์';
        if (status >= 500) console.error(error);
        if (!response.headersSent) sendJson(response, status, { error: message });
        else response.destroy();
    }
}

deleteExpiredSessions.run(Date.now());
const server = createServer((request, response) => void handleRequest(request, response));
server.listen(port, '127.0.0.1', () => {
    console.log(`IPASS listening at http://localhost:${port}`);
});
