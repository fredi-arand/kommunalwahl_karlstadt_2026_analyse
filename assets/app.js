const state = {
  data: null,
  activeTab: "mayor",
  selectedParties: new Set(),
  selectedArea: "all",
};

const tabButtons = [...document.querySelectorAll(".tab-button")];
const panels = [...document.querySelectorAll("[data-panel]")];
const summaryCards = document.getElementById("summaryCards");
const generatedAt = document.getElementById("generatedAt");
const mayorList = document.getElementById("mayorList");
const councilList = document.getElementById("councilList");
const partyFilter = document.getElementById("partyFilter");
const areaSelectMayor = document.getElementById("areaSelectMayor");
const areaSelectCouncil = document.getElementById("areaSelectCouncil");
const areaSelects = [areaSelectMayor, areaSelectCouncil].filter(Boolean);
const UI_STATE_STORAGE_KEY = "kommunalwahl.guiState.v1";

function persistUiState() {
  const snapshot = {
    activeTab: state.activeTab,
    selectedArea: state.selectedArea,
    selectedParties: [...state.selectedParties],
  };

  try {
    localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (_error) {
    // Ignore storage failures (private mode, blocked storage, quota limits).
  }
}

function restoreUiState() {
  try {
    const raw = localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    const validTabs = new Set(tabButtons.map((button) => button.dataset.tab).filter(Boolean));

    if (typeof parsed?.activeTab === "string" && validTabs.has(parsed.activeTab)) {
      state.activeTab = parsed.activeTab;
    }

    if (typeof parsed?.selectedArea === "string" && parsed.selectedArea.length > 0) {
      state.selectedArea = parsed.selectedArea;
    }

    if (Array.isArray(parsed?.selectedParties)) {
      state.selectedParties = new Set(
        parsed.selectedParties.filter((partyName) => typeof partyName === "string" && partyName.length > 0)
      );
    }
  } catch (_error) {
    // Ignore malformed saved state.
  }
}

function pruneSelectedParties() {
  const validPartyNames = new Set((state.data?.council?.parties || []).map((party) => party.name));
  state.selectedParties = new Set(
    [...state.selectedParties].filter((partyName) => validPartyNames.has(partyName))
  );
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("de-DE");
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${Number(value).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

function formatGeneratedAt(isoText) {
  if (!isoText) {
    return "Stand: unbekannt";
  }
  const date = new Date(isoText);
  return `Stand: ${date.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  })}`;
}

function setActiveTab(tab) {
  const validTabs = new Set(tabButtons.map((button) => button.dataset.tab).filter(Boolean));
  state.activeTab = validTabs.has(tab) ? tab : "mayor";
  for (const button of tabButtons) {
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  }
  for (const panel of panels) {
    panel.classList.toggle("is-hidden", panel.dataset.panel !== state.activeTab);
  }

  persistUiState();
}

function candidateVotesForArea(candidate) {
  if (state.selectedArea === "all") {
    return Number(candidate.votes || 0);
  }
  return Number(candidate.areaVotes?.[state.selectedArea] || 0);
}

function rankedCandidatesForArea(candidates) {
  const withAreaVotes = candidates.map((candidate) => ({
    ...candidate,
    votes: candidateVotesForArea(candidate),
    percent: state.selectedArea === "all" ? candidate.percent : null,
  }));

  withAreaVotes.sort((left, right) => right.votes - left.votes);
  return withAreaVotes.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));
}

function createCandidateCard(candidate, options = {}) {
  const card = document.createElement("article");
  card.className = "candidate-card";
  card.style.borderLeftColor = options.color || "#b9a999";

  const percentPart =
    candidate.percent === null || candidate.percent === undefined
      ? ""
      : `<p class="vote-label">${formatPercent(candidate.percent)}</p>`;

  card.innerHTML = `
    <div class="candidate-main">
      <div class="name-line">
        <span class="rank-pill">Rang ${candidate.rank}</span>
        <h3 class="candidate-name">${candidate.name}</h3>
      </div>
      <p class="candidate-party">${candidate.party}</p>
    </div>
    <div class="vote-column">
      <p class="vote-value">${formatInteger(candidate.votes)}</p>
      <p class="vote-label">Stimmen</p>
      ${percentPart}
    </div>
  `;

  return card;
}

function renderSummary() {
  if (!state.data) {
    return;
  }

  const mayorCount = state.data.mayor.candidates.length;
  const councilCount = state.data.council.candidates.length;
  const turnout = state.data.council.turnout.turnoutPercent;

  const items = [
    {
      label: "Bürgermeisterkandidaten",
      value: formatInteger(mayorCount),
    },
    {
      label: "Stadtratskandidaten",
      value: formatInteger(councilCount),
    },
    {
      label: "Wahlbeteiligung",
      value: formatPercent(turnout),
    },
  ];

  summaryCards.innerHTML = "";
  for (const item of items) {
    const card = document.createElement("section");
    card.className = "summary-card";
    card.innerHTML = `
      <p class="summary-label">${item.label}</p>
      <p class="summary-value">${item.value}</p>
    `;
    summaryCards.appendChild(card);
  }
}

function renderMayorList() {
  mayorList.innerHTML = "";
  const candidates = state.data?.mayor?.candidates || [];
  const ranked = rankedCandidatesForArea(candidates);

  if (!ranked.length) {
    mayorList.innerHTML = '<div class="empty-state">Keine Daten fur Bürgermeisterkandidaten gefunden.</div>';
    return;
  }

  for (const candidate of ranked) {
    mayorList.appendChild(createCandidateCard(candidate));
  }
}

function renderAreaFilter() {
  if (!areaSelects.length) {
    return;
  }

  const options = state.data?.areas?.options || [{ key: "all", label: "Alle Stimmen" }];

  for (const selectElement of areaSelects) {
    selectElement.innerHTML = "";
    for (const option of options) {
      const optionElement = document.createElement("option");
      optionElement.value = option.key;
      optionElement.textContent = option.label;
      if (option.key === state.selectedArea) {
        optionElement.selected = true;
      }
      selectElement.appendChild(optionElement);
    }
  }

  if (!options.some((option) => option.key === state.selectedArea)) {
    state.selectedArea = "all";
    for (const selectElement of areaSelects) {
      selectElement.value = "all";
    }
  }
}

function renderPartyFilter() {
  partyFilter.innerHTML = "";
  const parties = state.data?.council?.parties || [];

  for (const party of parties) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    const seats = Number(party.seats || 0);
    const seatLabel = seats === 1 ? "Stadtrat" : "Stadträte";
    button.textContent = `${party.name} (${formatInteger(seats)} ${seatLabel})`;

    const selected = state.selectedParties.has(party.name);
    if (selected) {
      button.classList.add("is-selected");
      button.style.backgroundColor = party.color;
    }

    button.addEventListener("click", () => {
      if (state.selectedParties.has(party.name)) {
        state.selectedParties.delete(party.name);
      } else {
        state.selectedParties.add(party.name);
      }

      persistUiState();
      renderPartyFilter();
      renderCouncilList();
    });

    partyFilter.appendChild(button);
  }
}

