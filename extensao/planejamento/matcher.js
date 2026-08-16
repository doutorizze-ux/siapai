window.SIAPMatcher = (() => {
  const U = window.SIAPUtils;
  function similarityScoreAdvanced(targetText, candidateText) {
    const target = U.normalizeCompare(targetText);
    const candidate = U.normalizeCompare(candidateText);
    if (!target || !candidate) return 0;
    if (target === candidate) return 1000;
    if (candidate.includes(target)) return 900;
    if (target.includes(candidate)) return 850;
    const targetWords = U.tokenize(target);
    const candidateWords = U.tokenize(candidate);
    if (!targetWords.length || !candidateWords.length) return 0;
    let score = 0;
    const candidateSet = new Set(candidateWords);
    for (const word of targetWords) {
      if (candidateSet.has(word)) { score += 25; continue; }
      for (const cWord of candidateWords) {
        if (cWord.startsWith(word) || word.startsWith(cWord)) { score += 12; break; }
        if (cWord.includes(word) || word.includes(cWord)) { score += 7; break; }
      }
    }
    const intersection = targetWords.filter(w => candidateSet.has(w)).length;
    score += (intersection / Math.max(targetWords.length, 1)) * 100;
    return score;
  }
  function bestTextMatchAdvanced(targetText, elements, getTextFn) {
    let best = null, bestScore = -1;
    for (const el of elements) {
      const txt = getTextFn ? getTextFn(el) : U.normalizeText(el.innerText || el.textContent || '');
      if (!txt) continue;
      const score = similarityScoreAdvanced(targetText, txt);
      if (score > bestScore) { bestScore = score; best = { el, text: txt, score }; }
    }
    return best;
  }
  return { similarityScoreAdvanced, bestTextMatchAdvanced };
})();
