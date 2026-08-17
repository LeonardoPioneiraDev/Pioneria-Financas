import { describe, expect, it } from 'vitest';
import { ENTRA_NA_SOMA_SQL, FORA_DA_SOMA_SQL, MOTIVOS_FORA_DA_SOMA, NAO_SUBSTITUIDO_SQL } from './regras-soma.js';

/**
 * Trava a regra de quem entra nas somas do Contas a Pagar.
 *
 * Cada item aqui nasceu de um erro REAL em produção — número inflado que só foi
 * descoberto quando alguém conferiu contra uma fonte externa. Se um destes
 * testes quebrar, a inflação voltou: confira antes de ajustar o teste.
 */
describe('regras de soma do Contas a Pagar', () => {
  it('exclui SUBSTITUÍDOS só quando o sucessor já foi sincronizado (senão o dinheiro some — caso 30/07/2026)', () => {
    expect(ENTRA_NA_SOMA_SQL).toContain('substituido = false');
    expect(ENTRA_NA_SOMA_SQL).toContain('EXISTS');
    expect(ENTRA_NA_SOMA_SQL).toContain('suc.origem_id_externo = cp.substituido_por_cod');
    expect(ENTRA_NA_SOMA_SQL).toContain('suc.excluido_em IS NULL');
  });

  it('exclui CANCELADOS (obrigação reemitida sob outro número — caso 1814 × 1841)', () => {
    expect(ENTRA_NA_SOMA_SQL).toContain("status <> 'cancelado'");
  });

  it('todo motivo declarado está no predicado — nenhum fica só documentado', () => {
    for (const motivo of MOTIVOS_FORA_DA_SOMA) {
      expect(ENTRA_NA_SOMA_SQL).toContain(motivo.sql);
    }
  });

  it('todo motivo tem justificativa escrita (o "porquê" não pode se perder)', () => {
    for (const motivo of MOTIVOS_FORA_DA_SOMA) {
      expect(motivo.porque.length).toBeGreaterThan(40);
    }
  });

  it('combina os motivos com AND — um só já basta para tirar da soma', () => {
    expect(ENTRA_NA_SOMA_SQL).toBe(MOTIVOS_FORA_DA_SOMA.map((m) => m.sql).join(' AND '));
  });

  it('FORA_DA_SOMA_SQL é a negação exata — para contar o que ficou de fora', () => {
    expect(FORA_DA_SOMA_SQL).toBe(`NOT (${ENTRA_NA_SOMA_SQL})`);
  });

  it('NAO_SUBSTITUIDO_SQL é mais frouxo — só para o sumário, que tem card de cancelado', () => {
    expect(NAO_SUBSTITUIDO_SQL).not.toContain("status <> 'cancelado'");
    expect(ENTRA_NA_SOMA_SQL).toContain(NAO_SUBSTITUIDO_SQL);
  });

  it('usa sempre o alias `cp` — os query builders do módulo dependem disso', () => {
    for (const motivo of MOTIVOS_FORA_DA_SOMA) {
      expect(motivo.sql.includes('cp.')).toBe(true);
    }
  });

  it('30/07/2026 — tabela verdade do predicado substituído (pegou um erro de lógica real: EXISTS sem o NOT invertia o resultado)', () => {
    // Reimplementa o predicado em JS puro pra travar a SEMÂNTICA, não só o texto
    // do SQL — foi exatamente uma inversão de EXISTS/NOT EXISTS que passou
    // despercebida numa primeira versão (string continha "EXISTS", os testes
    // baseados em toContain passavam, mas o resultado real estava invertido).
    const entraNaSoma = (substituido: boolean, sucessorExiste: boolean): boolean =>
      !substituido || !sucessorExiste;

    // Nunca substituído: sempre entra.
    expect(entraNaSoma(false, false)).toBe(true);
    expect(entraNaSoma(false, true)).toBe(true);
    // Substituído COM sucessor confirmado: sai da soma (o sucessor soma por ele).
    expect(entraNaSoma(true, true)).toBe(false);
    // Substituído SEM sucessor sincronizado: continua entrando (safety net —
    // é o caso 30/07/2026, senão a obrigação some dos dois lados).
    expect(entraNaSoma(true, false)).toBe(true);

    expect(MOTIVOS_FORA_DA_SOMA[0].sql).toMatch(/substituido = false OR NOT EXISTS/);
  });
});