function renderCouncilList() {
  councilList.innerHTML = "";

  const allCandidates = rankedCandidatesForArea(state.data?.council?.candidates || []);
  const partyMap = new Map((state.data?.council?.parties || []).map((party) => [party.name, party]));

  const visibleCandidates =
    state.selectedParties.size === 0
      ? allCandidates
      : allCandidates.filter((candidate) => state.selectedParties.has(candidate.party));

  if (!visibleCandidates.length) {
    councilList.innerHTML = '<div class="empty-state">Keine Kandidaten fur die gewahlten Parteien.</div>';
    return;
  }

  for (const candidate of visibleCandidates) {
    const partyInfo = partyMap.get(candidate.party);
    councilList.appendChild(createCandidateCard(candidate, { color: partyInfo?.color }));
  }
}

async function loadData() {
  const response = await fetch("data/final_results.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Konnte Daten nicht laden: HTTP ${response.status}`);
  }

  state.data = await response.json();
  pruneSelectedParties();
  generatedAt.textContent = formatGeneratedAt(state.data?.meta?.generatedAt);

  renderSummary();
  renderAreaFilter();
  renderMayorList();
  renderPartyFilter();
  renderCouncilList();
  persistUiState();
}

function attachTabHandlers() {
  for (const button of tabButtons) {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  }
}

function attachAreaHandler() {
  if (!areaSelects.length) {
    return;
  }

  for (const selectElement of areaSelects) {
    selectElement.addEventListener("change", () => {
      state.selectedArea = selectElement.value || "all";
      for (const peerSelect of areaSelects) {
        peerSelect.value = state.selectedArea;
      }

      persistUiState();
      renderMayorList();
      renderCouncilList();
    });
  }
}

async function bootstrap() {
  restoreUiState();
  attachTabHandlers();
  attachAreaHandler();
  setActiveTab(state.activeTab);

  try {
    await loadData();
  } catch (error) {
    summaryCards.innerHTML = '<div class="empty-state">Fehler beim Laden der Wahldaten.</div>';
    mayorList.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

bootstrap();
