const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const db = new DatabaseSync('./data/sentinel.db');

const newPassword = '08069694341Aa,';
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(newPassword, salt, 310000, 32, 'sha256').toString('hex');
const password_hash = `${hash}:${salt}`;

db.prepare("UPDATE users SET password_hash = ? WHERE email = 'admin@sentinel.local'").run(password_hash);
console.log('✅ Password updated successfully');
db.close();