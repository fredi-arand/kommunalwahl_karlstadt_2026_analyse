from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

YEAR = "2026"
LOCATION = "Karlstadt"
USER_AGENT = "Mozilla/5.0"
MAYOR_RESULTS_URL = (
    "https://wahlen.osrz-akdb.de/uf-p/677148/1/20260308/"
    "buergermeisterwahl_gemeinde/ergebnisse.html"
)
MAYOR_RESULTS_BASE_URL = (
    "https://wahlen.osrz-akdb.de/uf-p/677148/1/20260308/" "buergermeisterwahl_gemeinde/"
)
COUNCIL_RESULTS_URL = (
    "https://wahlen.osrz-akdb.de/uf-p/677148/2/20260308/"
    "gemeinderatswahl_gemeinde/ergebnisse.html"
)
COUNCIL_TOTAL_CSV_URL = (
    "https://wahlen.osrz-akdb.de/uf-p/677148/2/20260308/"
    "gemeinderatswahl_gemeinde/gesamtergebnis.csv"
)

ROOT_DIR = Path(__file__).resolve().parents[1]
MAPPING_PATH = ROOT_DIR / "data" / "csv" / "council_candidate_mapping_2026.json"
OUTPUT_PATH = ROOT_DIR / "data" / "final_results.json"


def fetch_text(url: str, timeout: float = 30.0) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content = response.read()
    return content.decode("utf-8")


