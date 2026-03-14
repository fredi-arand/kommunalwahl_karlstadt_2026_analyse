# Architecture and GUI Terminology

This file defines the terminology used for prompting and change requests.

## 1. Overall Architecture

### 1.1 Data Pipeline (Offline Build)
1. `scripts/build_data.py` fetches raw data from official sources.
2. The script normalizes the data and computes rank values.
3. The script writes the output to `data/final_results.json`.
4. The web app (`index.html` + `assets/app.js`) renders only this final JSON.

### 1.2 Frontend
- No runtime backend is required.
- No live updates.
- Focus is on comparison, filtering, and rankings.

## 2. Data Model (Terms)

### 2.1 Root
- `meta`
  - `location`
  - `year`
  - `generatedAt`
  - `sources`
- `mayor`
- `council`

### 2.2 Mayor Section
- `mayor.candidates[]`
  - `name`
  - `party`
  - `votes`
  - `percent`
  - `rank` (1 = most votes)

### 2.3 Council Section
- `council.turnout`
- `council.parties[]`
  - `name`
  - `block`
  - `color`
  - `seats`
  - `totalVotes`
  - `totalVotesPercent`
  - `candidates[]`
- `council.candidates[]`
  - cross-party global ranking with `rank`

## 3. GUI Structure and Naming

### 3.1 Hero
- Top entry section with title and context.

### 3.2 Summary Cards
- Three KPI cards:
  - Mayor candidates
  - Council candidates
  - Voter turnout

### 3.3 Tabs
- `Bürgermeister` tab
- `Stadtrat` tab

### 3.4 Mayor Panel
- `Area Filter` as a dropdown above the candidate list.
  - Default: `Alle Stimmen`
  - Ortsteil options: one option per `STIMMBEZIRK`
  - `Briefwahl (gesamt)`: aggregate of all brief voting districts
- Compact pill-style dropdown design.
- List of all mayor candidates.
- Each `Candidate Card` displays:
  - `Rank Pill` (absolute rank number)
  - Name
  - Party
  - Votes
  - Optional percentage
  - Click opens the `Candidate Detail Page`

### 3.5 Council Panel
- `Area Filter` as a dropdown.
  - Default: `Alle Stimmen`
  - Ortsteil options: one option per `STIMMBEZIRK`
  - `Briefwahl (gesamt)`: aggregate of all brief voting districts
- `Party Filter` as an exclusive dropdown (`Alle Parteien` + one party).
  - Includes a colored dot indicator for the selected party.
- Both dropdowns are placed in one responsive row when space allows.
- On narrow screens, dropdowns wrap automatically to avoid overflow.
- Filtered or unfiltered candidate list.
- Each `Candidate Card` displays:
  - `Rank Pill` (global absolute rank number across all council candidates)
  - Name
  - Party line (includes party-internal rank as `<Party>: <Platz>`, for example `SPD: 1`)
  - Votes
  - Click opens the `Candidate Detail Page`

### 3.6 Area Selection Behavior
- Mayor and council area selections are independent.
- Each area selection affects vote values and rank recalculation only within its own panel.
- Party filter selection (if not `Alle Parteien`) is applied after ranking.
- Candidate percentages are recalculated per current panel view (based on currently visible candidates) and shown inline with the vote label (`Stimmen (X %)`).

### 3.7 UI State Persistence
- The frontend stores UI state in `localStorage`.
- Persisted values:
  - active `Tab`
  - selected `Party Filter` dropdown value
  - selected mayor `Area Filter` value
  - selected council `Area Filter` value
- On page reload, the previous view is restored.
- If persisted state is invalid (malformed JSON or unknown tab/party/area values), UI state is reset to defaults and the stored client state is cleared.

### 3.8 Candidate Detail Page
- Dedicated page per candidate (`candidate.html`).
- Contains:
  - Candidate name and party
  - `Gesamtrang` (total rank)
  - Top 3 Ortsteile by candidate rank
  - Flop 3 Ortsteile by candidate rank
- Ortsteil comparison uses `areas.options` except `all`.
- `Briefwahl (gesamt)` is treated as one single comparison area.
- Candidate detail metrics are view-independent and based on the full scope dataset from `final_results.json`.
- Area rows show percentages inline with votes (`Stimmen (X %)`) for each area, calculated as if that area filter were selected in the overview and with no party filter applied (full candidate set of the selected election scope).
- Includes a `Back Link` to return to the main page.

## 4. Prompt Terminology

Use these terms so requirements stay unambiguous:

- "Hero" = top intro block
- "Summary Card" = single KPI card
- "Tab" = Bürgermeister/Stadtrat switch
- "Panel" = content area of a tab
- "Party Filter" = party dropdown in the Stadtrat panel
- "Filter Row" = responsive row containing Party Filter and Area Filter in the Stadtrat panel
- "Candidate Card" = candidate entry in a list
- "Rank Pill" = visual rank element inside each Candidate Card
- "Candidate Detail Page" = dedicated detail view for one candidate
- "Back Link" = navigation element from candidate detail to main page

## 5. Change Guidelines
- Always document structural changes here.
- If new UI elements are introduced, name them in the style above.
- For data model changes, update both `README.md` and this file.
