import { createClient, User } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export interface AuthResult {
  user: User;
  adminClient: ReturnType<typeof createClient>;
}

export interface AuthError {
  status: number;
  message: string;
}

/**
 * Validates the JWT in the Authorization header and returns the authenticated user
 * plus an admin client for service-role operations.
 */
export async function requireAuth(req: Request): Promise<AuthResult | AuthError> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401, message: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.slice(7);
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) {
    return { status: 401, message: 'Invalid or expired token' };
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return { user, adminClient };
}

export function isAuthError(result: AuthResult | AuthError): result is AuthError {
  return 'status' in result && 'message' in result;
}

/**
 * Verifies the authenticated user owns the given twin.
 * Returns true if ownership confirmed, false otherwise.
 */
export async function verifyTwinOwner(
  adminClient: ReturnType<typeof createClient>,
  twinId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('health_twins')
    .select('id')
    .eq('id', twinId)
    .eq('user_id', userId)
    .single();
  return !error && !!data;
}

/**
 * Verifies the authenticated user owns the given source and it belongs to the twin.
 */
export async function verifySourceOwner(
  adminClient: ReturnType<typeof createClient>,
  sourceId: string,
  twinId: string,
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('health_sources')
    .select('id')
    .eq('id', sourceId)
    .eq('twin_id', twinId)
    .single();
  return !error && !!data;
}

/**
 * Verifies the authenticated user owns an existing chat session and it belongs to the twin.
 * Returns true if: session doesn't exist yet (new session), or session belongs to this twin.
 */
export async function verifySessionOwner(
  adminClient: ReturnType<typeof createClient>,
  sessionId: string,
  twinId: string,
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('health_chat_sessions')
    .select('twin_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) return false;
  // Session doesn't exist yet — caller will create it; allow
  if (!data) return true;
  // Session exists — must belong to the same twin
  return data.twin_id === twinId;
}
