/**
 * Cria o primeiro usuario admin do sistema. Roda apenas uma vez no go-live.
 *
 * Uso:
 *   pnpm --filter @pioneira/backend seed:admin
 *
 * Variaveis necessarias:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_NOME, SEED_ADMIN_SENHA
 */
import 'reflect-metadata';
import bcrypt from 'bcrypt';
import { AppDataSource } from '@/data-source.js';
import { User } from '@/entities/user.entity.js';

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const nome = process.env.SEED_ADMIN_NOME;
  const senha = process.env.SEED_ADMIN_SENHA;

  if (!email || !nome || !senha) {
    console.error('Defina SEED_ADMIN_EMAIL, SEED_ADMIN_NOME e SEED_ADMIN_SENHA antes de rodar.');
    process.exit(1);
  }

  if (senha.length < 8) {
    console.error('SEED_ADMIN_SENHA precisa ter pelo menos 8 caracteres.');
    process.exit(1);
  }

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(User);

  const existente = await repo.findOne({ where: { email } });
  if (existente) {
    console.log(`Usuario ${email} ja existe (id=${existente.id}). Nada a fazer.`);
    await AppDataSource.destroy();
    return;
  }

  const senhaHash = await bcrypt.hash(senha, 12);
  const user = repo.create({
    email,
    nomeCompleto: nome,
    role: 'admin',
    ativo: true,
    mustChangePassword: false,
    senhaHash,
  });
  await repo.save(user);

  console.log(`Admin criado: ${user.email} (id=${user.id})`);
  console.log('Agora voce pode fazer login pelo frontend.');

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
