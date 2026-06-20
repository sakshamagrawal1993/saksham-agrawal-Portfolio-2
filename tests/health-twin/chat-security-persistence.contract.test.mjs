import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const edgeFunctionPath = resolve(
  repoRoot,
  'supabase/functions/chat-completion/index.ts',
);
const workflowPath = resolve(
  repoRoot,
  '..',
  'n8n-workflows/definitions/health-twin-chat__QmbwB8UJcN8PNbrd.json',
);

const edgeSource = readFileSync(edgeFunctionPath, 'utf8');
const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));

function sourcePosition(fragment) {
  const position = edgeSource.indexOf(fragment);
  assert.notEqual(position, -1, `Expected Edge Function source to contain: ${fragment}`);
  return position;
}

describe('Health Twin chat direct webhook authentication', () => {
  test('n8n rejects unauthenticated direct webhook calls through headerAuth', () => {
    const webhook = workflow.nodes.find(
      (node) => node.type === 'n8n-nodes-base.webhook' && node.name === 'Webhook',
    );

    assert.ok(webhook, 'Health Twin chat Webhook node must exist');
    assert.equal(webhook.parameters.httpMethod, 'POST');
    assert.equal(webhook.parameters.authentication, 'headerAuth');
    assert.ok(
      webhook.credentials?.httpHeaderAuth?.id,
      'Webhook must bind an n8n HTTP Header Auth credential',
    );
  });

  test('Edge Function sends the configured secret using x-n8n-secret', () => {
    assert.match(edgeSource, /'x-n8n-secret':\s*n8nSecret/);
    assert.match(edgeSource, /N8N_HEALTH_TWIN_CHAT_WEBHOOK_SECRET/);
    assert.match(edgeSource, /if\s*\(!n8nWebhookUrl\s*\|\|\s*!n8nSecret\)/);
  });
});

describe('Health Twin chat authorization and authoritative context', () => {
  test('ownership and session isolation checks run before the n8n request', () => {
    const twinCheck = sourcePosition('verifyTwinOwner(supabaseAdmin, twin_id, user.id)');
    const sessionCheck = sourcePosition('verifySessionOwner(supabaseAdmin, session_id, twin_id)');
    const webhookCall = sourcePosition('n8nResponse = await fetch(n8nWebhookUrl');

    assert.ok(twinCheck < sessionCheck);
    assert.ok(sessionCheck < webhookCall);
  });

  test('profile context is loaded server-side and forwarded instead of trusting request context', () => {
    assert.match(
      edgeSource,
      /\.from\('health_personal_details'\)[\s\S]*?\.eq\('twin_id', twin_id\)[\s\S]*?\.maybeSingle\(\)/,
    );
    assert.match(edgeSource, /personal_details_snapshot:\s*personalDetails\s*\|\|\s*null/);

    const payloadDestructure = edgeSource.match(
      /const\s*\{\s*twin_id,\s*session_id,\s*message_text,\s*\}\s*=\s*payload;/,
    );
    assert.ok(payloadDestructure, 'Request payload must not accept personal_details_snapshot');
  });
});

describe('Health Twin assistant message persistence', () => {
  test('assistant insert is awaited before the successful response', () => {
    const assistantInsert = sourcePosition(
      "const { error: assistantMsgErr } = await supabaseAdmin.from('health_chat_messages').insert",
    );
    const successResponse = sourcePosition('JSON.stringify(cleanResponse)');

    assert.ok(assistantInsert < successResponse);
  });

  test('assistant persistence failure returns a non-200 response', () => {
    assert.match(
      edgeSource,
      /if \(assistantMsgErr\) \{[\s\S]*?Failed to persist assistant message[\s\S]*?status: 500[\s\S]*?\}/,
    );
  });

  test('empty or invalid agent replies are rejected instead of returning 200', () => {
    assert.match(
      edgeSource,
      /typeof assistantReply !== 'string' \|\| !assistantReply\.trim\(\)[\s\S]*?status: 502/,
    );
  });
});
