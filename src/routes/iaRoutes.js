const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { db } = require('../config/firebase');

const router = express.Router();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🚨 Lista de modelos em ordem de preferência.
// Tenta o moderno (flash) e cai para o legado (pro) se a API não reconhecer.
const MODELOS_CANDIDATOS = ['gemini-1.5-flash', 'gemini-1.5-flash-001', 'gemini-pro'];

// Seleciona o modelo em memória (evita re-testar a cada requisição)
let modeloSelecionado = null;

async function obterModelo() {
  if (modeloSelecionado) return modeloSelecionado;
  for (const nome of MODELOS_CANDIDATOS) {
    try {
      const m = genAI.getGenerativeModel({ model: nome });
      // Teste leve: só tenta instanciar. O 404 real aparece no generateContent.
      // Guardamos e usamos; se falhar no generateContent, tentamos o próximo.
      modeloSelecionado = { nome, model: m };
      return modeloSelecionado;
    } catch (e) {
      continue;
    }
  }
  throw new Error('Nenhum modelo Gemini disponível.');
}

// 🚨 Chama a IA com fallback automático de modelo em caso de erro 404
async function gerarResposta(promptCompleto) {
  let ultimoErro = null;
  for (const nome of MODELOS_CANDIDATOS) {
    try {
      const model = genAI.getGenerativeModel({ model: nome });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptCompleto }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      });
      console.log(`✅ IA respondeu usando o modelo: ${nome}`);
      return result.response.text();
    } catch (error) {
      ultimoErro = error;
      const status = error?.status;
      // Se for 404 (modelo não encontrado), tenta o próximo da lista
      if (status === 404) {
        console.warn(`⚠️ Modelo ${nome} indisponível (404). Tentando próximo...`);
        continue;
      }
      // Qualquer outro erro (rate limit, auth, etc.) para o loop e propaga
      throw error;
    }
  }
  throw ultimoErro;
}

const SYSTEM_PROMPT = `Você é o "Guia Smart", um assistente virtual amigável, prestativo e especialista em turismo da cidade informada pelo usuário.

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em português brasileiro, de forma natural e conversacional.
2. Baseie suas respostas APENAS nos dados de locais fornecidos abaixo. Não invente estabelecimentos, endereços ou informações.
3. Se o usuário perguntar algo que não está nos dados, diga honestamente que não tem essa informação no momento, mas sugira alternativas dos locais disponíveis.
4. Seja conciso mas útil. Evite listas longas demais — destaque no máximo 3-5 locais por resposta.
5. Quando mencionar um local específico, inclua o nome exato como está nos dados.
6. Se o usuário pedir recomendações, considere a categoria, descrição e endereço dos locais para dar sugestões relevantes.
7. Mantenha um tom caloroso, como um morador local que adora mostrar sua cidade.`;

router.post('/chat', async (req, res) => {
  try {
    const { pergunta, cidadeId } = req.body;

    console.log('🔍 Recebido no backend:', { pergunta, cidadeId });

    if (!pergunta || !cidadeId) {
      return res.status(400).json({ error: 'pergunta e cidadeId são obrigatórios' });
    }

    // 🚨 PASSO 1: Buscar locais relevantes da cidade no Firestore
    const colecoes = ['pontosTuristicos', 'restaurantes', 'acomodacoes', 'servicos', 'eventos'];
    const locaisRelevantes = [];

    for (const colecao of colecoes) {
      try {
        const snapshot = await db.collection(colecao)
          .where('cidadeId', '==', cidadeId)
          .limit(8)
          .get();

        snapshot.forEach(doc => {
          const data = doc.data();
          locaisRelevantes.push({
            nome: data.nome || data.titulo,
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
        resposta: `Ainda não temos locais cadastrados para esta cidade no momento. Tente novamente mais tarde!`,
        locaisMencionados: [],
      });
    }

    // 🚨 PASSO 2: Montar o prompt com contexto
    const contextoLocais = locaisRelevantes
      .map((l, i) => `${i + 1}. ${l.nome} (${l.tipo}${l.tipoServico ? ' - ' + l.tipoServico : ''}) | ${l.endereco} | ${l.descricao}`)
      .join('\n');

    const promptCompleto = `${SYSTEM_PROMPT}

CIDADE ATUAL: ${cidadeId}

LOCAIS DISPONÍVEIS NO BANCO DE DADOS:
${contextoLocais}

PERGUNTA DO USUÁRIO: "${pergunta}"

Responda de forma natural e útil. Se mencionar locais específicos, liste-os claramente.`;

    // 🚨 PASSO 3: Chamar a IA com fallback de modelo
    const respostaIA = await gerarResposta(promptCompleto);

    // 🚨 PASSO 4: Extrair locais mencionados para linkar no mapa
    const locaisMencionados = locaisRelevantes.filter(l =>
      respostaIA.toLowerCase().includes((l.nome || '').toLowerCase())
    ).slice(0, 3);

    res.json({
      resposta: respostaIA,
      locaisMencionados: locaisMencionados.map(l => ({
        nome: l.nome,
        tipo: l.tipo,
        endereco: l.endereco,
      })),
    });

  } catch (error) {
    console.error('Erro no chat IA:', error);
    res.status(500).json({ error: 'Erro ao processar sua pergunta. Tente novamente.' });
  }
});

module.exports = router;