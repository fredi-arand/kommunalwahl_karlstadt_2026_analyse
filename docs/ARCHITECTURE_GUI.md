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
- Top entry section with title, context, and data timestamp.

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
- List of all mayor candidates.
- Each `Candidate Card` displays:
  - `Rank Pill` (rank)
  - Name
  - Party
  - Votes
  - Optional percentage

### 3.5 Council Panel
- `Party Filter` with chip buttons.
- `Area Filter` as a dropdown below the party filter.
  - Default: `Alle Stimmen`
  - Ortsteil options: one option per `STIMMBEZIRK`
  - `Briefwahl (gesamt)`: aggregate of all brief voting districts
- Filtered or unfiltered candidate list.
- Each `Candidate Card` displays:
  - `Rank Pill` (global rank across all council candidates)
  - Name
  - Party
  - Votes

### 3.6 Area Selection Behavior
- Area selection affects both mayor and council vote values.
- Rank values are recalculated for the selected area.
- Party filter is applied after ranking.

### 3.7 UI State Persistence
- The frontend stores UI state in `localStorage`.
- Persisted values:
  - active `Tab`
  - selected `Party Filter` chips
  - selected `Area Filter` value
- On page reload, the previous view is restored.
- Invalid persisted values are sanitized against current data (unknown party names are dropped, unknown tabs/areas fall back to defaults).

## 4. Prompt Terminology

Use these terms so requirements stay unambiguous:

- "Hero" = top intro block
- "Summary Card" = single KPI card
- "Tab" = Bürgermeister/Stadtrat switch
- "Panel" = content area of a tab
- "Party Filter" = chip row in the Stadtrat panel
- "Candidate Card" = candidate entry in a list
- "Rank Pill" = visual rank element inside each Candidate Card

## 5. Change Guidelines
- Always document structural changes here.
- If new UI elements are introduced, name them in the style above.
- For data model changes, update both `README.md` and this file.
