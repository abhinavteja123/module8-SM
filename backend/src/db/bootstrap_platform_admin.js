import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { supabase, unwrap } from './client.js';

const email = process.env.BOOTSTRAP_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_PLATFORM_ADMIN_PASSWORD;
const fullName = process.env.BOOTSTRAP_PLATFORM_ADMIN_NAME?.trim();

if (!email || !password || !fullName) {
  throw new Error('Set BOOTSTRAP_PLATFORM_ADMIN_EMAIL, BOOTSTRAP_PLATFORM_ADMIN_PASSWORD, and BOOTSTRAP_PLATFORM_ADMIN_NAME before running this command.');
}
if (password.length < 8) throw new Error('BOOTSTRAP_PLATFORM_ADMIN_PASSWORD must be at least 8 characters.');

const existing = unwrap(await supabase.from('users').select('id').eq('is_platform_admin', true).limit(1));
if (existing.length) throw new Error('A Vextra platform admin already exists.');
const existingUser = unwrap(await supabase.from('users').select('id').eq('email', email).maybeSingle());
if (existingUser) throw new Error('A user with this email already exists.');

const password_hash = await bcrypt.hash(password, 10);
const [admin] = unwrap(await supabase.from('users').insert({
  email, password_hash, full_name: fullName, is_platform_admin: true, university_id: null,
}).select());
console.log(`[bootstrap] Vextra platform admin created: ${admin.email}`);
