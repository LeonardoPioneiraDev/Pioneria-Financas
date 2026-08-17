import { describe, expect, it } from 'vitest';
import { expandirSeMesmaData } from './date-range.js';

/**
 * Trava a regra "dia inteiro" de filtros por período: `dtFim` é sempre a
 * última data que o usuário quer INCLUÍDA, então esta função sempre soma +1
 * dia antes do WHERE semi-aberto (`coluna >= dtIni AND coluna < dtFim`).
 *
 * Nasceu de dois bugs reais:
 * - 30/07/2026: a Conferência com o Globus e o "Sincronizar" liam um
 *   intervalo VAZIO sempre que dtIni === dtFim (o filtro de UM dia — o mais
 *   comum), porque não passavam por esta função.
 * - 03/08/2026: mesmo passando pela função, um range de VÁRIOS dias distintos
 *   ("01/08 a 03/08") não expandia — o dia 03 inteiro sumia da lista, do
 *   sumário e da conferência com o Globus, silenciosamente. A expansão foi
 *   generalizada pra rodar sempre que `fim` existe, não só quando ini===fim.
 *
 * Se um destes testes quebrar, um dos dois bugs voltou.
 */
describe('expandirSeMesmaData', () => {
  it('mesma data nos dois campos -> expande fim em +1 dia (nao vira range vazio)', () => {
    const r = expandirSeMesmaData('2026-07-30', '2026-07-30');
    expect(r.ini).toBe('2026-07-30');
    expect(r.fim).toBe('2026-07-31');
    expect(r.fim).not.toBe(r.ini); // a regressao exata: fim === ini vira range vazio
  });

  it('range de varios dias -> tambem expande fim em +1 dia (inclui o ultimo dia digitado)', () => {
    const r = expandirSeMesmaData('2026-05-01', '2026-06-01');
    expect(r).toEqual({ ini: '2026-05-01', fim: '2026-06-02' });
  });

  it('so fim preenchido -> expande; so ini preenchido -> passa direto', () => {
    expect(expandirSeMesmaData('2026-07-30', undefined)).toEqual({ ini: '2026-07-30', fim: undefined });
    expect(expandirSeMesmaData(undefined, '2026-07-30')).toEqual({ ini: undefined, fim: '2026-07-31' });
  });

  it('nenhuma data -> passa direto', () => {
    expect(expandirSeMesmaData(undefined, undefined)).toEqual({ ini: undefined, fim: undefined });
  });

  it('expansao atravessa virada de mes/ano corretamente', () => {
    expect(expandirSeMesmaData('2026-07-31', '2026-07-31').fim).toBe('2026-08-01');
    expect(expandirSeMesmaData('2026-12-31', '2026-12-31').fim).toBe('2027-01-01');
  });
});
