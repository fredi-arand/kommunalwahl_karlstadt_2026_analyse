const UI_STATE_STORAGE_KEY = "kommunalwahl.guiState.v1";

const scopeLabel = document.getElementById("candidateScope");
const nameLabel = document.getElementById("candidateName");
const partyLabel = document.getElementById("candidateParty");
const generatedAtLabel = document.getElementById("candidateGeneratedAt");
const kpiContainer = document.getElementById("candidateKpis");
const areaRanksContainer = document.getElementById("areaRanks");
const similarCandidatesSection = document.getElementById("similarCandidatesSection");
const similarCandidatesContainer = document.getElementById("similarCandidates");
const backLink = document.getElementById("backToOverview");
const candidateError = document.getElementById("candidateError");
const candidateContent = [...document.querySelectorAll(".candidate-content")];
const NAV_DEFAULT_UI_STATE = Object.freeze({
  activeTab: "mayor",
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

function areaViewCandidates(candidates, areaKey) {
  const ranked = sortCandidatesByArea(candidates, areaKey).map((candidate) => ({
    ...candidate,
    votesInArea: voteCountForArea(candidate, areaKey),
  }));

  const totalVotesInArea = ranked.reduce(
    (sum, candidate) => sum + Number(candidate.votesInArea || 0),
    0
  );

  return ranked.map((candidate) => ({
    ...candidate,
    percentInArea:
      totalVotesInArea > 0
        ? (Number(candidate.votesInArea || 0) / totalVotesInArea) * 100
        : 0,
  }));
}

function buildAreaPerformance(candidate, candidates, areaOptions) {
  const targetIdentity = candidateIdentity(candidate);

  return areaOptions.map((option) => {
    // For each row, emulate the same context as selecting this area in the overview
    // without applying party filtering.
    const rankedForArea = areaViewCandidates(candidates, option.key);
    const rankByIdentity = new Map(
      rankedForArea.map((rankedCandidate, index) => [
        candidateIdentity(rankedCandidate),
        index + 1,
      ])
    );
    const votesByIdentity = new Map(
      rankedForArea.map((rankedCandidate) => [
        candidateIdentity(rankedCandidate),
        Number(rankedCandidate.votesInArea || 0),
      ])
    );
    const percentByIdentity = new Map(
      rankedForArea.map((rankedCandidate) => [
        candidateIdentity(rankedCandidate),
        Number(rankedCandidate.percentInArea || 0),
      ])
    );
    const partyRankByIdentity = new Map();
    const partyCounter = new Map();
    for (const rankedCandidate of rankedForArea) {
      const partyName = rankedCandidate.party || "Unabhängig";
      const nextPartyRank = (partyCounter.get(partyName) || 0) + 1;
      partyCounter.set(partyName, nextPartyRank);
      partyRankByIdentity.set(candidateIdentity(rankedCandidate), nextPartyRank);
    }

    return {
      key: option.key,
      label: option.label,
      party: candidate.party || "Unabhängig",
      votes: votesByIdentity.get(targetIdentity) || 0,
      percent: percentByIdentity.get(targetIdentity) || 0,
      rank: rankByIdentity.get(targetIdentity) || candidates.length,
      partyRank: partyRankByIdentity.get(targetIdentity) || candidates.length,
      comparedCandidates: candidates.length,
    };
  });
}

function sortAreaPerformanceByRank(areaPerformance) {
  return [...areaPerformance].sort((left, right) => {
    const rankDiff = left.rank - right.rank;
    if (rankDiff !== 0) {
      return rankDiff;
    }
    const percentDiff = right.percent - left.percent;
    if (percentDiff !== 0) {
      return percentDiff;
    }
    return right.votes - left.votes;
  });
}

function collectAreaKeysForSimilarity(candidates) {
  const keys = new Set();
  for (const candidate of candidates) {
    const areaVotes = candidate?.areaVotes || {};
    for (const areaKey of Object.keys(areaVotes)) {
      keys.add(areaKey);
    }
  }
  return [...keys].sort((left, right) => left.localeCompare(right, "de"));
}

function buildAreaVoteVector(candidate, areaKeys) {
  return areaKeys.map((areaKey) => Number(candidate?.areaVotes?.[areaKey] || 0));
}

function cosineSimilarity(vectorA, vectorB) {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < vectorA.length; index += 1) {
    const valueA = Number(vectorA[index] || 0);
    const valueB = Number(vectorB[index] || 0);
    dotProduct += valueA * valueB;
    magnitudeA += valueA * valueA;
    magnitudeB += valueB * valueB;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function buildSimilarCandidates(targetCandidate, candidates, maxItems = 10) {
  const areaKeys = collectAreaKeysForSimilarity(candidates);
  const targetVector = buildAreaVoteVector(targetCandidate, areaKeys);
  const targetKey = candidateIdentity(targetCandidate);

  const rankedCandidates = candidates
    .filter((candidate) => candidateIdentity(candidate) !== targetKey)
    .map((candidate) => {
      const similarity = cosineSimilarity(targetVector, buildAreaVoteVector(candidate, areaKeys));
      const cosineDistance = 1 - similarity;
      return {
        ...candidate,
        similarity,
        cosineDistance,
      };
    })
    .sort((left, right) => {
      const similarityDiff = right.similarity - left.similarity;
      if (similarityDiff !== 0) {
        return similarityDiff;
      }

      const voteDiff = Number(right.votes || 0) - Number(left.votes || 0);
      if (voteDiff !== 0) {
        return voteDiff;
      }

      return (left.name || "").localeCompare(right.name || "", "de");
    })
    .slice(0, maxItems);

  console.table(
    rankedCandidates.map((candidate) => ({
      name: candidate.name,
      party: candidate.party,
      cosineSimilarity: Number(candidate.similarity.toFixed(6)),
      oneMinusCosineSimilarity: Number(candidate.cosineDistance.toFixed(6)),
    }))
  );

  return rankedCandidates;
}

function formatSimilarity(value) {
  return Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function candidateDetailHref(scope, candidate) {
  const query = new URLSearchParams({
    scope,
    name: candidate.name || "",
    party: candidate.party || "",
  });
  return `candidate.html?${query.toString()}`;
}

function renderSimilarCandidates(container, entries, scope) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">Keine ähnlichen Kandidaten gefunden.</div>';
    return;
  }

  for (const entry of entries) {
    const rowLink = document.createElement("a");
    rowLink.className = "area-rank-row area-rank-row-clickable similar-candidate-link";
    rowLink.href = candidateDetailHref(scope, entry);
    rowLink.setAttribute("aria-label", `${entry.name} öffnen`);

    const main = document.createElement("div");
    main.className = "area-rank-main";

    const title = document.createElement("h3");
    title.className = "area-rank-title";
    title.textContent = entry.name || "Unbekannt";

    const subtitle = document.createElement("p");
    subtitle.className = "area-rank-subtitle";
    subtitle.textContent = `${entry.party || "Unabhängig"} • Gesamt #${formatInteger(entry.rank)}`;

    main.appendChild(title);
    main.appendChild(subtitle);

    rowLink.appendChild(main);
    container.appendChild(rowLink);
  }
}

function buildPartyRankByIdentity(candidates, areaKey = "all") {
  const ranked = sortCandidatesByArea(candidates, areaKey);
  const partyRankByIdentity = new Map();
  const partyCounter = new Map();

  for (const rankedCandidate of ranked) {
    const partyName = rankedCandidate.party || "Unabhängig";
    const nextPartyRank = (partyCounter.get(partyName) || 0) + 1;
    partyCounter.set(partyName, nextPartyRank);
    partyRankByIdentity.set(candidateIdentity(rankedCandidate), nextPartyRank);
  }

  return partyRankByIdentity;
}

function renderKpis(candidate, scope, partyRankAllAreas) {
  const items = [
    {
      label: "Stimmen gesamt",
      value: formatInteger(candidate.votes),
    },
    {
      label: "Gesamt",
      value: `#${formatInteger(candidate.rank)}`,
    },
  ];

  if (scope === "council" && Number.isFinite(Number(partyRankAllAreas))) {
    items.push({
      label: `${candidate.party || "Unabhängig"}`,
      value: `#${formatInteger(partyRankAllAreas)}`,
    });
  }

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

function readNavigationStateSnapshot() {
  try {
    const raw = localStorage.getItem(UI_STATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    return {
      activeTab:
        parsed?.activeTab === "mayor" || parsed?.activeTab === "council"
          ? parsed.activeTab
          : NAV_DEFAULT_UI_STATE.activeTab,
      selectedParty:
        typeof parsed?.selectedParty === "string" && parsed.selectedParty.length > 0
          ? parsed.selectedParty
          : NAV_DEFAULT_UI_STATE.selectedParty,
      selectedAreaMayor:
        typeof parsed?.selectedAreaMayor === "string" && parsed.selectedAreaMayor.length > 0
          ? parsed.selectedAreaMayor
          : NAV_DEFAULT_UI_STATE.selectedAreaMayor,
      selectedAreaCouncil:
        typeof parsed?.selectedAreaCouncil === "string" && parsed.selectedAreaCouncil.length > 0
          ? parsed.selectedAreaCouncil
          : NAV_DEFAULT_UI_STATE.selectedAreaCouncil,
    };
  } catch (_error) {
    return { ...NAV_DEFAULT_UI_STATE };
  }
}

function writeNavigationState(scope, areaKey) {
  const snapshot = readNavigationStateSnapshot();
  snapshot.activeTab = scope;

  if (scope === "mayor") {
    snapshot.selectedAreaMayor = areaKey;
  } else {
    snapshot.selectedAreaCouncil = areaKey;
  }

  try {
    localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (_error) {
    // Ignore storage failures.
  }
}

function navigateToOverviewWithArea(scope, areaKey) {
  writeNavigationState(scope, areaKey);
  window.location.href = "index.html";
}

function renderAreaRanking(container, entries, scope) {
  container.innerHTML = "";

  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">Keine Bereichsdaten vorhanden.</div>';
    return;
  }

  for (const entry of entries) {
    const row = document.createElement("article");
    row.className = "area-rank-row area-rank-row-clickable";
    row.setAttribute("role", "link");
    row.tabIndex = 0;
    row.setAttribute("aria-label", `${entry.label} in Übersicht öffnen`);
    row.addEventListener("click", () => navigateToOverviewWithArea(scope, entry.key));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigateToOverviewWithArea(scope, entry.key);
      }
    });

    const main = document.createElement("div");
    main.className = "area-rank-main";

    const title = document.createElement("h3");
    title.className = "area-rank-title";
    title.textContent = entry.label;

    const subtitle = document.createElement("p");
    subtitle.className = "area-rank-subtitle";
    subtitle.textContent = `Gesamt: ${entry.rank}, ${entry.party}: ${entry.partyRank}`;

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
    const snapshot = readNavigationStateSnapshot();
    snapshot.activeTab = scope;
    try {
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

  if (similarCandidatesSection) {
    similarCandidatesSection.hidden = scope !== "council";
  }

  primeBackNavigation(scope);

  try {
    const data = await loadData();
    const baseCandidates = scope === "mayor" ? data?.mayor?.candidates || [] : data?.council?.candidates || [];
    const candidate = findCandidate(baseCandidates, candidateName, partyName);
    if (!candidate) {
      showError("Der ausgewählte Kandidat wurde in den Daten nicht gefunden.");
      return;
    }

    const areaOptions = data?.areas?.options || [{ key: "all", label: "Alle Stimmen" }];
    const areaPerformanceOptions = areaOptions.filter((option) => option?.key && option.key !== "all");
    const partyRankByIdentityAllAreas = buildPartyRankByIdentity(baseCandidates, "all");
    const partyRankAllAreas = partyRankByIdentityAllAreas.get(candidateIdentity(candidate)) || null;

    const areaPerformance = buildAreaPerformance(candidate, baseCandidates, areaPerformanceOptions);
    const rankedAreas = sortAreaPerformanceByRank(areaPerformance);

    const electionLabel = scope === "mayor" ? "Bürgermeister" : "Stadtrat";
    scopeLabel.textContent = `${data?.meta?.location || "Karlstadt"} • ${electionLabel}`;
    nameLabel.textContent = candidate.name;
    const headerPartyName = candidate.party || "Unabhängig";
    const listPosition = Number(candidate.id || 0);
    partyLabel.textContent =
      scope === "council" && listPosition > 0
        ? `${headerPartyName}, Listenplatz ${formatInteger(listPosition)}`
        : headerPartyName;
    generatedAtLabel.textContent = formatGeneratedAt(data?.meta?.generatedAt);

    renderKpis(candidate, scope, partyRankAllAreas);
    renderAreaRanking(areaRanksContainer, rankedAreas, scope);

    if (scope === "council" && similarCandidatesContainer && similarCandidatesSection) {
      const similarCandidates = buildSimilarCandidates(candidate, baseCandidates, 10);
      similarCandidatesSection.hidden = false;
      renderSimilarCandidates(similarCandidatesContainer, similarCandidates, scope);
    }
  } catch (error) {
    showError(error.message || "Fehler beim Laden der Kandidatendaten.");
  }
}

bootstrap();
