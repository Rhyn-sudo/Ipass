export function validateEmailField(email) {
    const normalized = String(email ?? '').trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return 'กรุณากรอกอีเมลให้ถูกต้อง';
    }
    return '';
}

export function validateAuthPayload(payload, registering) {
    const email = String(payload?.email ?? '').trim().toLowerCase();
    const password = String(payload?.password ?? '');
    const name = String(payload?.name ?? '').trim();

    const emailError = validateEmailField(email);
    if (emailError) return emailError;
    if (password.length < 8 || password.length > 128) {
        return 'รหัสผ่านต้องมีความยาว 8–128 ตัวอักษร';
    }
    if (registering && (!name || name.length > 60)) {
        return 'กรุณากรอกชื่อที่แสดงให้ถูกต้อง';
    }
    return '';
}

export function validateProfileUpdatePayload(payload) {
    const name = String(payload?.name ?? '').trim();
    const email = String(payload?.email ?? '').trim().toLowerCase();
    const currentPassword = String(payload?.currentPassword ?? '');

    if (!name || name.length > 60) {
        return 'กรุณากรอกชื่อที่แสดงให้ถูกต้อง';
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return 'กรุณากรอกอีเมลให้ถูกต้อง';
    }
    if (currentPassword.length < 8 || currentPassword.length > 128) {
        return 'รหัสผ่านปัจจุบันต้องมีความยาว 8–128 ตัวอักษร';
    }
    return '';
}

export function validatePasswordChange(currentPassword, newPassword) {
    const current = String(currentPassword ?? '');
    const next = String(newPassword ?? '');

    if (current === next) {
        return 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน';
    }
    if (next.length < 8 || next.length > 128) {
        return 'รหัสผ่านใหม่ต้องมีความยาว 8–128 ตัวอักษร';
    }
    return '';
}
