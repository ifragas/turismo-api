const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { db } = require('../config/firebase');

const router = express.Router();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = 'gemini-1.5-flash';
const model = genAI.getGenerativeModel({ 
  model: MODEL_NAME,
  systemInstruction: `Você é o "Guia Smart", um assistente virtual amigável, prestativo e especialista em turismo da cidade informada pelo usuário.

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em português brasileiro, de forma natural e conversacional.
2. Baseie suas respostas APENAS nos dados de locais fornecidos abaixo. Não invente estabelecimentos, endereços ou informações.
3. Se o usuário perguntar algo que não está nos dados, diga honestamente que não tem essa informação no momento, mas sugira alternativas dos locais disponíveis.
4. Seja conciso mas útil. Destaque no máximo 5 locais por resposta.
5. Quando mencionar um local específico, use o nome EXATO como está nos dados fornecidos.
6. Mantenha um tom caloroso, como um morador local que adora mostrar sua cidade.`
});

// 🚨 Função para normalizar texto (remove acentos e deixa minúsculo)
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
          .limit(10) // Aumentado para 10 para dar mais opções à IA
          .get();

        snapshot.forEach(doc => {
          const data = doc.data();
          const nome = (data.nome || data.titulo || '').trim();
          if (!nome) return;

          locaisRelevantes.push({
            id: doc.id,
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
        ].filter(Boolean).join(' | ');
        return `${i + 1}. ${l.nome} (${l.tipo}) | ${l.endereco} | ${l.descricao}${extras ? ' | ' + extras : ''}`;
      })
      .join('\n');

    const promptUsuario = `CIDADE ATUAL: ${cidadeId}

LOCAIS DISPONÍVEIS NO BANCO DE DADOS:
${contextoLocais}

PERGUNTA DO USUÁRIO: "${pergunta}"

Responda de forma natural. Use os nomes EXATOS dos locais quando mencioná-los.`;

    console.log(`🤖 Chamando a IA com o modelo: ${MODEL_NAME}...`);
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptUsuario }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
    });

    const respostaIA = (result.response.text() || '').trim();
    console.log('✅ IA respondeu com sucesso!');

    // 🚨 FILTRO ROBUSTO: Compara textos normalizados (sem acentos)
    const respostaNormalizada = normalizarTexto(respostaIA);
    
    const locaisMencionados = locaisRelevantes
      .filter(l => {
        const nomeNormalizado = normalizarTexto(l.nome);
        return respostaNormalizada.includes(nomeNormalizado);
      })
      .slice(0, 5) // Limita a 5 locais mencionados
      .map(l => ({
        id: l.id,
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
    res.status(500).json({ error: 'Erro ao processar sua pergunta. Tente novamente.' });
  }
});

module.exports = router;