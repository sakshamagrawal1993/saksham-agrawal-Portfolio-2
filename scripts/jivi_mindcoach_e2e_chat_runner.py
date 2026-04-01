#!/usr/bin/env python3
"""
Long-run Mind Coach chat helper for E2E / load testing (workplace anxiety or generic themes).

Prerequisites:
  - .env in repo root with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
  - test user has completed Mind Coach onboarding (mind_coach_profiles row exists)

Usage:
  python3 scripts/jivi_mindcoach_e2e_chat_runner.py --turns 30 --theme workplace_anxiety

This mirrors the client: inserts user/assistant rows, updates message_count, invokes mind-coach-chat.
It does NOT accept pathways or call session-end; do those in the app or extend this script.
"""

from __future__ import annotations

import argparse
import json
import random
import ssl
import sys
import time
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    p = Path(__file__).resolve().parent.parent / ".env"
    if not p.exists():
        return env
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k in ("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"):
            env[k] = v
    return env


def req(
    base: str,
    key: str,
    method: str,
    path: str,
    body: object | None = None,
    token: str | None = None,
    timeout: int = 120,
) -> tuple[int, object]:
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    ctx = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(r, context=ctx, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw
        return e.code, parsed


WORKPLACE_LINES = [
    "My whole department was shut down last month and I still feel numb and angry.",
    "I keep replaying the meeting where they said the unit was no longer needed.",
    "I'm not sleeping well — I wake up thinking about job applications and money.",
    "I used to like my team; now I feel like I lost my identity, not just a paycheck.",
    "My manager said it wasn't personal but it feels deeply personal.",
    "I'm anxious before video interviews and my mind goes blank.",
    "I avoid talking to friends because I'm embarrassed about being laid off.",
    "I have tension headaches most afternoons since the closure.",
    "Sometimes I catastrophize that I'll never find something as stable again.",
    "HR offered a small package but I still feel cheated.",
    "I ruminate about coworkers who kept their jobs while our team was cut.",
    "I've been snapping at my partner; I hate that I'm taking this out on them.",
    "Coffee makes the anxiety worse but I drink it to push through applications.",
    "I feel guilty for enjoying a day off because I 'should' be grinding.",
    "The uncertainty about rent next quarter is crushing.",
    "I used to run for stress relief; I've barely exercised since the news.",
    "I compare myself to people on LinkedIn and feel behind.",
    "Nighttime is the worst — that's when the what-ifs get loud.",
    "I want tools to calm my body when panic hits before interviews.",
    "I'm scared if I'm honest about anxiety, employers will see me as weak.",
    "My concentration is shot; even watching a show I scroll job boards.",
    "I feel shame that I'm not 'resilient' enough to bounce back faster.",
    "Small decisions feel huge — like every application is a referendum on my worth.",
    "I'd like a simple grounding practice I can do in the bathroom at interviews.",
    "Sometimes I feel hopeful for an hour then crash again.",
    "I'm holding grief for the team and the projects we didn't get to finish.",
    "I want to reframe this as a transition, not a verdict on my abilities.",
    "Can we talk about boundaries with my family asking constantly if I got a job?",
    "I notice tightness in my chest when I open my email.",
    "I've done 30 turns sharing this — I'm hoping a pathway can help structure next steps.",
]


def generic_lines(n: int) -> list[str]:
    return [f"Continuing our session — turn {i + 1}. I'd like to keep working on my goals." for i in range(n)]


def normalize_n8n_chat_payload(raw: object) -> dict:
    """Mirror TherapistChat.normalizeN8nChatPayload (merge top-level + output)."""
    base = raw[0] if isinstance(raw, list) and raw else raw
    if not isinstance(base, dict):
        return {}
    merged = dict(base)
    inner: dict | None = None
    out = base.get("output")
    if isinstance(out, str):
        try:
            parsed = json.loads(out)
            if isinstance(parsed, dict):
                inner = parsed
        except json.JSONDecodeError:
            inner = None
    elif isinstance(out, dict):
        inner = out
    if inner:
        for key in (
            "suggested_pathway",
            "pathway",
            "pathway_confidence",
            "dynamic_theme",
            "session_state",
            "reply",
            "guardrail_status",
            "crisis_detected",
            "is_session_close",
            "dynamic_content",
            "dynamic_in_chat_exercise",
            "crisis_type",
            "quality_meta",
        ):
            if merged.get(key) is None and inner.get(key) is not None:
                merged[key] = inner[key]
    return merged


def apply_n8n_session_fields(data: dict, patch: dict) -> None:
    if data.get("session_state"):
        patch["session_state"] = data["session_state"]
    if data.get("dynamic_theme"):
        patch["dynamic_theme"] = data["dynamic_theme"]
    if data.get("pathway"):
        patch["pathway"] = data["pathway"]
    elif data.get("suggested_pathway"):
        patch["pathway"] = data["suggested_pathway"]
    if isinstance(data.get("pathway_confidence"), (int, float)):
        patch["pathway_confidence"] = data["pathway_confidence"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--turns", type=int, default=30)
    ap.add_argument("--theme", choices=("workplace_anxiety", "generic"), default="workplace_anxiety")
    ap.add_argument("--email", default="test@example.com")
    ap.add_argument("--password", default="password")
    args = ap.parse_args()

    env = load_env()
    base = env.get("VITE_SUPABASE_URL")
    key = env.get("VITE_SUPABASE_ANON_KEY")
    if not base or not key:
        print("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env", file=sys.stderr)
        return 1

    st, tok = req(
        base,
        key,
        "POST",
        "/auth/v1/token?grant_type=password",
        {"email": args.email, "password": args.password},
    )
    if st != 200:
        print("Auth failed:", st, tok, file=sys.stderr)
        return 1
    token = tok["access_token"]

    st, profs = req(base, key, "GET", "/rest/v1/mind_coach_profiles?select=*&order=created_at.desc&limit=1", token=token)
    if st != 200 or not profs:
        print("No mind_coach_profiles row. Complete onboarding in the app first.", file=sys.stderr)
        return 2
    profile = profs[0]
    pid = profile["id"]

    st, journeys = req(
        base,
        key,
        "GET",
        f"/rest/v1/mind_coach_journeys?select=*&profile_id=eq.{pid}&order=created_at.desc&limit=1",
        token=token,
    )
    journey = journeys[0] if st == 200 and journeys else None

    st, start_payload = req(
        base,
        key,
        "POST",
        "/functions/v1/mind-coach-session-start",
        {"profile_id": pid},
        token=token,
        timeout=60,
    )
    if st not in (200, 409):
        print("session-start failed:", st, start_payload, file=sys.stderr)
        return 1
    if st == 409:
        print("session-start blocked (e.g. journey completed):", start_payload, file=sys.stderr)
        return 1
    session = start_payload.get("session") if isinstance(start_payload, dict) else None
    if not session:
        print("No session from session-start:", start_payload, file=sys.stderr)
        return 1
    sid = session["id"]

    lines = WORKPLACE_LINES if args.theme == "workplace_anxiety" else generic_lines(args.turns)
    lines = lines[: args.turns]
    while len(lines) < args.turns:
        lines.append(random.choice(WORKPLACE_LINES))

    pathway = session.get("pathway") or "engagement_rapport_and_assessment"
    phase_num = journey.get("current_phase", 1) if journey else 1
    phase_idx = journey.get("current_phase_index", max(0, phase_num - 1)) if journey else 0

    for turn in range(args.turns):
        text = lines[turn % len(lines)]

        st, msgs = req(
            base,
            key,
            "GET",
            f"/rest/v1/mind_coach_messages?select=id,role,content,created_at,guardrail_status,dynamic_content&session_id=eq.{sid}&order=created_at.asc",
            token=token,
        )
        history = msgs if st == 200 else []

        uid = str(uuid.uuid4())
        st, ins = req(
            base,
            key,
            "POST",
            "/rest/v1/mind_coach_messages",
            {"id": uid, "session_id": sid, "role": "user", "content": text},
            token=token,
        )
        if st not in (200, 201):
            print("insert user msg failed:", st, ins, file=sys.stderr)
            return 1

        mc = (session.get("message_count") or 0) + 1
        st, _ = req(
            base,
            key,
            "PATCH",
            f"/rest/v1/mind_coach_sessions?id=eq.{sid}",
            {"message_count": mc},
            token=token,
        )
        if st not in (200, 204):
            print("patch session count failed:", st, file=sys.stderr)
            return 1
        session["message_count"] = mc

        st, persona = req(
            base,
            key,
            "GET",
            f"/rest/v1/mind_coach_personas?select=base_prompt&id=eq.{profile.get('therapist_persona') or 'maya'}",
            token=token,
        )
        coach_prompt = persona[0]["base_prompt"] if persona else "You are an empathetic coach."

        phase_key = f"{pathway}_phase{phase_num}"
        st, phase_rows = req(
            base,
            key,
            "GET",
            f"/rest/v1/mind_coach_pathway_phases?select=dynamic_prompt&id=eq.{phase_key}",
            token=token,
        )
        phase_prompt = phase_rows[0]["dynamic_prompt"] if phase_rows else "Focus on rapport."

        history.append(
            {
                "id": uid,
                "session_id": sid,
                "role": "user",
                "content": text,
                "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
        )

        payload = {
            "profile_id": pid,
            "session_id": sid,
            "message_text": text,
            "profile": {
                "name": profile.get("name"),
                "age": profile.get("age"),
                "gender": profile.get("gender"),
                "concerns": profile.get("concerns"),
                "therapist_persona": profile.get("therapist_persona"),
            },
            "journey_context": (
                {
                    "id": journey["id"],
                    "title": journey.get("title"),
                    "current_phase": journey.get("current_phase"),
                    "current_phase_index": phase_idx,
                    "phases": journey.get("phases"),
                    "sessions_completed": journey.get("sessions_completed"),
                }
                if journey
                else None
            ),
            "session_state": session.get("session_state"),
            "dynamic_theme": session.get("dynamic_theme"),
            "pathway": pathway,
            "session_number": (journey.get("sessions_completed") or 0) + 1 if journey else 1,
            "messages": history,
            "memories": [],
            "recent_tasks_assigned": [],
            "recent_case_notes": [],
            "coach_prompt": coach_prompt,
            "phase_prompt": phase_prompt,
            "message_count": mc,
            "client_managed_persistence": True,
        }

        for attempt in range(4):
            st, chat_out = req(
                base,
                key,
                "POST",
                "/functions/v1/mind-coach-chat",
                payload,
                token=token,
                timeout=180,
            )
            if st in (502, 503, 504) or (isinstance(chat_out, dict) and chat_out.get("code") in ("502", "503", "504")):
                time.sleep(2**attempt)
                continue
            break

        if st != 200:
            print(f"turn {turn + 1} chat failed:", st, str(chat_out)[:500], file=sys.stderr)
            return 1

        data = normalize_n8n_chat_payload(chat_out)
        reply = data.get("reply")
        dynamic = data.get("dynamic_content")

        if not reply or not str(reply).strip():
            print(f"turn {turn + 1} no reply:", str(data)[:400], file=sys.stderr)
            return 1

        aid = str(uuid.uuid4())
        st, _ = req(
            base,
            key,
            "POST",
            "/rest/v1/mind_coach_messages",
            {
                "id": aid,
                "session_id": sid,
                "role": "assistant",
                "content": str(reply)[:8000],
                "guardrail_status": "passed",
                "dynamic_content": dynamic,
            },
            token=token,
        )
        if st not in (200, 201):
            print("insert assistant failed:", st, file=sys.stderr)
            return 1

        mc2 = mc + 1
        session_updates: dict = {"message_count": mc2}
        apply_n8n_session_fields(data, session_updates)
        st, _ = req(base, key, "PATCH", f"/rest/v1/mind_coach_sessions?id=eq.{sid}", session_updates, token=token)
        session["message_count"] = mc2
        if session_updates.get("pathway"):
            pathway = session_updates["pathway"]
        if session_updates.get("session_state"):
            session["session_state"] = session_updates["session_state"]
        if session_updates.get("dynamic_theme"):
            session["dynamic_theme"] = session_updates["dynamic_theme"]

        prog = None
        if isinstance(dynamic, dict):
            prog = dynamic.get("current_objective_progress")
        print(f"turn {turn + 1}/{args.turns} ok | objective_progress={prog!r} | reply_len={len(str(reply))}")

    print(f"Done. session_id={sid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
