const UI_STATE_STORAGE_KEY = "kommunalwahl.guiState.v1";

const scopeLabel = document.getElementById("candidateScope");
const nameLabel = document.getElementById("candidateName");
const partyLabel = document.getElementById("candidateParty");
const generatedAtLabel = document.getElementById("candidateGeneratedAt");
const kpiContainer = document.getElementById("candidateKpis");
const topAreasContainer = document.getElementById("topAreas");
const flopAreasContainer = document.getElementById("flopAreas");
const backLink = document.getElementById("backToOverview");
const candidateError = document.getElementById("candidateError");
const candidateContent = [...document.querySelectorAll(".candidate-content")];
const DEFAULT_UI_STATE = Object.freeze({
  selectedParty: "all",
  selectedAreaMayor: "all",
  selectedAreaCouncil: "all",
});

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

function candidateIdentity(candidate) {
  return `${candidate?.party || ""}::${candidate?.name || ""}`;
}

function voteCountForArea(candidate, areaKey) {
  if (areaKey === "all") {
    return Number(candidate?.votes || 0);
  }
  return Number(candidate?.areaVotes?.[areaKey] || 0);
}

function normalizeScope(scope) {
  if (scope === "mayor" || scope === "council") {
    return scope;
  }
  return null;
}

function findCandidate(candidates, candidateName, partyName) {
  return (
    candidates.find(
      (candidate) =>
        candidate.name === candidateName &&
        (partyName ? candidate.party === partyName : true)
    ) || null
  );
}

function sortCandidatesByArea(candidates, areaKey) {
  return [...candidates].sort((left, right) => {
    const voteDiff = voteCountForArea(right, areaKey) - voteCountForArea(left, areaKey);
    if (voteDiff !== 0) {
      return voteDiff;
    }

    const totalVoteDiff = Number(right.votes || 0) - Number(left.votes || 0);
    if (totalVoteDiff !== 0) {
      return totalVoteDiff;
    }

    const partyDiff = (left.party || "").localeCompare(right.party || "", "de");
    if (partyDiff !== 0) {
      return partyDiff;
    }

    return (left.name || "").localeCompare(right.name || "", "de");
  });
}

function readStoredUiState() {
  try {
    const raw = localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_UI_STATE };
    }

    const parsed = JSON.parse(raw);
    const selectedParty =
      typeof parsed?.selectedParty === "string" && parsed.selectedParty.length > 0
        ? parsed.selectedParty
        : DEFAULT_UI_STATE.selectedParty;
    const selectedAreaMayor =
      typeof parsed?.selectedAreaMayor === "string" && parsed.selectedAreaMayor.length > 0
        ? parsed.selectedAreaMayor
        : DEFAULT_UI_STATE.selectedAreaMayor;
    const selectedAreaCouncil =
      typeof parsed?.selectedAreaCouncil === "string" && parsed.selectedAreaCouncil.length > 0
        ? parsed.selectedAreaCouncil
        : DEFAULT_UI_STATE.selectedAreaCouncil;

    return {
      selectedParty,
      selectedAreaMayor,
      selectedAreaCouncil,
    };
  } catch (_error) {
    return { ...DEFAULT_UI_STATE };
  }
}

