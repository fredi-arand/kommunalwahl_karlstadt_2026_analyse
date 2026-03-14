const state = {
  data: null,
  activeTab: "mayor",
  selectedParty: "all",
  selectedArea: "all",
};

const tabButtons = [...document.querySelectorAll(".tab-button")];
const panels = [...document.querySelectorAll("[data-panel]")];
const summaryCards = document.getElementById("summaryCards");
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
    selectedParty: state.selectedParty,
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

    if (typeof parsed?.selectedParty === "string" && parsed.selectedParty.length > 0) {
      state.selectedParty = parsed.selectedParty;
    } else if (Array.isArray(parsed?.selectedParties) && parsed.selectedParties.length > 0) {
      // Backward compatibility for older multi-select snapshots.
      const firstValidParty = parsed.selectedParties.find(
        (partyName) => typeof partyName === "string" && partyName.length > 0
      );
      if (firstValidParty) {
        state.selectedParty = firstValidParty;
      }
    }
  } catch (_error) {
    // Ignore malformed saved state.
  }
}

function pruneSelectedParty() {
  const validPartyNames = new Set((state.data?.council?.parties || []).map((party) => party.name));
  if (state.selectedParty !== "all" && !validPartyNames.has(state.selectedParty)) {
    state.selectedParty = "all";
  }
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

function buildCandidateHref(candidate, scope) {
  const params = new URLSearchParams({
    scope,
    name: candidate?.name || "",
  });

  if (candidate?.party) {
    params.set("party", candidate.party);
  }

  return `candidate.html?${params.toString()}`;
}

function createCandidateCard(candidate, options = {}) {
  const card = document.createElement("a");
  card.className = "candidate-card candidate-card-link";
  card.href = buildCandidateHref(candidate, options.scope || "mayor");
  card.setAttribute("aria-label", `Details für ${candidate.name} öffnen`);
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
    mayorList.innerHTML = '<div class="empty-state">Keine Daten für Bürgermeisterkandidaten gefunden.</div>';
    return;
  }

  for (const candidate of ranked) {
    mayorList.appendChild(createCandidateCard(candidate, { scope: "mayor" }));
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
  const partyMap = new Map(parties.map((party) => [party.name, party]));
  const selectedPartyColor = partyMap.get(state.selectedParty)?.color || "transparent";

  const wrapper = document.createElement("div");
  wrapper.className = "party-select-wrap";
  wrapper.style.setProperty("--party-dot-color", selectedPartyColor);

  const dot = document.createElement("span");
  dot.className = "party-select-dot";
  dot.setAttribute("aria-hidden", "true");

  const selectElement = document.createElement("select");
  selectElement.className = "filter-select";
  selectElement.setAttribute("aria-label", "Partei auswählen");

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Alle Parteien";
  selectElement.appendChild(allOption);

  for (const party of parties) {
    const option = document.createElement("option");
    option.value = party.name;
    const seats = Number(party.seats || 0);
    const seatLabel = seats === 1 ? "Stadtrat" : "Stadträte";
    option.textContent = `${party.name} (${formatInteger(seats)} ${seatLabel})`;
    selectElement.appendChild(option);
  }

  selectElement.value = state.selectedParty;

  selectElement.addEventListener("change", () => {
    state.selectedParty = selectElement.value || "all";
    const nextPartyColor = partyMap.get(state.selectedParty)?.color || "transparent";
    wrapper.style.setProperty("--party-dot-color", nextPartyColor);
    persistUiState();
    renderCouncilList();
  });

  wrapper.appendChild(dot);
  wrapper.appendChild(selectElement);
  partyFilter.appendChild(wrapper);
}

function renderCouncilList() {
  councilList.innerHTML = "";

  const allCandidates = rankedCandidatesForArea(state.data?.council?.candidates || []);
  const partyMap = new Map((state.data?.council?.parties || []).map((party) => [party.name, party]));

  const visibleCandidates =
    state.selectedParty === "all"
      ? allCandidates
      : allCandidates.filter((candidate) => candidate.party === state.selectedParty);

  if (!visibleCandidates.length) {
    councilList.innerHTML = '<div class="empty-state">Keine Kandidaten für die gewählten Parteien.</div>';
    return;
  }

  for (const candidate of visibleCandidates) {
    const partyInfo = partyMap.get(candidate.party);
    councilList.appendChild(
      createCandidateCard(candidate, {
        color: partyInfo?.color,
        scope: "council",
      })
    );
  }
}

async function loadData() {
  const response = await fetch("data/final_results.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Könnte Daten nicht laden: HTTP ${response.status}`);
  }

  state.data = await response.json();
  pruneSelectedParty();

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
