const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { db } = require('../config/firebase');

const router = express.Router();

// Inicializa o Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// 🚨 SYSTEM PROMPT: as "regras" da IA
const SYSTEM_PROMPT = `Você é o "Guia Smart", um assistente virtual amigável, prestativo e especialista em turismo da cidade informada pelo usuário.

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em português brasileiro, de forma natural e conversacional.
2. Baseie suas respostas APENAS nos dados de locais fornecidos abaixo. Não invente estabelecimentos, endereços ou informações.
3. Se o usuário perguntar algo que não está nos dados, diga honestamente que não tem essa informação no momento, mas sugira alternativas dos locais disponíveis.
4. Seja conciso mas útil. Evite listas longas demais — destaque no máximo 3-5 locais por resposta.
5. Quando mencionar um local específico, inclua o nome exato como está nos dados.
6. Se o usuário pedir recomendações, considere a categoria, descrição e endereço dos locais para dar sugestões relevantes.
7. Mantenha um tom caloroso, como um morador local que adora mostrar sua cidade.`;

// Middleware de autenticação (reutilize o seu se já existir)
// const { authMiddleware } = require('../middleware/auth');
// router.use(authMiddleware);

router.post('/chat', async (req, res) => {
  try {
    const { pergunta, cidadeId } = req.body;

    if (!pergunta || !cidadeId) {
      return res.status(400).json({ error: 'pergunta e cidadeId são obrigatórios' });
    }

    // 🚨 PASSO 1: Buscar locais relevantes da cidade no Firestore
    // Pegamos um sample representativo de cada categoria (turismo, restaurantes, acomodacoes, servicos, eventos)
    const colecoes = ['pontosTuristicos', 'restaurantes', 'acomodacoes', 'servicos', 'eventos'];
    const locaisRelevantes = [];

    for (const colecao of colecoes) {
      const snapshot = await db.collection(colecao)
        .where('cidadeId', '==', cidadeId)
        .limit(8) // 8 de cada = até 40 locais no contexto
        .get();

      snapshot.forEach(doc => {
        const data = doc.data();
        locaisRelevantes.push({
          nome: data.nome || data.titulo,
          tipo: data.tipo || colecao,
          tipoServico: data.tipoServico || null,
          endereco: data.endereco || '',
          descricao: (data.descricao || '').substring(0, 200), // limita tamanho
          horario: data.horario || data.funcionamento24h ? '24 horas' : '',
          telefone: data.telefone || '',
          gratuito: data.gratuito || false,
          preco: data.preco || '',
        });
      });
    }

    if (locaisRelevantes.length === 0) {
      return res.json({
        resposta: `Ainda não temos locais cadastrados para esta cidade no momento. Tente novamente mais tarde!`,
        locaisMencionados: []
      });
    }

    // 🚨 PASSO 2: Montar o prompt com contexto
    const contextoLocais = locaisRelevantes
      .map((l, i) => `${i + 1}. ${l.nome} (${l.tipo}${l.tipoServico ? ' - ' + l.tipoServico : ''}) | ${l.endereco} | ${l.descricao}`)
      .join('\n');

    const promptCompleto = `${SYSTEM_PROMPT}

CIDADE ATUAL: (use o nome da cidade se souber, ou refira-se como "esta cidade")

LOCAIS DISPONÍVEIS NO BANCO DE DADOS:
${contextoLocais}

PERGUNTA DO USUÁRIO: "${pergunta}"

Responda de forma natural e útil. Se mencionar locais específicos, liste-os claramente.`;

    // 🚨 PASSO 3: Chamar o Gemini
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptCompleto }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
      },
    });

    const respostaIA = result.response.text();

    // 🚨 PASSO 4: (Opcional) Extrair locais mencionados para linkar no mapa
    // Aqui fazemos um match simples: quais dos locais relevantes aparecem no texto da resposta?
    const locaisMencionados = locaisRelevantes.filter(l =>
      respostaIA.toLowerCase().includes((l.nome || '').toLowerCase())
    ).slice(0, 3); // no máximo 3

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