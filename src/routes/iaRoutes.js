const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { db } = require('../config/firebase');

const router = express.Router();

// Inicializa a API com a chave do .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🚨 Modelo mais estável e gratuito atualmente no Google AI Studio
const MODEL_NAME = 'gemini-1.5-flash-latest';
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

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

    // 🚨 PASSO 3: Chamar a IA
    console.log(`🤖 Chamando a IA com o modelo: ${MODEL_NAME}...`);
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptCompleto }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
      },
    });

    const respostaIA = result.response.text();
    console.log('✅ IA respondeu com sucesso!');

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
    console.error('❌ Erro no chat IA:', error.message);
    res.status(500).json({ error: 'Erro ao processar sua pergunta. Tente novamente.' });
  }
});

module.exports = router;