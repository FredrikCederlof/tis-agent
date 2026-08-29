"""Gold questions grounded in the TIS documents currently in the knowledge folder.

These are parent-style WhatsApp questions. `expect_any` / `expect_all` are
case-insensitive substrings that a grounded answer should include. `avoid` must
not appear (child names, invented facts).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EvalCase:
    id: str
    question: str
    source: str
    expect_any: tuple[str, ...] = ()
    expect_all: tuple[str, ...] = ()
    avoid: tuple[str, ...] = ("eldor", "malte", "vega-lo", "vega")
    notes: str = ""


EVAL_CASES: tuple[EvalCase, ...] = (
    EvalCase(
        id="today_events",
        question="Hi. Is there anything special happening at school today?",
        source="TIS Parent Calendar + other dated TIS docs",
        expect_any=("hopes", "dreams", "no number"),
        notes="28 Aug 2026: Hope and Dreams and No Number Day on the parent calendar.",
    ),
    EvalCase(
        id="when_hopes_dreams",
        question="When is Hopes and Dreams?",
        source="TIS Parent Calendar",
        expect_any=("august 28", "28 august", "2026-08-28", "28 aug"),
    ),
    EvalCase(
        id="season1_start",
        question="When do Season 1 activities start?",
        source="TIS Parent Calendar",
        expect_any=("august 31", "31 august", "2026-08-31", "31 aug"),
    ),
    EvalCase(
        id="first_school_day",
        question="When is the first school day for all students?",
        source="TIS Parent Calendar",
        expect_any=("august 25", "25 august", "2026-08-25", "25 aug"),
    ),
    EvalCase(
        id="this_week",
        question="Are there any events this week?",
        source="TIS Parent Calendar",
        expect_any=("hopes", "dreams", "no number", "season 1", "first school"),
    ),
    EvalCase(
        id="report_absence",
        question="What does TIS say about reporting an absence?",
        source="Community Handbook 2026-2027",
        expect_all=("toddle",),
        expect_any=("excusal", "8:40", "absent"),
    ),
    EvalCase(
        id="school_start_time",
        question="What time does school start?",
        source="Community Handbook 2026-2027",
        expect_any=("8:10", "8.10"),
    ),
    EvalCase(
        id="late_arrival",
        question="What happens if my child arrives late?",
        source="Community Handbook 2026-2027",
        expect_any=("8:20", "late", "main office"),
    ),
    EvalCase(
        id="kiwi_deadline",
        question="When is the Kiwi Kitchen lunch order deadline?",
        source="Kiwi Kitchen School Meals instructions",
        expect_any=("thursday",),
        notes="Orders by Thursday before the week of delivery; midnight.",
    ),
    EvalCase(
        id="kiwi_price",
        question="How much does a Kiwi Kitchen school lunch cost?",
        source="Kiwi Kitchen School Meals instructions",
        expect_any=("750", "¥750"),
    ),
    EvalCase(
        id="btb_hours",
        question="What are the Beyond the Bell hours?",
        source="TIS Beyond the Bell Guide 2026-27",
        expect_any=("3:30", "15:30", "6:00", "18:00"),
    ),
    EvalCase(
        id="btb_who",
        question="Who can use Beyond the Bell after-school care?",
        source="TIS Beyond the Bell Guide 2026-27",
        expect_any=("kindergarten", "grade 5", "k through", "k-g5", "k to grade 5"),
    ),
    EvalCase(
        id="btb_daily_fee",
        question="How much is Beyond the Bell per session?",
        source="TIS Beyond the Bell Guide 2026-27 / School Fees",
        expect_any=("2,000", "2000", "¥2,000"),
    ),
    EvalCase(
        id="bus_change",
        question="How do I request a one-off school bus change?",
        source="Transportation Change requests in SchoolsBuddy",
        expect_any=("schoolsbuddy", "change"),
    ),
    EvalCase(
        id="flu_exclusion",
        question="How long must a child stay home with influenza?",
        source="Influenza Confinement Policy",
        expect_any=("5 days", "five days", "fever free", "fever-free"),
    ),
    EvalCase(
        id="medication_nurse",
        question="Who gives medication to students during school hours?",
        source="Authorization for Medications",
        expect_any=("school nurse", "health office", "nurse"),
    ),
    EvalCase(
        id="night_emergency",
        question="Where is the Minato night emergency medical center for children?",
        source="Night Emergency for children / Hospitals near TIS",
        expect_any=("shibaura", "03-6453-7302", "minato child"),
    ),
    EvalCase(
        id="fees_due",
        question="When must returning students pay annual school fees?",
        source="TIS School Fees 2026-2027",
        expect_any=("may 15", "15 may", "15th may"),
    ),
    EvalCase(
        id="kg_tuition",
        question="What is the annual tuition for Kindergarten?",
        source="TIS School Fees 2026-2027",
        expect_any=("3,300,000", "3300000", "3.3"),
    ),
    EvalCase(
        id="core_values",
        question="What are TIS core values?",
        source="Community Handbook 2026-2027",
        expect_all=("trust", "inspire", "support"),
    ),
)


def eval_cases() -> tuple[EvalCase, ...]:
    return EVAL_CASES
