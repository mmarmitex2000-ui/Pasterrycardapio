// tracker.js — Sistema de rastreamento de eventos da Pasterry
// Incluir em todas as páginas públicas: index.html, carrinho.html, status.html
// ⚠️ Deve ser incluído DEPOIS do firebase-app e firebase-firestore

(function() {
  if (typeof firebase === 'undefined') {
    console.warn('[tracker] Firebase não carregado ainda.');
    return;
  }

  const db = firebase.firestore();

  // ===== SESSÃO ANÔNIMA =====
  let sessaoId = sessionStorage.getItem('pasterry_sessao');
  if (!sessaoId) {
    sessaoId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('pasterry_sessao', sessaoId);
  }

  // ===== IDENTIFICADOR DE VISITANTE (persiste no navegador) =====
  let visitanteId = localStorage.getItem('pasterry_visitante');
  if (!visitanteId) {
    visitanteId = 'vis_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('pasterry_visitante', visitanteId);
  }

  // ===== FILA EM MEMÓRIA (evita perder eventos se a rede cair) =====
  const fila = [];
  let enviando = false;

  async function processarFila() {
    if (enviando || fila.length === 0) return;
    enviando = true;
    while (fila.length > 0) {
      const ev = fila.shift();
      try {
        await db.collection('eventos').add(ev);
      } catch (e) {
        console.warn('[tracker] Falha ao enviar evento, retornando à fila:', e);
        fila.unshift(ev);
        break;
      }
    }
    enviando = false;
  }

  // ===== FUNÇÃO PRINCIPAL =====
  window.trackEvent = function(tipo, dados) {
    if (!tipo) return;
    dados = dados || {};

    // Sanitiza: remove chaves com dados sensíveis (privacidade / LGPD)
    const bloqueados = ['nome', 'telefone', 'email', 'endereco', 'rua', 'numero', 'bairro', 'cpf', 'senha'];
    const dadosLimpos = {};
    Object.keys(dados).forEach(k => {
      if (bloqueados.includes(k.toLowerCase())) return;
      const v = dados[k];
      if (v === null || v === undefined) return;
      if (typeof v === 'object') {
        dadosLimpos[k] = Array.isArray(v) ? v.slice(0, 50) : v;
      } else {
        dadosLimpos[k] = v;
      }
    });

    const evento = {
      tipo: String(tipo).substring(0, 60),
      dados: dadosLimpos,
      sessaoId: sessaoId,
      visitanteId: visitanteId,
      pagina: (location.pathname.split('/').pop() || 'index.html'),
      url: location.href.substring(0, 200),
      userAgent: navigator.userAgent.substring(0, 140),
      tela: `${screen.width}x${screen.height}`,
      idioma: navigator.language || '',
      referencia: document.referrer ? document.referrer.substring(0, 200) : '',
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      criadoEmMs: Date.now(),
      dia: new Date().toISOString().slice(0, 10) // YYYY-MM-DD para agregação fácil
    };

    fila.push(evento);
    processarFila();
  };

  // ===== RASTREAMENTO AUTOMÁTICO =====
  // Visita à página
  window.trackEvent('page_view', {
    titulo: document.title,
    ref: document.referrer || ''
  });

  // Tempo na página (heartbeat a cada 30s)
  let segundos = 0;
  const heartbeat = setInterval(() => {
    segundos += 30;
    if (segundos === 30 || segundos % 60 === 0) {
      window.trackEvent('tempo_pagina', { segundos });
    }
  }, 30000);

  // Saiu da página
  window.addEventListener('beforeunload', () => {
    clearInterval(heartbeat);
    window.trackEvent('page_exit', { segundos_total: segundos });
  });

  console.log('[tracker] Pronto. Sessão:', sessaoId, '| Visitante:', visitanteId);
})();