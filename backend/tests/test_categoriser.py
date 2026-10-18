from process_image.categoriser import (
    best_conf,
    categorise,
    is_screen_ratio,
    needs_text,
    receipt_hits,
)


def label(name: str, confidence: float) -> dict[str, object]:
    return {"name": name, "confidence": confidence}


def test_receipt_ocr_wins_over_text_label() -> None:
    labels = [label("Text", 99)]
    result = categorise(
        labels,
        "TESCO SUBTOTAL 10.40 VAT 2.00 TOTAL £12.40",
        1200,
        1600,
        False,
        False,
    )
    assert result == ("Receipts", 99)


def test_receipt_label_is_enough() -> None:
    assert categorise([label("Receipt", 92)], "", 1000, 1000, False, False) == (
        "Receipts",
        92,
    )


def test_receipt_confidence_does_not_use_document_label_confidence() -> None:
    result = categorise(
        [label("Document", 98)],
        "SUBTOTAL VAT TOTAL",
        1000,
        1000,
        False,
        False,
    )
    assert result == ("Receipts", 90)


def test_receipt_hits_use_word_boundaries() -> None:
    assert receipt_hits("cashier") == 0
    assert receipt_hits("AMOUNT DUE: £12.00") == 3


def test_currency_symbols_and_price_pattern_are_counted_once_each() -> None:
    assert receipt_hits("£10.00 £20.00 $30.00 €40.00") == 4


def test_name_hint_marks_screenshot() -> None:
    assert categorise([], "", 1000, 1000, False, True) == ("Screenshots", 95)


def test_tall_png_with_text_is_screenshot() -> None:
    result = categorise(
        [label("Text", 95)],
        "one two three four five six seven eight nine ten",
        1170,
        2532,
        True,
        False,
    )
    assert result == ("Screenshots", 95)


def test_wide_webpage_with_ocr_is_screenshot() -> None:
    result = categorise(
        [label("Webpage", 88)],
        "one two three four five six seven eight nine ten " * 5,
        1920,
        1080,
        False,
        False,
    )
    assert result == ("Screenshots", 88)


def test_meme_on_four_by_three_photo_is_not_screenshot() -> None:
    result = categorise(
        [label("Person", 95), label("Text", 90)],
        "WHEN YOU FINALLY FIX THE BUG",
        4032,
        3024,
        False,
        False,
    )
    assert result == ("Memes", 85.5)


def test_person_labels_classify_people() -> None:
    assert categorise(
        [label("Person", 97), label("Face", 96)], "", 1000, 1000, False, False
    ) == ("People", 97)


def test_landscape_labels_classify_landscape() -> None:
    assert categorise(
        [label("Landscape", 90), label("Mountain", 88), label("Sky", 95)],
        "",
        1000,
        1000,
        False,
        False,
    ) == ("Landscapes", 95)


def test_people_rule_precedes_landscape_rule() -> None:
    assert categorise(
        [label("Landscape", 90), label("Person", 92)], "", 1000, 1000, False, False
    ) == ("People", 92)


def test_unmatched_labels_are_other() -> None:
    assert categorise(
        [label("Food", 90), label("Plate", 85)], "", 1000, 1000, False, False
    ) == ("Other", 0)


def test_empty_input_is_other() -> None:
    assert categorise([], "", 1000, 1000, False, False) == ("Other", 0)


def test_long_document_is_not_a_meme() -> None:
    ocr = " ".join(["word"] * 300)
    assert categorise(
        [label("Document", 90)], ocr, 1000, 1000, False, False
    ) == ("Other", 0)


def test_needs_text_uses_sixty_percent_threshold() -> None:
    assert needs_text([label("Text", 60)])
    assert not needs_text([label("Text", 59.9)])
    assert best_conf([label("Text", 91), label("Text", 60)], {"Text"}) == 91
    assert best_conf([label("Food", 99)], {"Text"}) == 0


def test_screen_ratio_includes_expected_aspects_not_four_by_three() -> None:
    assert is_screen_ratio(1920, 1080)
    assert is_screen_ratio(1170, 2532)
    assert not is_screen_ratio(4032, 3024)
    assert not is_screen_ratio(0, 1920)
