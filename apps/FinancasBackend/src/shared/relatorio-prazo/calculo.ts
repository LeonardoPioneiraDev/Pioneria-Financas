/**
 * Cálculo da linha do tempo do projeto — da ideia até a produção.
 *
 * Funções PURAS, sem Fastify e sem banco, para que os dois consumidores usem
 * exatamente a mesma aritmética:
 *   - `modules/relatorio-prazo` (a tela do sistema, sempre ao vivo)
 *   - `scripts/gerar-relatorio-prazo.ts` (o documento HTML publicável)
 *
 * Se a conta mudar, muda aqui e os dois acompanham.
 */

/** Primeiro arquivo do MVP "Pioneira Insights" (carimbo do sistema de arquivos). */
export const INICIO_FASE_0 = '2026-03-27';
/** Commit inicial do repositório atual + docs de escopo escritos no mesmo dia. */
export const INICIO_FASE_1 = '2026-05-12';
/** Contas a Pagar registrado como "em produção" em Leia/ESTADO_ATUAL.md. */
export const CP_DECLARADO_PRONTO = '2026-05-21';
/** Rota usada como caso-referência do ciclo de validação. */
export const FUNCIONALIDADE_REFERENCIA = '/contas-pagar';

/** Fallback de duração de ciclo quando nenhum ciclo fechou ainda (dias). */
const CICLO_PADRAO_DIAS = 12;

export interface RegistroValidacao {
  funcionalidade: string;
  tipo: string;
  status: string;
  observacoes: string | null;
  /** 'YYYY-MM-DD' no fuso de São Paulo. */
  criadoEm: string;
}

export interface CicloValidacao {
  /** Média de dias entre a primeira conferência e a aprovação, nos ciclos fechados. */
  diasPorCiclo: number;
  /** Quantos ciclos realmente fecharam — 0 significa que `diasPorCiclo` é chute conservador. */
  baseadoEmCiclos: number;
}

export interface ReferenciaValidacao {
  funcionalidade: string;
  /** Dias entre "declarado pronto" e a aprovação. `null` se ainda não foi aprovado. */
  diasProntoAteValidado: number | null;
  /** Dias entre "declarado pronto" e a PRIMEIRA conferência. `null` se nunca foi conferido. */
  diasEsperandoConferencia: number | null;
  /** Sessões de conferência (dias distintos), não linhas de apontamento. */
  rodadas: number;
}

/**
 * Diferença em dias cheios entre duas datas 'YYYY-MM-DD'.
 * Usa UTC de propósito: a data já vem normalizada no fuso de São Paulo, então
 * montar em UTC evita que o horário de verão do runtime desloque a subtração.
 */
export function diasEntre(inicioIso: string, fimIso: string): number {
  const [ai, mi, di] = inicioIso.split('-').map(Number);
  const [af, mf, df] = fimIso.split('-').map(Number);
  const a = Date.UTC(ai ?? 0, (mi ?? 1) - 1, di ?? 1);
  const b = Date.UTC(af ?? 0, (mf ?? 1) - 1, df ?? 1);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Duração média de um ciclo de conferência, medida só nos ciclos que REALMENTE
 * fecharam (têm um registro `validado`). Ciclo aberto não entra na média — senão
 * um módulo que ninguém olhou ainda puxaria a projeção para baixo.
 */
export function calcularCicloValidacao(validacoes: readonly RegistroValidacao[]): CicloValidacao {
  const porFuncionalidade = new Map<string, RegistroValidacao[]>();
  for (const v of validacoes) {
    const lista = porFuncionalidade.get(v.funcionalidade) ?? [];
    lista.push(v);
    porFuncionalidade.set(v.funcionalidade, lista);
  }

  const duracoes: number[] = [];
  for (const registros of porFuncionalidade.values()) {
    const ordenados = [...registros].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
    const validado = ordenados.find((r) => r.status === 'validado');
    if (!validado) continue;
    // Ciclo fechado no mesmo dia ainda custou um dia de conferência.
    duracoes.push(Math.max(1, diasEntre(ordenados[0]!.criadoEm, validado.criadoEm)));
  }

  if (duracoes.length === 0) {
    return { diasPorCiclo: CICLO_PADRAO_DIAS, baseadoEmCiclos: 0 };
  }
  return {
    diasPorCiclo: Math.round(duracoes.reduce((s, d) => s + d, 0) / duracoes.length),
    baseadoEmCiclos: duracoes.length,
  };
}

/** Rastro do módulo usado como caso-referência da distância "pronto" × "validado". */
export function calcularReferencia(
  validacoes: readonly RegistroValidacao[],
  funcionalidade: string = FUNCIONALIDADE_REFERENCIA,
  declaradoPronto: string = CP_DECLARADO_PRONTO,
): ReferenciaValidacao {
  const registros = validacoes
    .filter((v) => v.funcionalidade === funcionalidade)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));

  const validado = registros.find((r) => r.status === 'validado');

  return {
    funcionalidade,
    diasProntoAteValidado: validado ? diasEntre(declaradoPronto, validado.criadoEm) : null,
    diasEsperandoConferencia: registros[0]
      ? diasEntre(declaradoPronto, registros[0].criadoEm)
      : null,
    rodadas: new Set(registros.map((r) => r.criadoEm)).size,
  };
}

/** Rotas que já têm um registro `validado`. */
export function rotasValidadas(validacoes: readonly RegistroValidacao[]): Set<string> {
  return new Set(validacoes.filter((v) => v.status === 'validado').map((v) => v.funcionalidade));
}
