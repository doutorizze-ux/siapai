window.SIAPValidation = (() => {
  const C = window.SIAPConfig;
  const U = window.SIAPUtils;

  function getMetodologiaValue() {
    return (document.querySelector(C.SELECTORS.METODOLOGIA)?.value || '').trim();
  }

  function getAvaliacaoValue() {
    return (document.querySelector(C.SELECTORS.AVALIACAO)?.value || '').trim();
  }

  function getConteudoPersonalizadoValue() {
    return (document.querySelector(C.SELECTORS.CUSTOM_CONTENT_TEXTAREA)?.value || '').trim();
  }

  function countHabilidadesAdicionadas() {
    const rows = Array.from(
      document.querySelectorAll(`${C.SELECTORS.HABILIDADES_GRID} tr td:first-child, ${C.SELECTORS.HABILIDADES_GRID} td`)
    );

    return new Set(
      rows
        .map(el => U.normalizeText(el.innerText || el.textContent || ''))
        .filter(Boolean)
    ).size;
  }

  function getConteudoContainers() {
    const resolver = window.SIAPConteudos?.getConteudosContainers;
    if (typeof resolver === 'function') {
      const resolved = resolver();
      if (Array.isArray(resolved) && resolved.length) return resolved;
    }

    const fallback = document.querySelector(C.SELECTORS.CONTEUDOS_BOX);
    return fallback ? [fallback] : [];
  }

  function countConteudosInContainer(container) {
    if (!container) return 0;

    const texts = Array.from(container.querySelectorAll('*'))
      .map(el => U.normalizeText(el.innerText || el.textContent || ''))
      .filter(Boolean)
      .filter(t => t.length > 1)
      .filter(t => !t.includes('objetivos de conhecimentos/ conteúdos'));

    if (texts.length) {
      return new Set(texts).size;
    }

    const raw = U.normalizeText(container.innerText || container.textContent || '');
    if (raw && !raw.includes('objetivos de conhecimentos/ conteúdos')) return 1;

    const html = (container.innerHTML || '').trim();
    if (html) return 1;

    return 0;
  }

  function countConteudosAdicionados() {
    const structuralCounter = window.SIAPConteudos?.getSelectedConteudoCount;
    if (typeof structuralCounter === 'function') {
      const count = Number(structuralCounter() || 0);
      if (Number.isFinite(count)) return Math.max(0, count);
    }

    const containers = getConteudoContainers();
    if (!containers.length) return 0;

    return Math.max(0, ...containers.map(countConteudosInContainer));
  }

  function validarAntesDeSalvar() {
    const metodologiaOk = getMetodologiaValue().length > 0;
    const avaliacaoOk = getAvaliacaoValue().length > 0;
    const qtdHabilidades = countHabilidadesAdicionadas();
    const qtdConteudos = countConteudosAdicionados();
    const conteudoPersonalizado = getConteudoPersonalizadoValue();
    const conteudosOk = qtdConteudos > 0 || conteudoPersonalizado.length > 0;

    return {
      metodologiaOk,
      avaliacaoOk,
      habilidadesOk: qtdHabilidades > 0,
      conteudosOk,
      qtdHabilidades,
      qtdConteudos,
      conteudoPersonalizado,
      podeSalvar: metodologiaOk && avaliacaoOk && qtdHabilidades > 0 && conteudosOk
    };
  }

  return {
    getMetodologiaValue,
    getAvaliacaoValue,
    getConteudoPersonalizadoValue,
    countHabilidadesAdicionadas,
    countConteudosAdicionados,
    validarAntesDeSalvar
  };
})();
