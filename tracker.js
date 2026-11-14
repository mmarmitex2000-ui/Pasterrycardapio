// tracker.js — Sistema de rastreamento de eventos da Pasterry
// Deve ser incluído DEPOIS de config.js + firebase-app + firebase-firestore

(function() {
  if (typeof firebase === 'undefined') {
    console.warn('[tracker] Firebase não carregado ainda. Abortando tracker.');
    return;
  }

  // ✅ Garante inicialização sem duplicar (config.js já inicializa)
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }
  } catch (e) {
    console.error('[tracker] Erro ao inicializar Firebase:', e);
    return;
  }

  const db = firebase.firestore();

  // ===== SESSÃO ANÔNIMA =====
  let sessaoId = sessionStorage.getItem('pasterry_sessao');
  if (!sessaoId) {
    sessaoId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('pasterry_sessao', sessaoId);
  }

  // ===== IDENTIFICADOR DE VISITANTE =====
  let visitanteId = localStorage.getItem('pasterry_visitante');
  if (!visitanteId) {
    visitanteId = 'vis_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('pasterry_visitante', visitanteId);
  }

  // ===== TELEFONE DO CLIENTE =====
  let telefoneCliente = localStorage.getItem('pasterry_telefone') || '';

  // ===== FILA EM MEMÓRIA =====
  const fila = [];
  let enviando = false;

  async function processarFila() {
    if (enviando || fila.length === 0) return;
    enviando = true;
    while (fila.length > 0) {
      const ev = fila[0];
      try {
        await db.collection('eventos').add(ev);
        fila.shift();
      } catch (e) {
        console.warn('[tracker] Falha ao enviar evento:', e.code || e.message);
        if (e.code === 'permission-denied') {
          fila.shift(); // descarta para não travar a fila
        }
        break;
      }
    }
    enviando = false;
  }

  // ===== FUNÇÃO PRINCIPAL =====
  window.trackEvent = function(tipo, dados) {
    if (!tipo) return;
    dados = dados || {};

    if (dados.telefone) {
      telefoneCliente = dados.telefone;
      localStorage.setItem('pasterry_telefone', telefoneCliente);
    }

    const bloqueados = ['nome', 'email', 'endereco', 'rua', 'numero', 'bairro', 'cpf', 'senha'];
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
      telefone: telefoneCliente,
      pagina: (location.pathname.split('/').pop() || 'index.html'),
      url: location.href.substring(0, 200),
      userAgent: navigator.userAgent.substring(0, 140),
      tela: `${screen.width}x${screen.height}`,
      idioma: navigator.language || '',
      referencia: document.referrer ? document.referrer.substring(0, 200) : '',
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      criadoEmMs: Date.now(),
      dia: new Date().toISOString().slice(0, 10)
    };

    fila.push(evento);
    processarFila();
  };

  // ===== RASTREAMENTO AUTOMÁTICO =====
  window.trackEvent('page_view', {
    titulo: document.title,
    ref: document.referrer || ''
  });

  let segundos = 0;
  const heartbeat = setInterval(() => {
    segundos += 30;
    if (segundos === 30 || segundos % 60 === 0) {
      window.trackEvent('tempo_pagina', { segundos });
    }
  }, 30000);

  window.addEventListener('beforeunload', () => {
    clearInterval(heartbeat);
    window.trackEvent('page_exit', { segundos_total: segundos });
  });

  console.log('[tracker] Pronto. Sessão:', sessaoId, '| Visitante:', visitanteId);
})();