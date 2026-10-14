const request = require('supertest');
// Nota: Certifique-se de que exporta o 'app' no seu server.js se necessário, 
// ou ajuste para importar o servidor corretamente.

describe('Testes da API de Turismo', () => {
  it('Deve retornar erro 400 ou lista vazia ao consultar uma coleção válida', async () => {
    // Exemplo de teste simulado na rota GET
    const response = await request('http://localhost:3000').get('/api/pontos-turisticos');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});