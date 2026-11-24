const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { db } = require('../config/firebase');

const router = express.Router();

// Inicializa o SDK (lê GEMINI_API_KEY automaticamente das variáveis de ambiente)
const ai = new GoogleGenAI();

// Lê os modelos do .env (ou das variáveis de ambiente no Render)
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash';

const SYSTEM_PROMPT = `Você é o "Guia Smart", um assistente virtual amigável, prestativo e especialista em turismo da cidade informada pelo usuário.

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em português brasileiro, de forma natural e conversacional.
2. Baseie suas respostas APENAS nos dados de locais fornecidos abaixo. Não invente estabelecimentos, endereços ou informações.
3. Se o usuário perguntar algo que não está nos dados, diga honestamente que não tem essa informação no momento, mas sugira alternativas dos locais disponíveis.
4. Seja conciso mas útil. Evite listas longas demais — destaque no máximo 3-5 locais por resposta.
5. Quando mencionar um local específico, inclua o nome exato como está nos dados.
6. Se o usuário pedir recomendações, considere a categoria, descrição e endereço dos locais para dar sugestões relevantes.
7. Mantenha um tom caloroso, como um morador local que adora mostrar sua cidade.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientError(error) {
  const status = error?.status || error?.code;
  const msg = String(error?.message || '');
  return (
    status === 503 ||
    status === 429 ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand')
  );
}

function isModelNotFoundError(error) {
  const status = error?.status || error?.code;
  const msg = String(error?.message || '');
  return status === 404 || msg.includes('404') || msg.includes('NOT_FOUND');
}

async function generateWithFallback(promptUsuario, maxRetries = 2) {
  const modelos = [...new Set([PRIMARY_MODEL, FALLBACK_MODEL].filter(Boolean))];

  for (const modelo of modelos) {
    for (let tentativa = 1; tentativa <= maxRetries; tentativa++) {
      try {
        console.log(`🤖 Chamando IA (${modelo}) - tentativa ${tentativa}/${maxRetries}...`);
        return await ai.models.generateContent({
          model: modelo,
          contents: promptUsuario,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.7,
            maxOutputTokens: 1200,
          },
        });
      } catch (err) {
        const ehUltimoModelo = modelo === modelos[modelos.length - 1];
        const podeTentarDeNovo = isTransientError(err) && tentativa < maxRetries;
        console.warn(`⚠️ Falha em ${modelo} (tentativa ${tentativa}): ${err.message}`);

        if (isModelNotFoundError(err) || !podeTentarDeNovo) {
          if (ehUltimoModelo) throw err;
          break;
        }

        await sleep(500 * tentativa);
      }
    }
  }
}

// 🚨 CORREÇÃO 1: Função para normalizar texto (remove acentos e deixa minúsculo)
const normalizarTexto = (str) => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

router.post('/chat', async (req, res) => {
  try {
    const { pergunta, cidadeId } = req.body;

    console.log('🔍 Recebido no backend:', { pergunta, cidadeId });

    if (!pergunta || !cidadeId) {
      return res.status(400).json({ error: 'pergunta e cidadeId são obrigatórios' });
    }

    const colecoes = ['pontosTuristicos', 'restaurantes', 'acomodacoes', 'servicos', 'eventos'];
    const locaisRelevantes = [];

    for (const colecao of colecoes) {
      try {
        const snapshot = await db.collection(colecao)
          .where('cidadeId', '==', cidadeId)
          .limit(10) // Aumentado levemente para dar mais opções à IA
          .get();

        snapshot.forEach((doc) => {
          const data = doc.data();
          const nome = (data.nome || data.titulo || '').trim();

          if (!nome) return;

          locaisRelevantes.push({
            id: doc.id, // 🚨 CORREÇÃO 2: Adicionado o ID do documento para o clique funcionar
            nome,
            tipo: data.tipo || colecao,
            tipoServico: data.tipoServico || null,
            endereco: data.endereco || '',
            descricao: (data.descricao || '').substring(0, 200),
            horario: data.horario || (data.funcionamento24h ? '24 horas' : ''),
            telefone: data.telefone || '',
            gratuito: data.gratuito || false,
            preco: data.preco || '',
          });
        });
      } catch (e) {
        console.warn(`⚠️ Falha ao buscar coleção ${colecao}:`, e.message);
      }
    }

    if (locaisRelevantes.length === 0) {
      return res.json({
        resposta: 'Ainda não temos locais cadastrados para esta cidade no momento. Tente novamente mais tarde!',
        locaisMencionados: [],
      });
    }

    const contextoLocais = locaisRelevantes
      .map((l, i) => {
        const extras = [
          l.horario ? `Horário: ${l.horario}` : '',
          l.preco ? `Preço: ${l.preco}` : (l.gratuito ? 'Gratuito' : ''),
          l.telefone ? `Tel: ${l.telefone}` : '',
        ].filter(Boolean).join(' | ');

        return `${i + 1}. ${l.nome} (${l.tipo}${l.tipoServico ? ' - ' + l.tipoServico : ''}) | ${l.endereco} | ${l.descricao}${extras ? ' | ' + extras : ''}`;
      })
      .join('\n');

    const promptUsuario = `CIDADE ATUAL: ${cidadeId}

LOCAIS DISPONÍVEIS NO BANCO DE DADOS:
${contextoLocais}

PERGUNTA DO USUÁRIO: "${pergunta}"

Responda de forma natural e útil. Se mencionar locais específicos, liste-os claramente.`;

    const response = await generateWithFallback(promptUsuario, 2);
    const respostaIA = (response.text || '').trim();
    console.log('✅ IA respondeu com sucesso!');

    // 🚨 CORREÇÃO 3: Filtro robusto comparando textos normalizados (sem acentos)
    const respostaNormalizada = normalizarTexto(respostaIA);
    
    const locaisMencionados = locaisRelevantes
      .filter((l) => {
        const nomeNormalizado = normalizarTexto(l.nome);
        return respostaNormalizada.includes(nomeNormalizado);
      })
      .slice(0, 5) // 🚨 CORREÇÃO 4: Aumentado de 3 para 5 para corresponder ao prompt da IA
      .map((l) => ({
        id: l.id, // 🚨 CORREÇÃO 5: Garantindo que o ID vá para o frontend
        nome: l.nome,
        tipo: l.tipo,
        endereco: l.endereco,
      }));

    console.log(`📍 Locais vinculados à resposta: ${locaisMencionados.length}`, locaisMencionados.map(l => l.nome));

    res.json({
      resposta: respostaIA,
      locaisMencionados,
    });
  } catch (error) {
    console.error('❌ Erro no chat IA:', error.message);

    if (isTransientError(error)) {
      return res.status(503).json({
        error: 'O assistente está com alta demanda no momento. Tente novamente em alguns segundos.',
      });
    }

    res.status(500).json({ error: 'Erro ao processar sua pergunta. Tente novamente.' });
  }
});

module.exports = router;