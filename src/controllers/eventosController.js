// src/controllers/eventosController.js
const { db, bucket } = require('../config/firebase');
const { eventosSchema } = require('../validators/eventosSchema');
const { calcularProximaOcorrencia, descreverRecorrencia } = require('../utils/eventosHelper');

const COLECAO = 'eventos';

const colecoesMap = {
  'pontos-turisticos': 'pontosTuristicos',
  'restaurantes': 'restaurantes',
  'acomodacoes': 'acomodacoes',
  'servicos': 'servicos'
};

// ---------- Utilitários ----------

const extractFilePath = (url) => {
  if (!url) return null;
  try {
    const match = url.match(/\/o\/(.+?)(\?|$)/);
    if (match && match[1]) return decodeURIComponent(match[1]);
  } catch (e) { /* ignora */ }
  return null;
};

const cleanFileName = (originalName) => originalName
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9.]/g, '_')
  .replace(/_{2,}/g, '_')
  .replace(/^_+|_+$/g, '');

const paraBooleano = (v, padrao = false) => {
  if (v === undefined || v === null || v === '') return padrao;
  if (typeof v === 'boolean') return v;
  return String(v).trim().toLowerCase() === 'true';
};

const paraNumeroOpcional = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).trim());
  return Number.isNaN(n) ? null : n;
};

const normalizarLista = (v) => {
  if (v === undefined || v === null || v === '') return [];
  let lista = v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      lista = Array.isArray(parsed) ? parsed : [v];
    } catch (e) { lista = [v]; }
  }
  if (!Array.isArray(lista)) return [];
  return lista.map(x => String(x).trim()).filter(Boolean);
};

const normalizarObjeto = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
};

const texto = (v) => (v === undefined || v === null) ? '' : String(v).trim();

// ---------- Normalização do payload ----------

const normalizarEvento = (body = {}) => {
  const payload = {
    titulo: texto(body.titulo),
    descricao: texto(body.descricao),
    dataInicio: texto(body.dataInicio),
    dataFim: texto(body.dataFim) || null,
    dataFimRecorrencia: texto(body.dataFimRecorrencia) || null,
    recorrencia: texto(body.recorrencia) || 'nenhuma',
    diasSemana: normalizarLista(body.diasSemana),
    localVinculado: normalizarObjeto(body.localVinculado),
    local: texto(body.local),
    endereco: texto(body.endereco),
    coordenadas: texto(body.coordenadas),
    categoria: texto(body.categoria) || 'outro',
    gratuito: paraBooleano(body.gratuito, true),
    preco: texto(body.preco),
    linkExterno: texto(body.linkExterno),
    telefone: texto(body.telefone),
    whatsapp: texto(body.whatsapp),
    destaque: paraBooleano(body.destaque, false),
    cidade: texto(body.cidade) || 'rolante'
  };

  // Coordenadas: usa o campo unificado se latitude/longitude não vierem
  let lat = paraNumeroOpcional(body.latitude);
  let lng = paraNumeroOpcional(body.longitude);
  if ((lat === null || lng === null) && payload.coordenadas.includes(',')) {
    const [pLat, pLng] = payload.coordenadas.split(',').map(s => s.trim());
    if (lat === null) lat = paraNumeroOpcional(pLat);
    if (lng === null) lng = paraNumeroOpcional(pLng);
  }
  payload.latitude = lat;
  payload.longitude = lng;

  const imagens = normalizarLista(body.imagens);
  if (imagens.length > 0) payload.imagens = imagens;

  return payload;
};

const validarEvento = (payload) => {
  const { error, value } = eventosSchema.validate(payload, { abortEarly: false });
  if (error) return { error };

  if (value.dataFim && new Date(value.dataFim) < new Date(value.dataInicio)) {
    return { error: { details: [{ message: 'A data de fim não pode ser anterior à data de início' }] } };
  }
  if (value.dataFimRecorrencia && new Date(value.dataFimRecorrencia) < new Date(value.dataInicio)) {
    return { error: { details: [{ message: 'O fim da recorrência não pode ser anterior à data de início' }] } };
  }
  return { value };
};

const responderErroValidacao = (res, error) => res.status(400).json({
  error: 'Erro de validação',
  detalhes: error.details.map(d => d.message)
});

// ---------- Resolução do local vinculado ----------

