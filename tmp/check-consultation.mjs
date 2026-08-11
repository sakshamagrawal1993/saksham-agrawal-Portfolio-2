import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  // Try anonymous auth first to get a token, or sign in anonymously
  const { data: authData } = await supabase.auth.signInAnonymously()
  console.log('Anon auth user:', authData?.user?.id)

  const fullId = 'c92359a8-8f5d-47f0-a4a0-9d9189ed0a6' // wait, check full UUID length: c92359a8-8f5d-47f0-a4a0-9d9189ed0a6 has 34 chars instead of 36 (missing 2 chars at end?)
  // Let's check full length UUID format: 8-4-4-4-12 -> 36 chars.
  // 'c92359a8-8f5d-47f0-a4a0-9d9189ed0a6' has '9d9189ed0a6' (11 chars).
  console.log('Provided consultation ID length:', fullId.length)

  // Query consultation with edge function get_consultation or table query
  const res = await supabase.functions.invoke('libertymd-care-proxy', {
    body: { action: 'get_consultation', consultation_id: 'c92359a8-8f5d-47f0-a4a0-9d9189ed0a6' }
  })
  console.log('Edge function get_consultation result:', JSON.stringify(res, null, 2))
}

main().catch(console.error)
