from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "source"
OUTPUT = ROOT / "app" / "data" / "questions.json"
METADATA_OUTPUT = ROOT / "app" / "data" / "bank-metadata.json"

EXPECTED_COUNTS = {2022: 98, 2023: 95, 2024: 99, 2025: 80}
ANNULLED = {2022: [43, 82], 2023: [20, 24, 25, 30, 42], 2024: [73], 2025: []}
ANSWER_KEY_LABELS = {2022: "provisional", 2023: "definitiva", 2024: "definitiva", 2025: "definitiva"}


def read_sources() -> list[dict]:
    first = json.loads((SOURCE_DIR / "questions_2022_2023.json").read_text(encoding="utf-8"))
    second = json.loads((SOURCE_DIR / "questions_2024_2025.json").read_text(encoding="utf-8"))
    first_questions = first["questions"] if isinstance(first, dict) else first
    second_questions = second["questions"] if isinstance(second, dict) else second
    return [*first_questions, *second_questions]


def normalized_fingerprint(question: dict) -> str:
    text = " ".join(
        [question["prompt"], *(question["options"][key] for key in ("A", "B", "C", "D"))]
    )
    return re.sub(r"\s+", " ", text).strip().casefold()


def normalize(question: dict) -> dict:
    year = int(question["year"])
    number = int(question["sourceQuestionNumber"])
    options = {key: str(question["options"][key]).strip() for key in ("A", "B", "C", "D")}
    correct_options = [str(value).upper() for value in question.get("correctOptions", [])]
    if not correct_options:
        correct_options = [str(question["correctOption"]).upper()]

    source_files = question.get("sources")
    if not isinstance(source_files, dict):
        source_files = question.get("sourceFiles")
    if not isinstance(source_files, dict):
        raise ValueError(f"Fuentes inválidas: {year}-{number}")
    return {
        "id": f"aeat-{year}-a-{number:03d}",
        "year": year,
        "sourceQuestionNumber": number,
        "prompt": str(question["prompt"]).strip(),
        "options": options,
        "correctOptions": correct_options,
        "isReserve": False,
        "answerKeyLabel": ANSWER_KEY_LABELS[year],
        "sources": {
            "questionnaire": source_files["questionnaire"],
            "answerKey": source_files["answerKey"],
        },
    }


def validate(questions: list[dict]) -> None:
    counts = Counter(question["year"] for question in questions)
    if dict(sorted(counts.items())) != EXPECTED_COUNTS:
        raise ValueError(f"Recuentos inesperados: {dict(counts)}")
    if len(questions) != sum(EXPECTED_COUNTS.values()):
        raise ValueError("El total del banco no coincide con el total esperado.")

    ids = [question["id"] for question in questions]
    if len(ids) != len(set(ids)):
        raise ValueError("Hay identificadores duplicados.")

    fingerprints = [normalized_fingerprint(question) for question in questions]
    if len(fingerprints) != len(set(fingerprints)):
        raise ValueError("Hay preguntas literalmente duplicadas tras normalización.")

    for question in questions:
        year = question["year"]
        number = question["sourceQuestionNumber"]
        if number in ANNULLED[year]:
            raise ValueError(f"Se ha incluido una pregunta anulada: {year}-{number}.")
        if set(question["options"]) != {"A", "B", "C", "D"}:
            raise ValueError(f"Opciones incompletas: {question['id']}")
        if len(question["correctOptions"]) != 1 or question["correctOptions"][0] not in question["options"]:
            raise ValueError(f"Clave inválida: {question['id']}")
        if not question["prompt"] or any(not value for value in question["options"].values()):
            raise ValueError(f"Texto vacío: {question['id']}")


def main() -> None:
    questions = sorted(
        (normalize(question) for question in read_sources()),
        key=lambda question: (question["year"], question["sourceQuestionNumber"]),
    )
    validate(questions)

    metadata = {
        "title": "Banco histórico AHP",
        "scope": "Acceso libre, tipo A, convocatorias 2022-2025",
        "totalQuestions": len(questions),
        "countsByYear": {str(year): count for year, count in EXPECTED_COUNTS.items()},
        "annulledExcluded": {str(year): values for year, values in ANNULLED.items()},
        "scoring": {
            "correct": 1,
            "incorrect": -0.25,
            "blank": 0,
            "formula": "aciertos - errores / 4",
        },
        "sourcePolicy": "Preguntas y claves proceden exclusivamente de los ocho PDF de la carpeta App.",
        "answerKeyNote": "El PDF de respuestas de 2022 está rotulado como plantilla provisional; los demás, como definitivos.",
    }

    OUTPUT.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    METADATA_OUTPUT.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Banco validado: {len(questions)} preguntas")


if __name__ == "__main__":
    main()