const criarResolvedorLocal = () => {
  const cache = new Map();
  return async (localVinculado) => {
    if (!localVinculado?.tipo || !localVinculado?.id) return null;
    const colecao = colecoesMap[localVinculado.tipo];
    if (!colecao) return null;

    const chave = `${colecao}/${localVinculado.id}`;
    if (cache.has(chave)) return cache.get(chave);

    let dados = null;
    try {
      const snap = await db.collection(colecao).doc(localVinculado.id).get();
      if (snap.exists) {
        const d = snap.data();
        dados = {
          id: snap.id,
          tipo: localVinculado.tipo,
          nome: d.nome || '',
          endereco: d.endereco || '',
          coordenadas: d.coordenadas || '',
          latitude: d.latitude ?? null,
          longitude: d.longitude ?? null,
          imagem: d.imagem || (Array.isArray(d.imagens) ? d.imagens[0] : '') || ''
        };
      }
    } catch (e) {
      console.error('Erro ao resolver local vinculado:', e.message);
    }
    cache.set(chave, dados);
    return dados;
  };
};

// Aplica dados do local vinculado sem sobrescrever o que foi digitado manualmente
const aplicarLocalVinculado = async (evento, resolver) => {
  const vinculado = await resolver(evento.localVinculado);
  if (!vinculado) return { ...evento, localVinculadoDados: null };

  return {
    ...evento,
    local: evento.local || vinculado.nome,
    endereco: evento.endereco || vinculado.endereco,
    coordenadas: evento.coordenadas || vinculado.coordenadas,
    latitude: evento.latitude ?? vinculado.latitude,
    longitude: evento.longitude ?? vinculado.longitude,
    localVinculadoDados: vinculado
  };
};

// ---------- Upload de imagens ----------

