from __future__ import annotations

import sys


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in {"-h", "--help"}:
        print(
            "Usage:\n"
            "  python -m tis_agent ingest\n"
            "  python -m tis_agent sync file --title TITLE --mime-type TYPE PATH\n"
            "  python -m tis_agent sync state\n"
            "  python -m tis_agent ask \"When should I report an absence?\"\n"
            "  python -m tis_agent chat\n"
            "  python -m tis_agent whatsapp"
        )
        raise SystemExit(0)

    command = sys.argv[1]
    if command == "ingest":
        from tis_agent.ingest import main as ingest_main

        ingest_main()
        return
    if command == "sync":
        from tis_agent.sync import main as sync_main

        sync_main(sys.argv[2:])
        return
    if command == "ask":
        from tis_agent.ask import main as ask_main

        ask_main(sys.argv[2:])
        return
    if command == "chat":
        from tis_agent.ask import answer_question

        print("Tina (TIS knowledge base). Empty line to exit.\n")
        history: list[dict[str, str]] = []
        while True:
            try:
                question = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if not question:
                break
            result = answer_question(question, history=history)
            print(f"\nTina: {result.reply}\n")
            history.append({"role": "user", "content": question})
            history.append({"role": "assistant", "content": result.reply})
        return
    if command == "whatsapp":
        from tis_agent.whatsapp import main as whatsapp_main

        whatsapp_main()
        return

    print(f"Unknown command: {command}")
    raise SystemExit(2)


if __name__ == "__main__":
    main()
