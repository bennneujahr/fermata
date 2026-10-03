"""Werkzeuge: höchstens fünf, strenge Schemas, eigene Prüfung der Eingaben."""

from __future__ import annotations

from typing import Any

import pytest

from viola.tools import ALL_TOOLS, FACT_CATEGORIES, TOOL_NAMES, ToolInputError, tools_for, validate


def _walk_objects(schema: dict[str, Any]) -> list[dict[str, Any]]:
    found = []
    if schema.get("type") == "object":
        found.append(schema)
        for prop in schema.get("properties", {}).values():
            found += _walk_objects(prop)
    if schema.get("type") == "array":
        found += _walk_objects(schema["items"])
    return found


def test_at_most_five_tools_with_expected_names() -> None:
    assert len(ALL_TOOLS) <= 5
    assert TOOL_NAMES == ("note_profile_fact", "propose_summary", "flag_safety", "end_conversation", "switch_to_text")


@pytest.mark.parametrize("tool", ALL_TOOLS, ids=lambda t: t["name"])
def test_schemas_are_strict(tool: dict[str, Any]) -> None:
    assert tool["strict"] is True
    assert tool["description"] and len(tool["description"]) > 40
    for obj in _walk_objects(tool["input_schema"]):
        assert obj["additionalProperties"] is False
        assert sorted(obj["required"]) == sorted(obj["properties"]), "strict verlangt alle Felder als Pflicht"
        for prop in obj["properties"].values():
            assert not {"minimum", "maximum", "minLength", "maxLength"} & set(prop), "nicht unterstützte Einschränkungen"


def test_tool_list_is_stable_for_caching() -> None:
    assert [t["name"] for t in tools_for(True)] == [t["name"] for t in tools_for(False)]
    assert tools_for(True) == tools_for(True)


def test_fact_categories_cover_art9_free_topics() -> None:
    assert set(FACT_CATEGORIES) >= {"persoenlichkeit", "werte", "wuensche", "lebensumstaende", "fahrbereitschaft", "zeiten"}
    for forbidden in ("gesundheit", "religion", "politik", "sexualitaet", "herkunft"):
        assert forbidden not in FACT_CATEGORIES


def test_validate_accepts_valid_input_and_truncates() -> None:
    call = validate("note_profile_fact", {"category": "werte", "fact": "  " + "x" * 300, "importance": 2})
    assert call.name == "note_profile_fact"
    assert len(call.args["fact"]) == 200


def test_validate_tolerates_case_differences_in_name() -> None:
    assert validate("End_Conversation", {"reason": "fertig"}).name == "end_conversation"


@pytest.mark.parametrize(
    ("name", "args", "message"),
    [
        ("unbekannt", {}, "Unbekanntes Werkzeug"),
        ("note_profile_fact", {"category": "werte", "fact": "x"}, "Pflichtfeld"),
        ("note_profile_fact", {"category": "religion", "fact": "x", "importance": 2}, "unerlaubten Wert"),
        ("note_profile_fact", {"category": "werte", "fact": "x", "importance": 5}, "unerlaubten Wert"),
        ("note_profile_fact", {"category": "werte", "fact": "x", "importance": True}, "ganze Zahl"),
        ("note_profile_fact", {"category": "werte", "fact": "   ", "importance": 1}, "leer"),
        ("propose_summary", {"summary": "x", "is_partial": "ja"}, "true oder false"),
        ("flag_safety", {"kind": "krise", "severity": "akut", "text": "x"}, "Unbekanntes Feld"),
        ("end_conversation", {"reason": "langeweile"}, "unerlaubten Wert"),
        ("switch_to_text", [], "JSON-Objekt"),
    ],
)
def test_validate_rejects_invalid_input(name: str, args: Any, message: str) -> None:
    with pytest.raises(ToolInputError, match=message):
        validate(name, args)