const enviarImagens = async (files, uploadedFilePaths) => {
  const urls = [];
  if (!files?.length || !bucket) return urls;

  for (const file of files) {
    const fileName = `${Date.now()}_${cleanFileName(file.originalname)}`;
    const filePath = `imagens/eventos/${fileName}`;
    await bucket.file(filePath).save(file.buffer, { metadata: { contentType: file.mimetype } });
    uploadedFilePaths.push(filePath);
    urls.push(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`);
  }
  return urls;
};

const limparUploads = async (paths) => {
  if (!bucket) return;
  for (const p of paths) {
    try { await bucket.file(p).delete(); } catch (e) { /* ignora */ }
  }
};

// ---------- 1. LISTAR ----------

const listarEventos = async (req, res) => {
  try {
    const incluirPassados = String(req.query.incluirPassados) === 'true';
    const apenasDestaque = String(req.query.destaque) === 'true';
    const cidade = req.query.cidade ? String(req.query.cidade).trim() : null;
    const categoria = req.query.categoria ? String(req.query.categoria).trim() : null;
    const agora = new Date();

    const snapshot = await db.collection(COLECAO).get();
    const resolver = criarResolvedorLocal();

    let lista = [];
    for (const doc of snapshot.docs) {
      const dados = { id: doc.id, ...doc.data() };

      if (cidade && dados.cidade && dados.cidade !== cidade) continue;
      if (categoria && dados.categoria !== categoria) continue;
      if (apenasDestaque && dados.destaque !== true) continue;

      const ocorrencia = calcularProximaOcorrencia(dados, agora);
      if (!ocorrencia && !incluirPassados) continue;

      const enriquecido = await aplicarLocalVinculado(dados, resolver);

      lista.push({
        ...enriquecido,
        proximaOcorrencia: ocorrencia ? {
          inicio: ocorrencia.inicio.toISOString(),
          fim: ocorrencia.fim.toISOString()
        } : null,
        acontecendoAgora: ocorrencia
          ? ocorrencia.inicio <= agora && agora <= ocorrencia.fim
          : false,
        recorrenciaDescricao: descreverRecorrencia(dados),
        encerrado: !ocorrencia
      });
    }

    lista.sort((a, b) => {
      const ta = a.proximaOcorrencia ? new Date(a.proximaOcorrencia.inicio).getTime() : Infinity;
      const tb = b.proximaOcorrencia ? new Date(b.proximaOcorrencia.inicio).getTime() : Infinity;
      return ta - tb;
    });

    const limitVal = parseInt(req.query.limit, 10);
    if (!isNaN(limitVal) && limitVal > 0) lista = lista.slice(0, limitVal);

    res.json(lista);
  } catch (error) {
    console.error('Erro ao listar eventos:', error);
    res.status(500).json({ error: 'Erro ao buscar eventos' });
  }
};

// ---------- 2. BUSCAR UM ----------

const buscarEvento = async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await db.collection(COLECAO).doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Evento não encontrado' });

    const dados = { id: snap.id, ...snap.data() };
    const resolver = criarResolvedorLocal();
    const enriquecido = await aplicarLocalVinculado(dados, resolver);
    const agora = new Date();
    const ocorrencia = calcularProximaOcorrencia(dados, agora);

    res.json({
      ...enriquecido,
      proximaOcorrencia: ocorrencia ? {
        inicio: ocorrencia.inicio.toISOString(),
        fim: ocorrencia.fim.toISOString()
      } : null,
      acontecendoAgora: ocorrencia ? ocorrencia.inicio <= agora && agora <= ocorrencia.fim : false,
      recorrenciaDescricao: descreverRecorrencia(dados),
      encerrado: !ocorrencia
    });
  } catch (error) {
    console.error('Erro ao buscar evento:', error);
    res.status(500).json({ error: 'Erro ao buscar evento' });
  }
};

// ---------- 3. CRIAR ----------

const criarEvento = async (req, res) => {
  const uploadedFilePaths = [];
  try {
    const { error, value } = validarEvento(normalizarEvento(req.body));
    if (error) return responderErroValidacao(res, error);

    const novasUrls = await enviarImagens(req.files, uploadedFilePaths);
    const imagens = [...(value.imagens || []), ...novasUrls];

    const novoEvento = {
      ...value,
      imagens,
      imagem: imagens[0] || '',
      createdAt: new Date().toISOString()
    };

    const docRef = await db.collection(COLECAO).add(novoEvento);
    res.status(201).json({ id: docRef.id, ...novoEvento });
  } catch (error) {
    console.error('Erro ao criar evento:', error);
    await limparUploads(uploadedFilePaths);
    res.status(500).json({ error: 'Erro ao cadastrar evento' });
  }
};

// ---------- 4. ATUALIZAR ----------

const atualizarEvento = async (req, res) => {
  const uploadedFilePaths = [];
  try {
    const { id } = req.params;
    const { error, value } = validarEvento(normalizarEvento(req.body));
    if (error) return responderErroValidacao(res, error);

    const docRef = db.collection(COLECAO).doc(id);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Evento não encontrado' });

    const antigos = snap.data();

    let imagensExistentes = req.body.imagensExistentes;
    if (imagensExistentes === undefined) {
      imagensExistentes = Array.isArray(antigos.imagens) ? antigos.imagens : [];
    } else {
      imagensExistentes = normalizarLista(imagensExistentes);
    }

    if (Array.isArray(antigos.imagens) && bucket) {
      for (const urlAntiga of antigos.imagens) {
        if (!imagensExistentes.includes(urlAntiga)) {
          const filePath = extractFilePath(urlAntiga);
          if (filePath) {
            try { await bucket.file(filePath).delete(); } catch (e) { /* ignora */ }
          }
        }
      }
    }

    const novasUrls = await enviarImagens(req.files, uploadedFilePaths);
    const imagens = [...imagensExistentes, ...novasUrls];

    const atualizado = {
      ...value,
      imagens,
      imagem: imagens[0] || '',
      updatedAt: new Date().toISOString()
    };

    await docRef.update(atualizado);
    res.status(200).json({ id, ...atualizado });
  } catch (error) {
    console.error('Erro ao atualizar evento:', error);
    await limparUploads(uploadedFilePaths);
    res.status(500).json({ error: 'Erro ao atualizar evento' });
  }
};

// ---------- 5. EXCLUIR ----------

const deletarEvento = async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = db.collection(COLECAO).doc(id);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Evento não encontrado' });

    const dados = snap.data();
    if (Array.isArray(dados.imagens) && bucket) {
      for (const url of dados.imagens) {
        const filePath = extractFilePath(url);
        if (filePath) {
          try { await bucket.file(filePath).delete(); } catch (e) { /* ignora */ }
        }
      }
    }

    await docRef.delete();
    res.status(200).json({ message: 'Evento excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir evento:', error);
    res.status(500).json({ error: 'Erro ao excluir evento' });
  }
};

module.exports = {
  listarEventos,
  buscarEvento,
  criarEvento,
  atualizarEvento,
  deletarEvento
};