// src/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const turismoRoutes = require('./src/routes/turismoRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const iaRoutes = require('./src/routes/iaRoutes');

const app = express();

// Middleware CORS
app.use(cors({
  origin: '*', // Pode ser restrito no futuro para domínios específicos
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rota raiz
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 API do Guia da Cidade (Refatorada MVC)</h1>
    <p>Esta é a API REST do app de turismo Multi-Tenant.</p>
  `);
});

// Carrega as rotas da aplicação
app.use('/api', turismoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ia', iaRoutes);


// 🚨 MIDDLEWARE GLOBAL DE TRATAMENTO DE ERROS (Deve ser o último)
app.use((err, req, res, next) => {
  console.error('💥 Erro não tratado capturado:', err.message);

  // Erro de tamanho de arquivo do Multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande. O limite é 5MB por imagem.' });
  }

  // Erro de parsing de JSON (ex: frontend enviando JSON malformado)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Formato de dados inválido.' });
  }

  // Erro genérico do Multer
  if (err.message && err.message.includes('Unexpected field')) {
    return res.status(400).json({ error: 'Campo de arquivo inesperado no formulário.' });
  }

  // Fallback seguro para qualquer outro erro
  res.status(err.status || 500).json({ 
    error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message 
  });
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});