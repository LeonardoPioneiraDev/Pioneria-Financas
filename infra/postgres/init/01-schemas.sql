-- Cria os 4 schemas conforme Leia/03_BANCO_DE_DADOS.md
-- Executado uma unica vez na criacao do volume do Postgres.

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS audit;

-- Extensoes uteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Comentarios
COMMENT ON SCHEMA identity IS 'Usuarios, papeis, permissoes (espelho do Keycloak)';
COMMENT ON SCHEMA finance IS 'Tabelas canonicas de negocio';
COMMENT ON SCHEMA integration IS 'Staging + metadata de sincronizacao com sistemas externos';
COMMENT ON SCHEMA audit IS 'Trilha de auditoria e observabilidade';
