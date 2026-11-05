const express = require('express');
const cors = require('cors');
require('dotenv').config();
const rateLimit = require('express-rate-limit');
const turismoRoutes = require('./src/routes/turismoRoutes');

const app = express();

// Limiter para proteger a API contra excesso de requisições
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, 
  message: {
    error: 'Muitas requisições criadas a partir deste IP, por favor tente novamente após 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Aplica o limitador globalmente
app.use('/api/', limiter);

// Middleware CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rota raiz
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 API do Guia da Cidade (Refatorada MVC)</h1>
    <p>Esta é a API REST do app de turismo de Rolante/RS.</p>
  `);
});

// Carrega as rotas da aplicação
app.use('/api', turismoRoutes);

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});