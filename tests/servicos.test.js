const express = require('express');
const request = require('supertest');

jest.mock('../src/config/firebase', () => ({
  admin: {
    auth: jest.fn()
  },
  db: {
    collection: jest.fn()
  },
  bucket: null
}));

const { admin, db } = require('../src/config/firebase');
const turismoRoutes = require('../src/routes/turismoRoutes');

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', turismoRoutes);
  return app;
};

describe('Servicos essenciais', () => {
  beforeEach(() => {
    db.collection.mockReset();
    admin.auth.mockReset();
  });

  it('GET /api/servicos retorna 200', async () => {
    db.collection.mockReturnValue({
      get: jest.fn().mockResolvedValue({ docs: [] })
    });

    const response = await request(createApp()).get('/api/servicos');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(db.collection).toHaveBeenCalledWith('servicos');
  });

  it('POST /api/servicos sem token retorna 401', async () => {
    const response = await request(createApp())
      .post('/api/servicos')
      .send({ nome: 'Hospital Municipal', tipoServico: 'saude' });

    expect(response.status).toBe(401);
    expect(admin.auth).not.toHaveBeenCalled();
  });

  it('POST /api/servicos com token valido e dados invalidos retorna 400', async () => {
    admin.auth.mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'usuario-teste', role: 'admin' })
    });

    const response = await request(createApp())
      .post('/api/servicos')
      .set('Authorization', 'Bearer token-valido')
      .send({ nome: 'Hospital Municipal' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Erro de validação');
  });
});
