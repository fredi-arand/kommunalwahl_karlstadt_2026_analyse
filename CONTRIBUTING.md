# CONTRIBUTING

## Principle
This repository focuses on **final-result analysis** (no live polling, no auto-refresh).

## Technical Rules
1. Run Python scripts in the active virtual environment.
2. Add any new Python dependencies to `requirements.txt`.
3. Before changing the UI, read `docs/ARCHITECTURE_GUI.md` and keep terminology consistent.
4. UI text remains German.
5. For data model changes, update both README and the architecture document.

## Standard Workflow
1. Update data model or UI.
2. Run `python3 scripts/build_data.py`.
3. Test locally with `python3 -m http.server 4173`.
4. Simulate and validate the mobile viewport in browser dev tools.

## Pull Request Checklist
- [ ] Rank display exists and is correct for affected candidate views
- [ ] No regressions in party filter and tabs
- [ ] README updated (if setup/architecture changed)
- [ ] `docs/ARCHITECTURE_GUI.md` updated for GUI structure changes
