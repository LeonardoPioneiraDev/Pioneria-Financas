import { buildApp } from '@/app.js';

async function start(): Promise<void> {
  const app = await buildApp();
  const { host, port } = app.config.backend;

  try {
    await app.listen({ host, port });
    app.log.info(`Pioneira Financas backend rodando em http://${host}:${port}`);
    if (app.config.nodeEnv !== 'production') {
      app.log.info(`Swagger UI disponivel em http://${host}:${port}/docs`);
    }
  } catch (err) {
    app.log.fatal({ err }, 'Falha ao iniciar servidor');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Recebido sinal de encerramento');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Erro ao encerrar');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void start();
