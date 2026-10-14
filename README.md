🚀 API REST - Aplicativo de Turismo
API backend robusta, segura e escalável desenvolvida para gerenciar dados de turismo (pontos turísticos, restaurantes e acomodações), construída em Node.js com integração ao Firebase.

🛠️ Tecnologias Utilizadas
Node.js & Express: Construção da arquitetura da API e roteamento dinâmico.

Firebase (Firestore & Storage): Banco de dados NoSQL em tempo real e armazenamento seguro de arquivos de mídia.

Firebase Auth: Proteção e autenticação de rotas por token.

Joi: Validação rigorosa de dados de entrada.

Express Rate Limit: Proteção contra ataques de força bruta e spam por IP.

Jest & Supertest: Framework de testes automatizados para garantia de qualidade.

📂 Arquitetura e Diferenciais
Rotas Dinâmicas por Parâmetro (:tipo): O sistema utiliza um dicionário unificado (colecoesMap) para lidar com diferentes categorias (pontos turísticos, restaurantes, acomodações) de forma genérica e limpa, eliminando código duplicado.

Paginação e Ordenação: Suporte a parâmetros de consulta (?limit=X) e ordenação automática por data de criação (createdAt).

Gestão Inteligente de Mídia: Exclusão automática de arquivos associados no Firebase Storage ao apagar um registro.

📡 Endpoints da API

Método	Rota	Descrição	Autenticação
GET	/api/:tipo	Lista os itens da categoria (com paginação opcional)	Pública

POST	/api/:tipo	Cadastra um novo item com validação Joi	Requer Token (Bearer)

PUT	/api/:tipo/:id	Atualiza um item existente	Requer Token (Bearer)

DELETE	/api/:tipo/:id	Remove o item do banco e limpa arquivos do Storage	Requer Token (Bearer)

⚙️ Como Executar o Projeto Localmente
Clone o repositório:

Bash

git clone https://github.com/ifragas/turismo-api.git
Instale as dependências:

Bash

npm install
Configure as variáveis de ambiente com as credenciais do seu projeto Firebase.

Inicie o servidor em modo de desenvolvimento:

Bash

npm run dev
Para rodar os testes automatizados:

Bash

npm test