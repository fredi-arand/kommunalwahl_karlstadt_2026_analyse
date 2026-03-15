const DEFAULT_UI_STATE = Object.freeze({
  activeTab: "mayor",
  selectedParty: "all",
  selectedAreaMayor: "all",
  selectedAreaCouncil: "all",
});

const state = {
  data: null,
  activeTab: DEFAULT_UI_STATE.activeTab,
  selectedParty: DEFAULT_UI_STATE.selectedParty,
  selectedAreaMayor: DEFAULT_UI_STATE.selectedAreaMayor,
  selectedAreaCouncil: DEFAULT_UI_STATE.selectedAreaCouncil,
};

const tabButtons = [...document.querySelectorAll(".tab-button")];
const panels = [...document.querySelectorAll("[data-panel]")];
const summaryCards = document.getElementById("summaryCards");
const mayorList = document.getElementById("mayorList");
const councilList = document.getElementById("councilList");
const partyFilter = document.getElementById("partyFilter");
const areaSelectMayor = document.getElementById("areaSelectMayor");
const areaSelectCouncil = document.getElementById("areaSelectCouncil");
const UI_STATE_STORAGE_KEY = "kommunalwahl.guiState.v1";

function resetUiState(clearStoredState = true) {
  state.activeTab = DEFAULT_UI_STATE.activeTab;
  state.selectedParty = DEFAULT_UI_STATE.selectedParty;
  state.selectedAreaMayor = DEFAULT_UI_STATE.selectedAreaMayor;
  state.selectedAreaCouncil = DEFAULT_UI_STATE.selectedAreaCouncil;

  if (clearStoredState) {
    try {
      localStorage.removeItem(UI_STATE_STORAGE_KEY);
    } catch (_error) {
      // Ignore storage failures (private mode, blocked storage).
    }
  }
}

function getAreaOptions() {
  return state.data?.areas?.options || [{ key: "all", label: "Alle Stimmen" }];
}

function persistUiState() {
  const snapshot = {
    activeTab: state.activeTab,
    selectedAreaMayor: state.selectedAreaMayor,
    selectedAreaCouncil: state.selectedAreaCouncil,
    selectedParty: state.selectedParty,
  };

  try {
    localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (_error) {
    // Ignore storage failures (private mode, blocked storage, quota limits).
  }
}

function restoreUiState() {
  const validTabs = new Set(tabButtons.map((button) => button.dataset.tab).filter(Boolean));

  try {
    const raw = localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    const isValidSnapshot =
      typeof parsed?.activeTab === "string" &&
      validTabs.has(parsed.activeTab) &&
      typeof parsed?.selectedParty === "string" &&
      parsed.selectedParty.length > 0 &&
      typeof parsed?.selectedAreaMayor === "string" &&
      parsed.selectedAreaMayor.length > 0 &&
      typeof parsed?.selectedAreaCouncil === "string" &&
      parsed.selectedAreaCouncil.length > 0;

    if (!isValidSnapshot) {
      resetUiState(true);
      return;
    }

    state.activeTab = parsed.activeTab;
    state.selectedParty = parsed.selectedParty;
    state.selectedAreaMayor = parsed.selectedAreaMayor;
    state.selectedAreaCouncil = parsed.selectedAreaCouncil;
  } catch (_error) {
    resetUiState(true);
  }
}

function validateUiStateAgainstData() {
  const validAreaKeys = new Set(getAreaOptions().map((option) => option.key));
  const validPartyNames = new Set((state.data?.council?.parties || []).map((party) => party.name));

  const hasValidAreas =
    validAreaKeys.has(state.selectedAreaMayor) && validAreaKeys.has(state.selectedAreaCouncil);
  const hasValidParty = state.selectedParty === "all" || validPartyNames.has(state.selectedParty);

  if (!hasValidAreas || !hasValidParty) {
    resetUiState(true);
    return false;
  }

  return true;
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

function candidateVotesForArea(candidate, areaKey) {
  if (areaKey === "all") {
    return Number(candidate.votes || 0);
  }
  return Number(candidate.areaVotes?.[areaKey] || 0);
}

function rankedCandidatesForArea(candidates, areaKey) {
  const withAreaVotes = candidates.map((candidate) => ({
    ...candidate,
    votes: candidateVotesForArea(candidate, areaKey),
  }));

  withAreaVotes.sort((left, right) => right.votes - left.votes);
  return withAreaVotes.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));
}