function rankedCandidatesForArea(candidates, areaKey) {
  const withVotes = candidates.map((candidate) => ({
    ...candidate,
    votes: voteCountForArea(candidate, areaKey),
  }));

  withVotes.sort((left, right) => {
    const voteDiff = right.votes - left.votes;
    if (voteDiff !== 0) {
      return voteDiff;
    }

    const partyDiff = (left.party || "").localeCompare(right.party || "", "de");
    if (partyDiff !== 0) {
      return partyDiff;
    }

    return (left.name || "").localeCompare(right.name || "", "de");
  });

  return withVotes.map((candidate, index) => ({
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

function buildAreaPerformance(candidate, candidates, areaOptions) {
  const targetIdentity = candidateIdentity(candidate);

  return areaOptions.map((option) => {
    const rankedForArea = sortCandidatesByArea(candidates, option.key);
    const areaTotalVotes = rankedForArea.reduce(
      (sum, rankedCandidate) => sum + voteCountForArea(rankedCandidate, option.key),
      0
    );
    const rankByIdentity = new Map(
      rankedForArea.map((rankedCandidate, index) => [
        candidateIdentity(rankedCandidate),
        index + 1,
      ])
    );

    return {
      key: option.key,
      label: option.label,
      votes: voteCountForArea(candidate, option.key),
      percent:
        areaTotalVotes > 0
          ? (voteCountForArea(candidate, option.key) / areaTotalVotes) * 100
          : 0,
      rank: rankByIdentity.get(targetIdentity) || candidates.length,
      comparedCandidates: candidates.length,
    };
  });
}

function pickTopAndFlopAreas(areaPerformance) {
  const top = [...areaPerformance]
    .sort((left, right) => {
      const rankDiff = left.rank - right.rank;
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return right.votes - left.votes;
    })
    .slice(0, 3);

  const flop = [...areaPerformance]
    .sort((left, right) => {
      const rankDiff = right.rank - left.rank;
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return left.votes - right.votes;
    })
    .slice(0, 3);

  return { top, flop };
}

function renderKpis(candidate, candidateCount) {
  const items = [
    {
      label: "Gesamtrang",
      value: `#${formatInteger(candidate.rank)}`,
    },
    {
      label: "Stimmen gesamt",
      value: formatInteger(candidate.votes),
    },
    {
      label: "Kandidaten gesamt",
      value: formatInteger(candidateCount),
    },
  ];

  if (candidate.percent !== null && candidate.percent !== undefined) {
    items.push({
      label: "Stimmenanteil",
      value: formatPercent(candidate.percent),
    });
  }

  kpiContainer.innerHTML = "";
  for (const item of items) {
    const card = document.createElement("section");
    card.className = "summary-card";
    card.innerHTML = `
      <p class="summary-label">${item.label}</p>
      <p class="summary-value">${item.value}</p>
    `;
    kpiContainer.appendChild(card);
  }
}

function renderAreaRanking(container, entries) {
  container.innerHTML = "";

  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">Keine Bereichsdaten vorhanden.</div>';
    return;
  }

  for (const entry of entries) {
    const row = document.createElement("article");
    row.className = "area-rank-row";

    const main = document.createElement("div");
    main.className = "area-rank-main";

    const title = document.createElement("h3");
    title.className = "area-rank-title";
    title.textContent = entry.label;

    const subtitle = document.createElement("p");
    subtitle.className = "area-rank-subtitle";
    subtitle.textContent = `Rang ${entry.rank} von ${entry.comparedCandidates}`;

    main.appendChild(title);
    main.appendChild(subtitle);

    const side = document.createElement("div");
    side.className = "area-rank-side";

    const voteValue = document.createElement("p");
    voteValue.className = "area-rank-votes";
    voteValue.textContent = formatInteger(entry.votes);

    const voteLabel = document.createElement("p");
    voteLabel.className = "area-rank-vote-label";
    voteLabel.textContent = `Stimmen (${formatPercent(entry.percent)})`;

    side.appendChild(voteValue);
    side.appendChild(voteLabel);

    row.appendChild(main);
    row.appendChild(side);
    container.appendChild(row);
  }
}

function showError(message) {
  candidateError.textContent = message;
  candidateError.hidden = false;
  for (const section of candidateContent) {
    section.hidden = true;
  }
}

function primeBackNavigation(scope) {
  if (!backLink) {
    return;
  }

  backLink.addEventListener("click", () => {
    try {
      const raw = localStorage.getItem(UI_STATE_STORAGE_KEY);
      const snapshot = raw ? JSON.parse(raw) : {};
      snapshot.activeTab = scope;
      localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (_error) {
      // Ignore storage failures.
    }
  });
}

async function loadData() {
  const response = await fetch("data/final_results.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Könnte Daten nicht laden: HTTP ${response.status}`);
  }
  return response.json();
}

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const scope = normalizeScope(params.get("scope"));
  const candidateName = params.get("name");
  const partyName = params.get("party");

  if (!scope || !candidateName) {
    showError("Ungültiger Kandidatenlink. Bitte über die Übersicht neu aufrufen.");
    return;
  }

  primeBackNavigation(scope);

  try {
    const data = await loadData();
    const uiState = readStoredUiState();
    const areaOptions = data?.areas?.options || [{ key: "all", label: "Alle Stimmen" }];
    const validAreaKeys = new Set(areaOptions.map((option) => option.key));

    const selectedArea =
      scope === "mayor" ? uiState.selectedAreaMayor : uiState.selectedAreaCouncil;
    const resolvedArea = validAreaKeys.has(selectedArea) ? selectedArea : "all";

    const baseCandidates = scope === "mayor" ? data?.mayor?.candidates || [] : data?.council?.candidates || [];
    const rankedForArea = rankedCandidatesForArea(baseCandidates, resolvedArea);
    const visibleCandidates =
      scope === "council" && uiState.selectedParty !== "all"
        ? rankedForArea.filter((entry) => entry.party === uiState.selectedParty)
        : rankedForArea;
    const candidatesWithPercentages = addViewPercentages(visibleCandidates);

    const candidate = findCandidate(candidatesWithPercentages, candidateName, partyName);
    if (!candidate) {
      showError("Der ausgewählte Kandidat wurde in den Daten nicht gefunden.");
      return;
    }

    const areaPerformanceOptions = areaOptions.filter((option) => option?.key && option.key !== "all");

    const areaPerformance = buildAreaPerformance(candidate, rankedForArea, areaPerformanceOptions);
    const { top, flop } = pickTopAndFlopAreas(areaPerformance);

    const electionLabel = scope === "mayor" ? "Bürgermeister" : "Stadtrat";
    scopeLabel.textContent = `${data?.meta?.location || "Karlstadt"} • ${electionLabel}`;
    nameLabel.textContent = candidate.name;
    partyLabel.textContent = candidate.party || "Unabhängig";
    generatedAtLabel.textContent = formatGeneratedAt(data?.meta?.generatedAt);

    renderKpis(candidate, rankedForArea.length);
    renderAreaRanking(topAreasContainer, top);
    renderAreaRanking(flopAreasContainer, flop);
  } catch (error) {
    showError(error.message || "Fehler beim Laden der Kandidatendaten.");
  }
}

bootstrap();
