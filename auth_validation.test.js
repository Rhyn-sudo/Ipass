import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateAuthPayload,
    validateProfileUpdatePayload,
    validatePasswordChange,
} from './auth_validation.js';

test('validateAuthPayload rejects invalid registration inputs with specific messages', () => {
    assert.equal(validateAuthPayload({ email: 'bad-email', password: 'short' }, true), 'กรุณากรอกอีเมลให้ถูกต้อง');
    assert.equal(validateAuthPayload({ email: 'user@example.com', password: 'short' }, false), 'รหัสผ่านต้องมีความยาว 8–128 ตัวอักษร');
    assert.equal(validateAuthPayload({ email: 'user@example.com', password: 'validpass1', name: '' }, true), 'กรุณากรอกชื่อที่แสดงให้ถูกต้อง');
    assert.equal(validateAuthPayload({ email: 'user@example.com', password: 'validpass1' }, false), '');
});

test('validateProfileUpdatePayload and validatePasswordChange enforce account rules', () => {
    assert.equal(validateProfileUpdatePayload({ name: 'A', email: 'user@example.com', currentPassword: 'validpass1' }), '');
    assert.equal(validateProfileUpdatePayload({ name: '', email: 'user@example.com', currentPassword: 'validpass1' }), 'กรุณากรอกชื่อที่แสดงให้ถูกต้อง');
    assert.equal(validatePasswordChange('validpass1', 'validpass1'), 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน');
    assert.equal(validatePasswordChange('validpass1', 'short'), 'รหัสผ่านใหม่ต้องมีความยาว 8–128 ตัวอักษร');
});
