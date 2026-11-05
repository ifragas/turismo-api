const Joi = require('joi');

const itemSchema = Joi.object({
  nome: Joi.string().min(2).max(100).required().messages({
    'string.base': 'O campo nome deve ser uma string',
    'string.empty': 'O campo nome não pode estar vazio',
    'any.required': 'O campo nome é obrigatório'
  }),
  descricao: Joi.string().min(5).max(2000).required().messages({
    'string.base': 'O campo descrição deve ser uma string',
    'string.empty': 'O campo descrição não pode estar vazio',
    'any.required': 'O campo descrição é obrigatório'
  }),
  endereco: Joi.string().allow('', null),
  coordenadas: Joi.string().allow('', null),
  linkExterno: Joi.string().uri().allow('', null).messages({
    'string.uri': 'O link externo deve ser uma URL válida'
  }),
  horarios: Joi.alternatives().try(
    Joi.object(),
    Joi.array(),
    Joi.string()
  ).allow('', null),
  sempreAberto: Joi.boolean().allow(null),
  whatsapp: Joi.alternatives().try(
    Joi.array().items(Joi.string()),
    Joi.string()
  ).allow('', null),
  redesSociais: Joi.object({
    instagram: Joi.string().allow('', null),
    facebook: Joi.string().allow('', null),
    tiktok: Joi.string().allow('', null)
  }).allow('', null),
  imagem: Joi.string().uri().allow('', null),
  imagens: Joi.array().items(Joi.string().uri()).allow(null)
});

module.exports = { itemSchema };