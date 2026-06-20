# Mind Coach loop — local CLI paths (optional; scripts auto-detect defaults)
export CLAUDE_BIN="/opt/homebrew/bin/claude"
export AGY_BIN="$HOME/.local/bin/agy"
export PATH="$HOME/.local/bin:$PATH"

# Cursor implement stage (set CURSOR_API_KEY to prefer Cursor SDK)
# Default implementer: Claude terminal (`claude -p`, must be logged in via `claude auth status`)
# export MIND_COACH_IMPLEMENTER=claude

# Browser QA test user (optional; defaults to test@example.com)
# export MIND_COACH_TEST_EMAIL="test@example.com"
# export MIND_COACH_TEST_PASSWORD="password"
