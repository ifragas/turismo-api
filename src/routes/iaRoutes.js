const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { db } = require('../config/firebase');

const router = express.Router();

// 🚨 Inicializa o NOVO SDK. Ele lê a variável GEMINI_API_KEY do .env automaticamente.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Modelo estável, rápido e com tier gratuito generoso
const MODEL_NAME = 'gemini-1.5-flash';

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

    // 🚨 PASSO 2: Montar o contexto para o usuário
    const contextoLocais = locaisRelevantes
      .map((l, i) => `${i + 1}. ${l.nome} (${l.tipo}${l.tipoServico ? ' - ' + l.tipoServico : ''}) | ${l.endereco} | ${l.descricao}`)
      .join('\n');

    const promptUsuario = `CIDADE ATUAL: ${cidadeId}

LOCAIS DISPONÍVEIS NO BANCO DE DADOS:
${contextoLocais}

PERGUNTA DO USUÁRIO: "${pergunta}"

Responda de forma natural e útil. Se mencionar locais específicos, liste-os claramente.`;

    // 🚨 PASSO 3: Chamar a IA com o NOVO SDK e systemInstruction
    console.log(`🤖 Chamando a IA com o modelo: ${MODEL_NAME}...`);
    
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: promptUsuario,
      config: {
        systemInstruction: SYSTEM_PROMPT, // 🚨 Regras aplicadas de forma nativa e blindada
        temperature: 0.7,
        maxOutputTokens: 1500, // Aumentado para evitar cortes em respostas mais longas
      },
    });

    const respostaIA = response.text;
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