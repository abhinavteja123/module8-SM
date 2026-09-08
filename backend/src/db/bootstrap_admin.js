import 'dotenv/config';
import { supabase, unwrap } from './client.js';
import { createPortalUser } from '../lib/users.js';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const fullName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();

if (!email || !password || !fullName) {
  throw new Error('Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, and BOOTSTRAP_ADMIN_NAME before running this command.');
}
if (password.length < 8) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.');

const existingSuperadmin = unwrap(await supabase.from('user_roles').select('user_id').eq('role', 'crcs_superadmin').limit(1));
if (existingSuperadmin.length) throw new Error('A CRCS Superadmin already exists; use User Management instead.');
const existingUser = unwrap(await supabase.from('users').select('id').eq('email', email).maybeSingle());
if (existingUser) throw new Error('A user with this email already exists.');

const user = await createPortalUser({ email, password, full_name: fullName, roles: [{ role: 'crcs_superadmin' }] });
console.log(`[bootstrap] CRCS Superadmin created: ${user.email}`);
