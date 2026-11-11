const Joi = require('joi');

const CATEGORIAS_EVENTO = [
  'cultural', 'gastronomico', 'religioso', 'esportivo',
  'civico', 'feira', 'educativo', 'outro'
];

const RECORRENCIAS = ['nenhuma', 'diaria', 'semanal', 'mensal', 'anual'];

const DIAS_SEMANA = [
  'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'
];

const eventosSchema = Joi.object({
  titulo: Joi.string().trim().min(3).max(200).required().messages({
    'string.empty': 'O título do evento não pode estar vazio',
    'string.min': 'O título deve ter no mínimo 3 caracteres',
    'any.required': 'O título do evento é obrigatório'
  }),

  descricao: Joi.string().trim().max(2000).allow('', null).optional(),

  // Datas
  dataInicio: Joi.string().isoDate().required().messages({
    'string.isoDate': 'A data de início deve estar em formato ISO válido',
    'any.required': 'A data de início é obrigatória'
  }),
  dataFim: Joi.string().isoDate().allow('', null).optional(),
  dataFimRecorrencia: Joi.string().isoDate().allow('', null).optional(),

  // Recorrência
  recorrencia: Joi.string().valid(...RECORRENCIAS).default('nenhuma').messages({
    'any.only': `A recorrência deve ser uma destas: ${RECORRENCIAS.join(', ')}`
  }),
  diasSemana: Joi.array()
    .items(Joi.string().valid(...DIAS_SEMANA))
    .when('recorrencia', {
      is: 'semanal',
      then: Joi.array().min(1).required().messages({
        'array.min': 'Selecione ao menos um dia da semana para eventos semanais',
        'any.required': 'Os dias da semana são obrigatórios para eventos semanais'
      }),
      otherwise: Joi.array().optional()
    }),

  // Local vinculado a um item já cadastrado
  localVinculado: Joi.object({
    tipo: Joi.string().valid('pontos-turisticos', 'restaurantes', 'acomodacoes', 'servicos').required(),
    id: Joi.string().trim().required()
  }).allow(null).optional(),

  // Local (preenchido manualmente ou resolvido do vínculo)
  local: Joi.string().trim().max(200).allow('', null).optional(),
  endereco: Joi.string().trim().allow('', null).optional(),
  coordenadas: Joi.string().trim().allow('', null).optional(),
  latitude: Joi.number().allow(null).optional(),
  longitude: Joi.number().allow(null).optional(),

  // Classificação
  categoria: Joi.string().valid(...CATEGORIAS_EVENTO).default('outro').messages({
    'any.only': `A categoria deve ser uma destas: ${CATEGORIAS_EVENTO.join(', ')}`
  }),

  // Ingressos
  gratuito: Joi.boolean().default(true),
  preco: Joi.string().trim().max(100).allow('', null).optional(),
  linkExterno: Joi.string().trim().allow('', null).optional(),

  // Contato
  telefone: Joi.string().trim().allow('', null).optional(),
  whatsapp: Joi.string().trim().allow('', null).optional(),

  // Destaque e mídia
  destaque: Joi.boolean().default(false),
  imagens: Joi.array().items(Joi.string().trim()).allow(null).optional(),

  // Multi-cidade (já preparado)
  cidade: Joi.string().trim().default('rolante')
});

module.exports = { eventosSchema, CATEGORIAS_EVENTO, RECORRENCIAS, DIAS_SEMANA };