def normalize_text(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def parse_votes(value: str) -> int:
    digits = "".join(char for char in value if char.isdigit())
    return int(digits) if digits else 0


def parse_percent(value: str) -> float | None:
    normalized = normalize_text(value).replace("%", "").replace(",", ".")
    if not normalized:
        return None
    try:
        return float(normalized)
    except ValueError:
        return None


def parse_hex_color(style: str) -> str | None:
    match = re.search(r"color\s*:\s*(#[0-9a-fA-F]{3,8})", style)
    return match.group(1) if match else None


def with_rank(
    items: list[dict[str, Any]], vote_key: str = "votes"
) -> list[dict[str, Any]]:
    sorted_items = sorted(
        items, key=lambda item: int(item.get(vote_key, 0)), reverse=True
    )
    ranked: list[dict[str, Any]] = []
    for index, item in enumerate(sorted_items, start=1):
        with_position = dict(item)
        with_position["rank"] = index
        ranked.append(with_position)
    return ranked


def parse_mayor_table_entries(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", attrs={"data-tablejigsaw-downloadable": True})
    if table is None:
        raise ValueError("Could not find downloadable mayor table")

    header_cells = [
        normalize_text(cell.get_text(" ", strip=True)).lower()
        for cell in table.select("thead th")
    ]

    party_col = 0
    name_col = 1
    votes_col = 2
    percent_col: int | None = None

    for index, header in enumerate(header_cells):
        if "wahlvorschlag" in header or "partei" in header:
            party_col = index
        if "kandidat" in header or "direktkandidat" in header or "name" in header:
            name_col = index
        if "stimmen" in header and votes_col == 2:
            votes_col = index
        if "%" in header or "anteil" in header:
            percent_col = index

    candidates: list[dict[str, Any]] = []
    for row in table.select("tbody tr"):
        cells = [
            normalize_text(cell.get_text(" ", strip=True))
            for cell in row.find_all(["th", "td"])
        ]
        if len(cells) <= max(party_col, name_col, votes_col):
            continue

        name = cells[name_col]
        if not name:
            continue

        party = cells[party_col] if len(cells) > party_col else "Unabhängig"
        votes = parse_votes(cells[votes_col])
        percent = (
            parse_percent(cells[percent_col])
            if percent_col is not None and len(cells) > percent_col
            else None
        )

        candidates.append(
            {
                "name": name,
                "party": party,
                "votes": votes,
                "percent": percent,
            }
        )

    return candidates


def parse_mayor_candidates(html: str) -> list[dict[str, Any]]:
    return with_rank(parse_mayor_table_entries(html))


def parse_council_csv_rows(
    csv_text: str,
) -> tuple[dict[str, str], list[dict[str, Any]]]:
    rows = list(csv.DictReader(io.StringIO(csv_text), delimiter=";"))
    if not rows:
        raise ValueError("Council CSV is empty")

    municipality_row = rows[0]
    for row in rows:
        if normalize_text(row.get("Gebietsart", "")).upper() == "GEMEINDE":
            municipality_row = row
            break

    area_rows: list[dict[str, Any]] = []
    for row in rows:
        area_type = normalize_text(row.get("Gebietsart", "")).upper()
        if area_type not in {"STIMMBEZIRK", "BRIEFWAHLBEZIRK"}:
            continue
        code = normalize_text(row.get("Gebietsnummer", ""))
        name = normalize_text(row.get("Gebietsname", ""))
        if not code or not name:
            continue
        area_rows.append(
            {
                "type": area_type,
                "code": code,
                "name": name,
                "row": row,
            }
        )

    return municipality_row, area_rows


def area_key(area_type: str, code: str) -> str:
    if area_type == "STIMMBEZIRK":
        return f"ortsteil:{code}"
    return f"briefwahlbezirk:{code}"


def build_area_options(area_rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    options: list[dict[str, str]] = [{"key": "all", "label": "Alle Stimmen"}]

    for area in area_rows:
        if area["type"] != "STIMMBEZIRK":
            continue
        options.append(
            {
                "key": area_key(area["type"], area["code"]),
                "label": area["name"],
            }
        )

    if any(area["type"] == "BRIEFWAHLBEZIRK" for area in area_rows):
        options.append({"key": "briefwahl-gesamt", "label": "Briefwahl"})

    return options


def mayor_area_url_for_row(area_row: dict[str, Any]) -> str:
    if area_row["type"] == "STIMMBEZIRK":
        return (
            f"{MAYOR_RESULTS_BASE_URL}"
            f"ergebnisse_stimmbezirk_{area_row['code']}.html"
        )
    return (
        f"{MAYOR_RESULTS_BASE_URL}"
        f"ergebnisse_briefwahlbezirk_{area_row['code']}.html"
    )


def parse_mayor_candidate_area_votes(
    area_rows: list[dict[str, Any]],
) -> dict[str, dict[str, int]]:
    votes_by_candidate: dict[str, dict[str, int]] = {}
    brief_aggregate: dict[str, int] = {}

    for area in area_rows:
        try:
            html = fetch_text(mayor_area_url_for_row(area))
            entries = parse_mayor_table_entries(html)
        except Exception:
            continue

        key = area_key(area["type"], area["code"])
        for entry in entries:
            name = str(entry["name"])
            votes = int(entry["votes"])
            votes_by_candidate.setdefault(name, {})[key] = votes
            if area["type"] == "BRIEFWAHLBEZIRK":
                brief_aggregate[name] = brief_aggregate.get(name, 0) + votes

    for name, votes in brief_aggregate.items():
        votes_by_candidate.setdefault(name, {})["briefwahl-gesamt"] = votes

    return votes_by_candidate


def parse_council_candidate_area_votes(
    area_rows: list[dict[str, Any]], mapping_payload: dict[str, Any]
) -> dict[str, dict[str, int]]:
    mapping_parties = mapping_payload.get("parties", {})
    if not isinstance(mapping_parties, dict):
        return {}

    votes_by_candidate: dict[str, dict[str, int]] = {}
    for party_name, mapping_info in mapping_parties.items():
        if not isinstance(mapping_info, dict):
            continue

        block_name = str(mapping_info.get("block") or "").strip().upper()
        candidate_names = mapping_info.get("candidates", [])
        if not block_name or not isinstance(candidate_names, list):
            continue

        for index, name in enumerate(candidate_names, start=1):
            clean_name = normalize_text(str(name))
            if not clean_name:
                continue

            candidate_key = f"{party_name}|{clean_name}"
            candidate_votes: dict[str, int] = {}
            brief_total = 0

            for area in area_rows:
                row = area["row"]
                value = parse_votes(row.get(f"{block_name}_{index}", ""))
                if area["type"] == "STIMMBEZIRK":
                    candidate_votes[area_key(area["type"], area["code"])] = value
                else:
                    brief_total += value

            candidate_votes["briefwahl-gesamt"] = brief_total
            votes_by_candidate[candidate_key] = candidate_votes

    return votes_by_candidate

    return with_rank(candidates)


def parse_council_party_overview(
    html: str,
) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    soup = BeautifulSoup(html, "html.parser")

    overview: dict[str, dict[str, Any]] = {}
    for table in soup.find_all("table"):
        if table.select_one(".partei__name") is None:
            continue
        for row in table.select("tbody tr"):
            party_element = row.select_one(".partei__name")
            if party_element is None:
                continue
            party_name = normalize_text(party_element.get_text(" ", strip=True))

            cells = row.find_all(["th", "td"])
            votes = (
                parse_votes(cells[1].get_text(" ", strip=True)) if len(cells) > 1 else 0
            )
            percent = (
                parse_percent(cells[2].get_text(" ", strip=True))
                if len(cells) > 2
                else None
            )

            color_element = row.select_one(".partei__farbe")
            color_style = color_element.get("style", "") if color_element else ""
            color = parse_hex_color(color_style) or "#7b7b7b"

            overview[party_name] = {
                "votes": votes,
                "percent": percent,
                "color": color,
            }

    seats_by_party: dict[str, int] = {}
    for chart in soup.select(".js-d3chart"):
        options_raw = chart.get("data-chartoptions") or ""
        options = unescape(options_raw)
        if '"type":"sitze"' not in options:
            continue

        chart_data_raw = chart.get("data-chartdata") or ""
        if not chart_data_raw:
            continue

        chart_data = json.loads(unescape(chart_data_raw))
        datasets = chart_data.get("dataSets")
        if not isinstance(datasets, list):
            continue

        for row in datasets:
            if not isinstance(row, dict):
                continue
            label = normalize_text(str(row.get("label") or ""))
            if not label:
                continue
            try:
                seat_count = int(float(row.get("value") or 0))
            except (TypeError, ValueError):
                seat_count = 0
            seats_by_party[label] = max(0, seat_count)
        if seats_by_party:
            break

    return overview, seats_by_party


def parse_municipality_row(csv_text: str) -> dict[str, str]:
    municipality_row, _ = parse_council_csv_rows(csv_text)
    return municipality_row


def parse_turnout(municipality_row: dict[str, str]) -> dict[str, Any]:
    eligible = parse_votes(municipality_row.get("Wahlberechtigte gesamt (A)", ""))
    voters = parse_votes(municipality_row.get("Waehler gesamt (B)", ""))
    valid_votes = parse_votes(municipality_row.get("Stimmen gueltige (D)", ""))

    turnout_percent = None
    if eligible > 0:
        turnout_percent = round((voters / eligible) * 100, 2)

    return {
        "eligibleVoters": eligible,
        "voters": voters,
        "turnoutPercent": turnout_percent,
        "validVotes": valid_votes,
    }


def parse_d_block_votes(municipality_row: dict[str, str]) -> dict[str, list[int]]:
    blocks: dict[str, list[int]] = {}
    for column in municipality_row.keys():
        if re.fullmatch(r"D\d+", column or "") is None:
            continue

        values = [
            parse_votes(municipality_row.get(f"{column}_{index}", ""))
            for index in range(1, 25)
        ]
        if sum(values) <= 0:
            continue
        blocks[column] = values

    return blocks


def parse_council_candidates(
    csv_text: str,
    mapping_payload: dict[str, Any],
    party_meta: dict[str, dict[str, Any]],
    seat_meta: dict[str, int],
    council_area_votes: dict[str, dict[str, int]],
) -> dict[str, Any]:
    municipality_row = parse_municipality_row(csv_text)
    turnout = parse_turnout(municipality_row)
    votes_by_block = parse_d_block_votes(municipality_row)

    mapping_parties = mapping_payload.get("parties", {})
    if not isinstance(mapping_parties, dict):
        raise ValueError("Invalid candidate mapping format")

    parties: list[dict[str, Any]] = []
    all_candidates: list[dict[str, Any]] = []

    for party_name, mapping_info in mapping_parties.items():
        if not isinstance(mapping_info, dict):
            continue

        block_name = str(mapping_info.get("block") or "").strip().upper()
        candidate_names = mapping_info.get("candidates", [])
        if block_name not in votes_by_block or not isinstance(candidate_names, list):
            continue

        votes = votes_by_block[block_name]
        party_candidates: list[dict[str, Any]] = []
        for index, name in enumerate(candidate_names, start=1):
            clean_name = normalize_text(str(name))
            if not clean_name:
                continue
            candidate_votes = votes[index - 1] if (index - 1) < len(votes) else 0
            party_candidates.append(
                {
                    "id": index,
                    "name": clean_name,
                    "party": party_name,
                    "votes": candidate_votes,
                    "areaVotes": council_area_votes.get(
                        f"{party_name}|{clean_name}", {}
                    ),
                }
            )

        ranked_party_candidates = with_rank(party_candidates)
        all_candidates.extend(ranked_party_candidates)

        meta = party_meta.get(party_name, {})
        parties.append(
            {
                "name": party_name,
                "block": block_name,
                "color": meta.get("color") or "#7b7b7b",
                "seats": int(seat_meta.get(party_name) or 0),
                "totalVotes": int(
                    meta.get("votes") or sum(c["votes"] for c in party_candidates)
                ),
                "totalVotesPercent": meta.get("percent"),
                "candidates": ranked_party_candidates,
            }
        )

    ranked_all_candidates = with_rank(all_candidates)
    return {
        "turnout": turnout,
        "parties": parties,
        "candidates": ranked_all_candidates,
    }


def build_payload() -> dict[str, Any]:
    mayor_html = fetch_text(MAYOR_RESULTS_URL)
    council_html = fetch_text(COUNCIL_RESULTS_URL)
    council_csv = fetch_text(COUNCIL_TOTAL_CSV_URL)

    with MAPPING_PATH.open("r", encoding="utf-8") as handle:
        mapping_payload = json.load(handle)

    _, area_rows = parse_council_csv_rows(council_csv)
    area_options = build_area_options(area_rows)

    mayor_candidates = parse_mayor_candidates(mayor_html)
    mayor_area_votes = parse_mayor_candidate_area_votes(area_rows)
    for candidate in mayor_candidates:
        candidate["areaVotes"] = mayor_area_votes.get(candidate["name"], {})

    party_meta, seat_meta = parse_council_party_overview(council_html)
    council_area_votes = parse_council_candidate_area_votes(area_rows, mapping_payload)
    council_data = parse_council_candidates(
        csv_text=council_csv,
        mapping_payload=mapping_payload,
        party_meta=party_meta,
        seat_meta=seat_meta,
        council_area_votes=council_area_votes,
    )

    return {
        "meta": {
            "location": LOCATION,
            "year": YEAR,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sources": {
                "mayorResults": MAYOR_RESULTS_URL,
                "councilResults": COUNCIL_RESULTS_URL,
                "councilCsv": COUNCIL_TOTAL_CSV_URL,
            },
        },
        "mayor": {
            "candidates": mayor_candidates,
        },
        "council": council_data,
        "areas": {
            "options": area_options,
        },
    }


def main() -> None:
    payload = build_payload()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(f"Wrote {OUTPUT_PATH}")
    print(f"Mayor candidates: {len(payload['mayor']['candidates'])}")
    print(f"Council candidates: {len(payload['council']['candidates'])}")


if __name__ == "__main__":
    main()
