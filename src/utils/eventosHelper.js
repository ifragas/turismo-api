// src/utils/eventosHelper.js

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

const DIAS_SEMANA = [
  'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'
];

// Converte um instante para "relógio de parede" do Brasil (campos UTC)
const paraBRT = (date) => new Date(date.getTime() + BRT_OFFSET_MS);

// Monta um instante real a partir de Y/M/D + hora em horário de Brasília
const montarInstante = (ano, mes, dia, hora, minuto) => {
  return new Date(Date.UTC(ano, mes, dia, hora, minuto, 0, 0) - BRT_OFFSET_MS);
};

const inicioDoDiaBRT = (date) => {
  const b = paraBRT(date);
  return Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
};

const ultimoDiaDoMes = (ano, mes) => new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();

/**
 * Calcula a próxima ocorrência de um evento (ou a atual, se estiver acontecendo).
 * Retorna { inicio: Date, fim: Date } ou null se o evento já encerrou.
 */
const calcularProximaOcorrencia = (evento, agora = new Date()) => {
  if (!evento?.dataInicio) return null;

  const ancora = new Date(evento.dataInicio);
  if (isNaN(ancora.getTime())) return null;

  const fimAncora = evento.dataFim ? new Date(evento.dataFim) : null;
  const duracao = fimAncora && !isNaN(fimAncora.getTime()) && fimAncora > ancora
    ? fimAncora.getTime() - ancora.getTime()
    : 0;

  const limiteSerie = evento.dataFimRecorrencia ? new Date(evento.dataFimRecorrencia) : null;
  const agoraMs = agora.getTime();

  const dentroDoLimite = (inicio) => {
    if (!limiteSerie || isNaN(limiteSerie.getTime())) return true;
    // Compara pelo dia em BRT, para incluir o último dia inteiro
    return inicioDoDiaBRT(inicio) <= inicioDoDiaBRT(limiteSerie);
  };

  const montarResultado = (inicio) => {
    if (!dentroDoLimite(inicio)) return null;
    return { inicio, fim: new Date(inicio.getTime() + duracao) };
  };

  const recorrencia = evento.recorrencia || 'nenhuma';

  // --- Evento único ---
  if (recorrencia === 'nenhuma') {
    const fim = new Date(ancora.getTime() + duracao);
    if (fim.getTime() < agoraMs) return null;
    return { inicio: ancora, fim };
  }

  const ancoraBRT = paraBRT(ancora);
  const hora = ancoraBRT.getUTCHours();
  const minuto = ancoraBRT.getUTCMinutes();
  const ancoraDiaMs = inicioDoDiaBRT(ancora);
  const hojeBRT = paraBRT(agora);

  // --- Diária ---
  if (recorrencia === 'diaria') {
    let cursorMs = Math.max(ancoraDiaMs, inicioDoDiaBRT(agora));
    for (let i = 0; i < 800; i++) {
      const c = new Date(cursorMs);
      const inicio = montarInstante(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), hora, minuto);
      const fim = new Date(inicio.getTime() + duracao);
      if (fim.getTime() >= agoraMs) return montarResultado(inicio);
      cursorMs += 24 * 60 * 60 * 1000;
    }
    return null;
  }

  // --- Semanal ---
  if (recorrencia === 'semanal') {
    const dias = Array.isArray(evento.diasSemana) ? evento.diasSemana : [];
    if (dias.length === 0) return null;

    let cursorMs = Math.max(ancoraDiaMs, inicioDoDiaBRT(agora));
    for (let i = 0; i < 800; i++) {
      const c = new Date(cursorMs);
      if (dias.includes(DIAS_SEMANA[c.getUTCDay()])) {
        const inicio = montarInstante(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), hora, minuto);
        const fim = new Date(inicio.getTime() + duracao);
        if (fim.getTime() >= agoraMs) return montarResultado(inicio);
      }
      cursorMs += 24 * 60 * 60 * 1000;
    }
    return null;
  }

  // --- Mensal (mesmo dia do mês; ajusta meses curtos) ---
  if (recorrencia === 'mensal') {
    const diaAncora = ancoraBRT.getUTCDate();
    let ano = hojeBRT.getUTCFullYear();
    let mes = hojeBRT.getUTCMonth();

    if (ancoraDiaMs > inicioDoDiaBRT(agora)) {
      ano = ancoraBRT.getUTCFullYear();
      mes = ancoraBRT.getUTCMonth();
    }

    for (let i = 0; i < 240; i++) {
      const dia = Math.min(diaAncora, ultimoDiaDoMes(ano, mes));
      const inicio = montarInstante(ano, mes, dia, hora, minuto);
      const fim = new Date(inicio.getTime() + duracao);
      if (fim.getTime() >= agoraMs && inicio.getTime() >= ancora.getTime()) {
        return montarResultado(inicio);
      }
      mes++;
      if (mes > 11) { mes = 0; ano++; }
    }
    return null;
  }

  // --- Anual (mesmo dia/mês; ajusta 29/02) ---
  if (recorrencia === 'anual') {
    const diaAncora = ancoraBRT.getUTCDate();
    const mesAncora = ancoraBRT.getUTCMonth();
    let ano = hojeBRT.getUTCFullYear();
    if (ancora.getTime() > agoraMs) ano = ancoraBRT.getUTCFullYear();

    for (let i = 0; i < 40; i++) {
      const dia = Math.min(diaAncora, ultimoDiaDoMes(ano, mesAncora));
      const inicio = montarInstante(ano, mesAncora, dia, hora, minuto);
      const fim = new Date(inicio.getTime() + duracao);
      if (fim.getTime() >= agoraMs && inicio.getTime() >= ancora.getTime()) {
        return montarResultado(inicio);
      }
      ano++;
    }
    return null;
  }

  return null;
};

/**
 * Rótulo amigável da recorrência para exibição no app/painel.
 */
const descreverRecorrencia = (evento) => {
  const r = evento?.recorrencia || 'nenhuma';
  const nomes = {
    domingo: 'Domingo', segunda: 'Segunda', terca: 'Terça',
    quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado'
  };

  if (r === 'diaria') return 'Todos os dias';
  if (r === 'semanal') {
    const dias = (evento.diasSemana || []).map(d => nomes[d]).filter(Boolean);
    return dias.length ? `Toda semana: ${dias.join(', ')}` : 'Semanal';
  }
  if (r === 'mensal') return 'Todo mês';
  if (r === 'anual') return 'Todo ano';
  return 'Evento único';
};

module.exports = {
  calcularProximaOcorrencia,
  descreverRecorrencia,
  DIAS_SEMANA
};