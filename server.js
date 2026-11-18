// src/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const turismoRoutes = require('./src/routes/turismoRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

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

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});