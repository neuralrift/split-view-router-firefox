// Shared between content and background contexts.
// Keep small — no async, no APIs that differ across contexts.

function originOf(url) {
  if (!url || typeof url !== 'string') return '?';
  try {
    const u = new URL(url);
    if (u.origin === 'null') return u.protocol === 'about:' ? url : u.protocol;
    return u.origin;
  } catch (e) { return '?'; }
}

function getPairSplitState(highlightedCount, alreadyPaired) {
  if (highlightedCount !== 2) {
    return {
      title: "Pair split (select exactly 2 tabs first)",
      enabled: false
    };
  }
  if (alreadyPaired) {
    return {
      title: "Selected tabs are already paired",
      enabled: false
    };
  }
  return {
    title: "Pair selected tabs as split",
    enabled: true
  };
}

function getUnpairThisTabState(isPairedTab) {
  return isPairedTab
    ? {title: "Unpair this tab", enabled: true}
    : {title: "Unpair this tab", enabled: false};
}

function getUnpairAllState(hasPairs) {
  return hasPairs
    ? {title: "Unpair all", enabled: true}
    : {title: "Unpair all", enabled: false};
}

function getPauseResumeMenuState(isPairedTab, isPaused) {
  if (!isPairedTab) {
    return {title: "Pause routing", enabled: false};
  }
  return {
    title: isPaused ? "Resume routing" : "Pause routing",
    enabled: true
  };
}
