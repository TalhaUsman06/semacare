import re
from collections.abc import Mapping, Sequence

Label = Mapping[str, object]

TEXT_LABELS = {
    "Text", "Document", "Receipt", "Paper", "Page", "Menu", "Poster",
    "Screenshot", "Webpage", "Web Page", "File", "Label", "Invoice",
    "Letter", "Book", "Newspaper", "Business Card", "Advertisement",
    "Flyer", "Brochure", "Word", "Number", "Symbol", "Chart", "Diagram",
}
RECEIPT_LABELS = {"Receipt", "Invoice", "Bill"}
SCREEN_LABELS = {
    "Text", "Screenshot", "Webpage", "Web Page", "File", "Electronics",
    "Computer", "Monitor", "Screen", "Phone", "Mobile Phone", "Word", "Number",
}
MEME_PIC_LABELS = {
    "Person", "Face", "Animal", "Pet", "Dog", "Cat", "Cartoon", "Comics",
    "Poster", "Head", "Baby", "Bird",
}
DOC_LABELS = {"Document", "Page", "Paper", "Letter", "Receipt", "Invoice", "Menu"}
PEOPLE_LABELS = {
    "Person", "Human", "Face", "Adult", "Man", "Woman", "Child", "Boy",
    "Girl", "Selfie", "Portrait", "Head", "Smile", "Crowd",
}
LANDSCAPE_LABELS = {
    "Landscape", "Nature", "Outdoors", "Scenery", "Mountain", "Sea", "Ocean",
    "Beach", "Sky", "Sunset", "Sunrise", "Water", "Lake", "Forest", "Tree",
    "Field", "Countryside", "Coast", "Shoreline", "Horizon", "Cloud", "Desert",
    "Valley", "Mountain Range", "Hill",
}

_RECEIPT_KEYWORDS = (
    "total", "subtotal", "sub total", "vat", "tax", "receipt", "invoice",
    "amount due", "change", "cash", "card", "visa", "mastercard", "balance",
    "qty",
)
_RECEIPT_KEYWORD_PATTERNS = tuple(
    re.compile(r"\b" + re.escape(keyword).replace(r"\ ", r"\s+") + r"\b", re.IGNORECASE)
    for keyword in _RECEIPT_KEYWORDS
)
_CURRENCY_PATTERNS = tuple(re.compile(re.escape(symbol)) for symbol in ("£", "$", "€"))
_PRICE_PATTERN = re.compile(r"\b\d+[.,]\d{2}\b")


def best_conf(labels: Sequence[Label], names: set[str]) -> float:
    """Return the highest confidence for a label whose name is in names."""
    highest = 0.0
    for label in labels:
        name = label.get("name")
        confidence = label.get("confidence")
        if (
            isinstance(name, str)
            and name in names
            and isinstance(confidence, (int, float))
        ):
            highest = max(highest, confidence)
    return highest


def needs_text(labels: Sequence[Label]) -> bool:
    return best_conf(labels, TEXT_LABELS) >= 60


def receipt_hits(ocr: str | None) -> int:
    text = ocr or ""
    keyword_hits = sum(pattern.search(text) is not None for pattern in _RECEIPT_KEYWORD_PATTERNS)
    currency_hits = sum(pattern.search(text) is not None for pattern in _CURRENCY_PATTERNS)
    price_hit = int(_PRICE_PATTERN.search(text) is not None)
    return keyword_hits + currency_hits + price_hit


def is_screen_ratio(width: int, height: int) -> bool:
    if width <= 0 or height <= 0:
        return False
    ratio = max(width, height) / min(width, height)
    return 1.54 <= ratio <= 1.80 or 1.95 <= ratio <= 2.40


def categorise(
    labels: Sequence[Label],
    ocr: str | None,
    width: int,
    height: int,
    is_png: bool,
    name_hint: bool,
) -> tuple[str, float]:
    text = ocr or ""
    word_count = len(re.findall(r"\w+", text))
    hits = receipt_hits(text)
    receipt_conf = best_conf(labels, RECEIPT_LABELS)
    screen_conf = best_conf(labels, SCREEN_LABELS)
    meme_pic_conf = best_conf(labels, MEME_PIC_LABELS)
    doc_conf = best_conf(labels, DOC_LABELS)
    people_conf = best_conf(labels, PEOPLE_LABELS)
    landscape_conf = best_conf(labels, LANDSCAPE_LABELS)

    if hits >= 3 or receipt_conf >= 80 or (hits >= 2 and doc_conf >= 70):
        return "Receipts", max(min(99, 60 + 10 * hits), receipt_conf)

    if name_hint or (
        is_screen_ratio(width, height)
        and screen_conf >= 70
        and (is_png or word_count >= 5)
    ):
        return "Screenshots", 95 if name_hint else screen_conf

    if 3 <= word_count <= 40 and meme_pic_conf >= 70 and doc_conf < 70:
        return "Memes", meme_pic_conf * 0.9

    if people_conf >= 80:
        return "People", people_conf

    if landscape_conf >= 75 and people_conf < 80:
        return "Landscapes", landscape_conf

    return "Other", 0
