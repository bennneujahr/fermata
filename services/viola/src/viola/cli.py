"""Befehle des Dienstes.

viola text-server            Textmodus (HTTP) starten
viola voice-worker start     LiveKit-Worker starten (weitere Befehle von LiveKit: dev, console, …)
viola dev-token SESSION_ID   Zugang zum Textmodus für lokale Tests ausstellen
viola demo                   Gespräch im Terminal, ganz ohne Netz (Attrappen)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
import uuid

import jwt

from viola.config import Config


def _text_server(cfg: Config) -> None:
    import uvicorn

    from viola.text_api import build_app_from_env

    uvicorn.run(
        build_app_from_env(cfg), host=cfg.text_host, port=cfg.text_port, log_level=cfg.log_level.lower(), proxy_headers=True
    )


def _voice_worker(cfg: Config, argv: list[str]) -> None:
    from livekit.agents import cli as lk_cli

    from viola.voice.worker import build_server

    sys.argv = ["viola voice-worker", *argv]
    lk_cli.run_app(build_server(cfg))


def dev_token(cfg: Config, session_id: str, minutes: int = 60) -> str:
    if len(cfg.text_token_secret) < 32:
        raise SystemExit("VIOLA_TEXT_TOKEN_SECRET fehlt oder ist kürzer als 32 Zeichen")
    now = int(time.time())
    claims = {"iss": "fermata", "aud": "viola-text", "sub": "dev", "sid": session_id, "iat": now, "exp": now + minutes * 60}
    return jwt.encode(claims, cfg.text_token_secret, algorithm="HS256")


async def _demo(form: str) -> None:
    """Ein Gespräch im Terminal mit Attrappen – zum Ausprobieren von Ablauf, Hinweisen und Sicherheitsregeln."""
    from viola.backend import MemoryBackend
    from viola.context import SessionContext
    from viola.domain import AddressForm, Mode
    from viola.engine import Conversation
    from viola.llm.fake import FakeChatModel

    backend = MemoryBackend()
    sid = backend.create_session(mode=Mode.TEXT, address_form=AddressForm(form), session_id=str(uuid.uuid4()))
    ctx = SessionContext.from_json(await backend.context(sid))
    conv = Conversation(ctx, FakeChatModel(), backend)
    print(f"Viola: {await conv.open()}")
    await conv.greeting_delivered()
    loop = asyncio.get_running_loop()
    while not conv.ended:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            await conv.end_by_person()
            break
        reply = " ".join([s async for s in conv.respond(line.strip())])
        print(f"Viola: {reply}")
        for ev in conv.take_events():
            print(f"  [Ereignis] {ev.type} {ev.data}")
    await conv.finish(analyze=False)
    print(f"Ende: {conv.end_reason.value if conv.end_reason else '-'}; gespeicherte Beiträge: {len(backend.sessions[sid].turns)}")


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    parser = argparse.ArgumentParser(prog="viola", description="Viola – Gesprächs-Agent von Fermata")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("text-server", help="Textmodus (HTTP) starten")
    sub.add_parser("voice-worker", help="LiveKit-Worker starten", add_help=False)
    tok = sub.add_parser("dev-token", help="Zugang zum Textmodus für lokale Tests")
    tok.add_argument("session_id")
    tok.add_argument("--minutes", type=int, default=60)
    demo = sub.add_parser("demo", help="Gespräch im Terminal mit Attrappen")
    demo.add_argument("--du", action="store_true", help="Du statt Sie")

    if args and args[0] == "voice-worker":
        cfg = Config.from_env()
        logging.basicConfig(level=cfg.log_level)
        _voice_worker(cfg, args[1:])
        return 0
    ns = parser.parse_args(args)
    if ns.command == "demo":
        asyncio.run(_demo("du" if ns.du else "sie"))
        return 0
    cfg = Config.from_env()
    logging.basicConfig(level=cfg.log_level)
    if ns.command == "text-server":
        _text_server(cfg)
    elif ns.command == "dev-token":
        print(dev_token(cfg, ns.session_id, ns.minutes))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