function addViewPercentages(candidates) {
  const totalVotes = candidates.reduce((sum, candidate) => sum + Number(candidate.votes || 0), 0);

  return candidates.map((candidate) => ({
    ...candidate,
    percent: totalVotes > 0 ? (Number(candidate.votes || 0) / totalVotes) * 100 : 0,
  }));
}

function getRankPillLabel(areaKey) {
  if (areaKey === "all") {
    return "Gesamt";
  }
  const option = getAreaOptions().find((opt) => opt.key === areaKey);
  return option?.label || areaKey;
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

  const partyText =
    options.partyRank === null || options.partyRank === undefined
      ? candidate.party
      : `${candidate.party}: ${options.partyRank}`;

  // \u00a0 is a non-breaking space to keep the label and number on one line inside the pill.
  const rankText = options.rankLabel !== undefined ? `${options.rankLabel}:\u00a0${candidate.rank}` : candidate.rank;

  card.innerHTML = `
    <div class="candidate-main">
      <div class="name-line">
        <span class="rank-pill">${rankText}</span>
        <h3 class="candidate-name">${candidate.name}</h3>
      </div>
      <p class="candidate-party">${partyText}</p>
    </div>
    <div class="vote-column">
      <p class="vote-value">${formatInteger(candidate.votes)}</p>
      <p class="vote-label">Stimmen (${formatPercent(candidate.percent)})</p>
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
  const ranked = addViewPercentages(rankedCandidatesForArea(candidates, state.selectedAreaMayor));

  if (!ranked.length) {
    mayorList.innerHTML = '<div class="empty-state">Keine Daten für Bürgermeisterkandidaten gefunden.</div>';
    return;
  }

  for (const candidate of ranked) {
    mayorList.appendChild(createCandidateCard(candidate, { scope: "mayor", rankLabel: getRankPillLabel(state.selectedAreaMayor) }));
  }
}

function renderAreaFilter() {
  if (!areaSelectMayor && !areaSelectCouncil) {
    return;
  }

  const options = getAreaOptions();

  const fillSelect = (selectElement, selectedValue) => {
    if (!selectElement) {
      return;
    }

    selectElement.innerHTML = "";
    for (const option of options) {
      const optionElement = document.createElement("option");
      optionElement.value = option.key;
      optionElement.textContent = option.label;
      if (option.key === selectedValue) {
        optionElement.selected = true;
      }
      selectElement.appendChild(optionElement);
    }
  };

  fillSelect(areaSelectMayor, state.selectedAreaMayor);
  fillSelect(areaSelectCouncil, state.selectedAreaCouncil);
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
    state.selectedParty = selectElement.value;
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

  const allCandidates = rankedCandidatesForArea(state.data?.council?.candidates || [], state.selectedAreaCouncil);
  const partyMap = new Map((state.data?.council?.parties || []).map((party) => [party.name, party]));
  const partyRankCounter = new Map();
  const partyRankByCandidate = new Map();

  for (const candidate of allCandidates) {
    const nextRank = (partyRankCounter.get(candidate.party) || 0) + 1;
    partyRankCounter.set(candidate.party, nextRank);
    partyRankByCandidate.set(`${candidate.party}::${candidate.name}`, nextRank);
  }

  const visibleCandidates =
    state.selectedParty === "all"
      ? allCandidates
      : allCandidates.filter((candidate) => candidate.party === state.selectedParty);

  const visibleWithPercentages = addViewPercentages(visibleCandidates);

  if (!visibleWithPercentages.length) {
    councilList.innerHTML = '<div class="empty-state">Keine Kandidaten für die gewählten Parteien.</div>';
    return;
  }

  for (const candidate of visibleWithPercentages) {
    const partyInfo = partyMap.get(candidate.party);
    councilList.appendChild(
      createCandidateCard(candidate, {
        color: partyInfo?.color,
        scope: "council",
        partyRank: partyRankByCandidate.get(`${candidate.party}::${candidate.name}`),
        rankLabel: getRankPillLabel(state.selectedAreaCouncil),
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
  validateUiStateAgainstData();

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
  if (areaSelectMayor) {
    areaSelectMayor.addEventListener("change", () => {
      state.selectedAreaMayor = areaSelectMayor.value;
      persistUiState();
      renderMayorList();
    });
  }

  if (areaSelectCouncil) {
    areaSelectCouncil.addEventListener("change", () => {
      state.selectedAreaCouncil = areaSelectCouncil.value;
      persistUiState();
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
