const Joi = require('joi');

const TIPOS_SERVICO = [
  'saude',
  'seguranca',
  'combustivel',
  'mercado',
  'automotivo',
  'publico',
  'farmacia',
  'banco'
];

const servicosSchema = Joi.object({
  nome: Joi.string().trim().max(200).required().messages({
    'string.base': 'O campo nome deve ser uma string',
    'string.empty': 'O campo nome não pode estar vazio',
    'string.max': 'O campo nome deve ter no máximo 200 caracteres',
    'any.required': 'O campo nome é obrigatório'
  }),
  descricao: Joi.string().trim().max(1000).allow('', null).optional().messages({
    'string.base': 'O campo descrição deve ser uma string',
    'string.max': 'O campo descrição deve ter no máximo 1000 caracteres'
  }),
  tipoServico: Joi.string().valid(...TIPOS_SERVICO).required().messages({
    'any.only': `O campo tipoServico deve ser um destes: ${TIPOS_SERVICO.join(', ')}`,
    'any.required': 'O campo tipoServico é obrigatório',
    'string.empty': 'O campo tipoServico não pode estar vazio'
  }),
  telefone: Joi.string().trim().allow('', null).optional().messages({
    'string.base': 'O campo telefone deve ser uma string'
  }),
  whatsapp: Joi.string().trim().allow('', null).optional().messages({
    'string.base': 'O campo whatsapp deve ser uma string'
  }),
  endereco: Joi.string().trim().allow('', null).optional().messages({
    'string.base': 'O campo endereço deve ser uma string'
  }),
  latitude: Joi.number().allow(null).optional().messages({
    'number.base': 'O campo latitude deve ser um número'
  }),
  longitude: Joi.number().allow(null).optional().messages({
    'number.base': 'O campo longitude deve ser um número'
  }),
  funcionamento24h: Joi.boolean().default(false).messages({
    'boolean.base': 'O campo funcionamento24h deve ser verdadeiro ou falso'
  }),
  imagens: Joi.array().items(Joi.string().trim()).allow(null).optional().messages({
    'array.base': 'O campo imagens deve ser uma lista de textos'
  })
});

module.exports = { servicosSchema, TIPOS_SERVICO };
