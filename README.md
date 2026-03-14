# Karlstadt 2026 Local Election Analysis

Mobile-first web app for analyzing the final results of the 2026 local election in Karlstadt.

## Live Website
- https://kommunalwahl-karlstadt-2026-analyse.vercel.app

## Repository
- https://github.com/fredi-arand/kommunalwahl_karlstadt_2026_analyse

## Scope
This repository is intentionally **not** built for live election-night reporting. The focus is on final-result analysis and rankings:

- Mayor candidates with vote totals and rank
- Council candidates with vote totals and rank
- Dedicated candidate detail pages with total rank and top/flop Ortsteil ranking
- Party filter, seat overview, and turnout KPIs

## Data Sources
- Council (CSV):
  - https://wahlen.osrz-akdb.de/uf-p/677148/2/20260308/gemeinderatswahl_gemeinde/gesamtergebnis.csv
- Mayor (HTML table with downloadable metadata):
  - https://wahlen.osrz-akdb.de/uf-p/677148/1/20260308/buergermeisterwahl_gemeinde/ergebnisse.html
- Party metadata / seats (council HTML):
  - https://wahlen.osrz-akdb.de/uf-p/677148/2/20260308/gemeinderatswahl_gemeinde/ergebnisse.html

## Project Structure
- `index.html`: app entry point
- `candidate.html`: candidate detail page entry point
- `assets/styles.css`: design system and mobile-first styling
- `assets/app.js`: UI logic, tabs, filters, rendering
- `assets/candidate.js`: candidate detail rendering and Ortsteil rank insights
- `scripts/build_data.py`: fetches final raw data and generates `data/final_results.json`
- `data/csv/council_candidate_mapping_2026.json`: mapping of D blocks to candidate lists
- `docs/ARCHITECTURE_GUI.md`: architecture and GUI terminology for prompting

## Setup
1. Create a Python environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Build data
```bash
python3 scripts/build_data.py
```

3. Run locally
```bash
python3 -m http.server 4173
```
Then open in your browser: `http://localhost:4173`

## Notes
- The app reads only `data/final_results.json`.
- If upstream sources change or are corrected, rerun `scripts/build_data.py`.

## Related Project (Live Dashboard)
- https://kommunalwahl-2026-karlstadt.vercel.app
- https://github.com/fredi-arand/kommunalwahl_2026_karlstadt
