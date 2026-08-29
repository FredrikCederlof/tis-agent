"""Ask the gold questions against live Tina and score the replies."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass

from tis_agent.eval_set import EvalCase, eval_cases


@dataclass
class CaseScore:
    id: str
    question: str
    pass_: bool
    outcome: str
    sources: list[str]
    missing: list[str]
    avoided_hits: list[str]
    reply: str


def _contains(haystack: str, needle: str) -> bool:
    return needle.lower() in haystack.lower()


def score_reply(case: EvalCase, reply: str, outcome: str, titles: list[str]) -> CaseScore:
    text = reply or ""
    missing: list[str] = []
    for needle in case.expect_all:
        if not _contains(text, needle):
            missing.append(needle)
    if case.expect_any and not any(_contains(text, needle) for needle in case.expect_any):
        missing.append("any:" + "|".join(case.expect_any))
    avoided = [needle for needle in case.avoid if _contains(text, needle)]
    passed = not missing and not avoided
    return CaseScore(
        id=case.id,
        question=case.question,
        pass_=passed,
        outcome=outcome,
        sources=titles,
        missing=missing,
        avoided_hits=avoided,
        reply=text,
    )


def _print_score(score: CaseScore) -> None:
    mark = "PASS" if score.pass_ else "FAIL"
    print(f"[{mark}] {score.id}  ({score.outcome})")
    print(f"  Q: {score.question}")
    preview = " ".join(score.reply.split())
    if len(preview) > 280:
        preview = preview[:277] + "..."
    print(f"  A: {preview}")
    if score.sources:
        print(f"  sources: {', '.join(score.sources)}")
    if score.missing:
        print(f"  missing: {', '.join(score.missing)}")
    if score.avoided_hits:
        print(f"  leaked: {', '.join(score.avoided_hits)}")
    print()


def run_eval(*, limit: int | None = None, json_out: bool = False) -> int:
    from tis_agent.ask import answer_question
    from tis_agent.config import get_settings

    get_settings()
    cases = list(eval_cases())
    if limit is not None:
        cases = cases[: max(0, limit)]

    scores: list[CaseScore] = []
    for case in cases:
        result = answer_question(case.question)
        score = score_reply(
            case,
            result.reply,
            result.outcome,
            result.document_titles,
        )
        scores.append(score)
        if not json_out:
            _print_score(score)

    passed = sum(1 for s in scores if s.pass_)
    failed = len(scores) - passed
    summary = {"passed": passed, "failed": failed, "total": len(scores)}
    if json_out:
        payload = {
            **summary,
            "cases": [
                {
                    "id": s.id,
                    "question": s.question,
                    "pass": s.pass_,
                    "outcome": s.outcome,
                    "sources": s.sources,
                    "missing": s.missing,
                    "avoided_hits": s.avoided_hits,
                    "reply": s.reply,
                }
                for s in scores
            ],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"Score: {passed}/{len(scores)} passed, {failed} failed.")
    return 0 if failed == 0 else 1


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Score Tina against gold TIS questions.")
    parser.add_argument("--limit", type=int, default=None, help="Only run the first N cases.")
    parser.add_argument("--json", action="store_true", dest="json_out")
    parser.add_argument(
        "--list",
        action="store_true",
        help="Print the gold questions without calling the live RAG.",
    )
    args = parser.parse_args(argv)

    if args.list:
        for case in eval_cases():
            print(f"- {case.id}: {case.question}  [{case.source}]")
        return

    try:
        code = run_eval(limit=args.limit, json_out=args.json_out)
    except SystemExit as exc:
        message = str(exc.code or "")
        if "Missing required env vars" in message:
            print(message, file=sys.stderr)
            print(
                "Live RAG eval needs SUPABASE_URL, SUPABASE_SECRET_KEY, and OPENAI_API_KEY "
                "in this Cloud Agent environment (same values as Railway).",
                file=sys.stderr,
            )
            raise SystemExit(2) from exc
        raise
    raise SystemExit(code)


if __name__ == "__main__":
    main()
