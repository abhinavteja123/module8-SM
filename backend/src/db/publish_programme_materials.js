import 'dotenv/config';
import { supabase, unwrap } from './client.js';
import { publishSuppliedProgrammeMaterials } from '../lib/programmeMaterials.js';

const admin = unwrap(await supabase.from('users').select('id').eq('email', 'crcs.admin@example.edu').maybeSingle());
if (!admin) throw new Error('CRCS admin account was not found. Run npm run bootstrap:admin first.');

for (const result of await publishSuppliedProgrammeMaterials(admin.id)) {
  console.log(`${result.status === 'published' ? 'Published' : 'Already published'}: ${result.title}`);
}
