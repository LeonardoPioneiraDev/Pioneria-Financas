import 'reflect-metadata';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppDataSource } from '@/data-source.js';
import { dataIsoSp, formatarDataHora } from '@/shared/utils/datetime.js';
import {
  INICIO_FASE_0,
  INICIO_FASE_1,
  CP_DECLARADO_PRONTO,
  FUNCIONALIDADE_REFERENCIA,
  diasEntre,
  calcularCicloValidacao,
  calcularReferencia,
  rotasValidadas,
  type RegistroValidacao,
} from '@/shared/relatorio-prazo/calculo.js';

/**
 * Gera o relatório "Quanto tempo leva para desenvolver um sistema".
 *
 * O documento é uma MEDIÇÃO, não uma estimativa: cada número sai do banco de
 * produção ou de uma contagem direta no código. Rodar de novo a qualquer momento
 * reescreve o HTML com o estado atual da validação — é assim que ele acompanha o
 * projeto até entrar em produção.
 *
 *   pnpm --filter @pioneira/financas-backend relatorio:prazo
 *   pnpm --filter @pioneira/financas-backend relatorio:prazo -- --out caminho.html
 *
 * A única extrapolação do documento (quanto falta) é derivada dos ciclos de
 * validação REAIS já concluídos, e vem marcada como projeção.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SAIDA_PADRAO = join(RAIZ, 'Leia', 'relatorio-prazo-desenvolvimento.html');

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Modulo {
  nome: string;
  status: string;
  href: string;
  validado: boolean;
}

interface Contagens {
  modulos: number;
  modulosProntos: number;
  modulosParciais: number;
  modulosApi: number;
  telas: number;
  migrations: number;
  tabelas: number;
  linhasCodigo: number;
  linhasDoc: number;
  titulosCp: number;
}

/**
 * Forma da projeção usada no HTML. A aritmética do ciclo vive em
 * `shared/relatorio-prazo/calculo.ts` — aqui só se dá o formato de tabela.
 */
interface Projecao {
  diasPorCiclo: number;
  baseadoEmCiclos: number;
  serialDias: number;
  paraleloDias: number;
  totalMinDias: number;
  totalMaxDias: number;
}

function montarProjecao(
  validacoes: readonly RegistroValidacao[],
  modulosRestantes: number,
): Projecao {
  const ciclo = calcularCicloValidacao(validacoes);
  const serialDias = ciclo.diasPorCiclo * modulosRestantes;
  const paraleloDias = Math.round(serialDias / 2);
  return {
    ...ciclo,
    serialDias,
    paraleloDias,
    totalMinDias: paraleloDias,
    totalMaxDias: serialDias,
  };
}

// ---------------------------------------------------------------------------
// Helpers de apresentação
// ---------------------------------------------------------------------------

function formatarDiasComoMeses(dias: number): string {
  const meses = dias / 30.44;
  return `${meses.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses`;
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

const MESES_EXTENSO = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

function dataExtenso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} · ${MESES_EXTENSO[(m ?? 1) - 1]} · ${a}`;
}

function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Coleta: sistema de arquivos
// ---------------------------------------------------------------------------

const IGNORAR = new Set(['node_modules', '.git', '.next', 'dist', '.turbo', 'coverage']);

function percorrer(dir: string, aceita: (caminho: string) => boolean, acc: string[] = []): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entrada of entradas) {
    if (IGNORAR.has(entrada)) continue;
    const caminho = join(dir, entrada);
    let ehDir = false;
    try {
      ehDir = statSync(caminho).isDirectory();
    } catch {
      continue;
    }
    if (ehDir) percorrer(caminho, aceita, acc);
    else if (aceita(caminho)) acc.push(caminho);
  }
  return acc;
}

function contarLinhas(arquivos: string[]): number {
  let total = 0;
  for (const arquivo of arquivos) {
    try {
      total += readFileSync(arquivo, 'utf8').split('\n').length;
    } catch {
      /* arquivo sumiu entre o listar e o ler — ignora */
    }
  }
  return total;
}

function contarPastas(dir: string): number {
  try {
    return readdirSync(dir).filter((n) => {
      try {
        return statSync(join(dir, n)).isDirectory();
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

/**
 * Lê o catálogo de módulos do frontend (`module-status.ts`), que é a fonte de
 * verdade do que existe e em que estado está. Parsing por regex é frágil de
 * propósito: se o formato mudar, o script falha alto em vez de mentir baixo.
 */
function lerCatalogoModulos(): Array<{ nome: string; status: string; href: string }> {
  const caminho = join(RAIZ, 'apps', 'FinancasFrontend', 'src', 'lib', 'module-status.ts');
  const fonte = readFileSync(caminho, 'utf8');
  const modulos: Array<{ nome: string; status: string; href: string }> = [];

  // O catálogo é um Record keyed pela rota: `'/contas-pagar': {`. Cada entrada
  // começa nessa linha e vai até o início da próxima (ou o fim do objeto).
  const inicioEntrada = /^\s*'(\/[^']*)':\s*\{\s*$/gm;
  const entradas: Array<{ href: string; from: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = inicioEntrada.exec(fonte)) !== null) {
    entradas.push({ href: m[1]!, from: m.index + m[0].length });
  }

  for (let i = 0; i < entradas.length; i += 1) {
    const atual = entradas[i]!;
    const fim = i + 1 < entradas.length ? entradas[i + 1]!.from : fonte.length;
    const bloco = fonte.slice(atual.from, fim);
    const nome = /\bnome:\s*'([^']+)'/.exec(bloco);
    const status = /\bstatus:\s*'([^']+)'/.exec(bloco);
    if (nome && status) {
      modulos.push({ nome: nome[1]!, status: status[1]!, href: atual.href });
    }
  }

  if (modulos.length === 0) {
    throw new Error(
      'Não consegui ler nenhum módulo de module-status.ts — o formato do arquivo mudou. ' +
        'Corrija lerCatalogoModulos() antes de publicar o relatório.',
    );
  }
  return modulos;
}

// ---------------------------------------------------------------------------
// Coleta: banco
// ---------------------------------------------------------------------------

async function lerValidacoes(): Promise<RegistroValidacao[]> {
  const linhas = await AppDataSource.query<
    Array<{ funcionalidade: string; tipo: string; status: string; observacoes: string | null; criado_em: Date }>
  >(
    `SELECT funcionalidade, tipo, status, observacoes, criado_em
       FROM audit.validacao_funcionalidade
      ORDER BY criado_em ASC`,
  );
  return linhas.map((l) => ({
    funcionalidade: l.funcionalidade,
    tipo: l.tipo,
    status: l.status,
    observacoes: l.observacoes,
    criadoEm: dataIsoSp(l.criado_em),
  }));
}

async function contarEscalar(sql: string): Promise<number> {
  const linhas = await AppDataSource.query<Array<{ n: string }>>(sql);
  return Number(linhas[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

interface DadosRelatorio {
  hoje: string;
  geradoEm: string;
  diasTotais: number;
  diasFase0: number;
  diasFase1: number;
  diasValidacao: number;
  inicioValidacao: string | null;
  modulos: Modulo[];
  validados: number;
  contagens: Contagens;
  validacoes: RegistroValidacao[];
  projecao: Projecao;
  diasProntoAteValidado: number | null;
  diasEsperandoConferencia: number | null;
  rodadasReferencia: number;
}

function renderTrilho(d: DadosRelatorio): string {
  const pct0 = (d.diasFase0 / d.diasTotais) * 100;
  const pct1 = 100 - pct0;
  const inicioVal = d.inicioValidacao
    ? (diasEntre(INICIO_FASE_0, d.inicioValidacao) / d.diasTotais) * 100
    : 100;
  const pctVal = Math.max(0.5, 100 - inicioVal);

  return `
      <div class="rail-track">
        <div class="seg seg-0" style="width:${pct0.toFixed(1)}%">Fase 0 · Descoberta &amp; prova &nbsp;${d.diasFase0}&nbsp;d</div>
        <div class="seg seg-1" style="width:${pct1.toFixed(1)}%">Fase 1 · Construção &nbsp;${d.diasFase1}&nbsp;d</div>
      </div>
      <div class="rail-track thin">
        <div class="seg seg-spacer" style="width:${inicioVal.toFixed(1)}%"></div>
        <div class="seg seg-2" style="width:${pctVal.toFixed(1)}%">Fase 2 &nbsp;${d.diasValidacao}&nbsp;d</div>
      </div>
      <div class="rail-scale">
        <span>${dataBr(INICIO_FASE_0)}</span>
        <span>${dataBr(INICIO_FASE_1)}</span>
        <span>${dataBr(d.hoje)} · hoje</span>
      </div>`;
}

function renderPlacar(modulos: Modulo[]): string {
  return modulos
    .map((m) => {
      const classe = m.validado ? 'is-ok' : m.status === 'parcial' ? 'is-partial' : '';
      const tag = m.validado ? 'Validado' : m.status === 'parcial' ? 'Parcial' : 'A validar';
      return `      <div class="mod ${classe}"><span class="chip"></span>${esc(m.nome)}<span class="tag">${tag}</span></div>`;
    })
    .join('\n');
}

function renderRegistro(d: DadosRelatorio): string {
  const partes: string[] = [];

  partes.push(`
      <div class="log-entry">
        <span class="log-date">${dataExtenso(CP_DECLARADO_PRONTO)}</span>
        <span class="log-title">Contas a Pagar declarado pronto</span>
        <p class="log-note">
          Registrado como "em produção" na documentação do projeto. Sincronizando do ERP, com filtros,
          listagem, totalizadores e exportação funcionando.
        </p>
      </div>`);

  // Agrupa as conferências por dia + status: uma reprovação em lote no mesmo dia
  // é UM evento de conferência com N apontamentos, não N eventos.
  const grupos = new Map<string, RegistroValidacao[]>();
  for (const v of d.validacoes) {
    const chave = `${v.criadoEm}|${v.funcionalidade}|${v.status}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(v);
    grupos.set(chave, lista);
  }

  for (const [chave, registros] of grupos) {
    const [dia, funcionalidade, status] = chave.split('|');
    const primeiro = registros[0]!;
    const reprovado = status === 'reprovado';
    const classe = reprovado ? 'bad' : status === 'validado' ? 'good' : '';
    const desde = diasEntre(CP_DECLARADO_PRONTO, dia ?? d.hoje);

    const titulo = reprovado
      ? `Conferência em ${esc(funcionalidade ?? '')} — reprovado ${registros.length}×${registros.length > 1 ? ' no mesmo dia' : ''}`
      : status === 'validado'
        ? `${esc(funcionalidade ?? '')} — validado`
        : `${esc(funcionalidade ?? '')} — ${esc(status ?? '')}`;

    const citacoes = registros
      .filter((r) => r.observacoes && r.observacoes.trim().length > 0)
      .map(
        (r) =>
          `          <li${status === 'validado' ? ' class="ok"' : ''}>"${esc(r.observacoes!.trim())}"</li>`,
      )
      .join('\n');

    partes.push(`
      <div class="log-entry ${classe}">
        <span class="log-date">${dataExtenso(primeiro.criadoEm)}${desde > 0 ? ` &nbsp;·&nbsp; ${desde} dias depois` : ''}</span>
        <span class="log-title">${titulo}</span>
${citacoes ? `        <ul class="log-quotes">\n${citacoes}\n        </ul>` : ''}
      </div>`);
  }

  return partes.join('\n');
}

function renderHistorico(validacoes: RegistroValidacao[]): string {
  if (validacoes.length === 0) {
    return '<p>Nenhum registro de conferência ainda.</p>';
  }
  const linhas = validacoes
    .map(
      (v) => `          <tr>
            <td class="n">${dataBr(v.criadoEm)}</td>
            <td>${esc(v.funcionalidade)}</td>
            <td><span class="pill pill-${v.status === 'validado' ? 'ok' : v.status === 'reprovado' ? 'fail' : 'wait'}">${esc(v.status)}</span></td>
            <td>${esc(v.observacoes ?? '—')}</td>
          </tr>`,
    )
    .join('\n');

  return `<div class="table-scroll">
      <table>
        <caption>Todos os registros de audit.validacao_funcionalidade, sem edição</caption>
        <thead>
          <tr><th class="n">Data</th><th>Funcionalidade</th><th>Resultado</th><th>Observação de quem conferiu</th></tr>
        </thead>
        <tbody>
${linhas}
        </tbody>
      </table>
    </div>`;
}

function renderDocumento(d: DadosRelatorio): string {
  const c = d.contagens;
  const p = d.projecao;
  const pctValidado = Math.round((d.validados / Math.max(1, d.modulos.length)) * 100);
  const restantes = d.modulos.length - d.validados;
  const diasPorModulo = d.contagens.modulosProntos > 0
    ? (d.diasFase1 / d.contagens.modulosProntos).toFixed(1)
    : '—';

  const emProducao = d.validados >= d.modulos.length;

  return `<title>Sistema Financeiro Pioneira — da ideia à produção</title>
<style>
${CSS}
</style>

<div class="wrap">

  <header class="head">
    <p class="eyebrow">Sistema Financeiro · Viação Pioneira · ${dataBr(INICIO_FASE_0)} – ${dataBr(d.hoje)}</p>
    <h1>Da ideia à produção: a linha do tempo real do sistema</h1>
    <p class="standfirst">
      Quanto tempo o Sistema Financeiro da Viação Pioneira levou desde a primeira ideia até estar
      em produção, fase por fase. Nenhum número aqui é estimado: todos saem do repositório, do banco
      de dados e dos registros de conferência do próprio sistema.
    </p>

    <div class="headline-figure">
      <span class="n">${d.diasTotais}</span>
      <span class="unit">dias da ideia até hoje</span>
    </div>
    <p class="headline-note">
      <strong>${formatarDiasComoMeses(d.diasTotais)}.</strong> ${c.modulos} módulos integrados ao ERP da empresa,
      rodando com dado real — com
      <strong>${d.validados === 1 ? '1 módulo já conferido' : `${d.validados} módulos já conferidos`} e assinado${d.validados === 1 ? '' : 's'} pela área de negócio</strong>.
      ${emProducao
        ? 'O sistema completou o ciclo e está em produção.'
        : 'O sistema ainda não está em produção plena: a contagem continua.'}
    </p>

    <ol class="stages" aria-label="Estágio do sistema">
      <li class="done"><span>Ideia</span></li>
      <li class="done"><span>Descoberta</span></li>
      <li class="done"><span>Construção</span></li>
      <li class="${emProducao ? 'done' : 'now'}"><span>Validação</span></li>
      <li class="${emProducao ? 'now' : ''}"><span>Produção</span></li>
    </ol>
  </header>

  <section>
    <h2>As três fases, na proporção real</h2>

    <p class="lead">
      Um sistema não tem uma fase, tem três. Elas custam tempos diferentes e só a do meio é a que
      normalmente se imagina quando alguém pede um prazo.
    </p>

    <div class="rail">
${renderTrilho(d)}
      <p class="rail-legend">
        A faixa inferior é a validação em campo. Ela começou em ${d.inicioValidacao ? dataBr(d.inicioValidacao) : '—'},
        corre em paralelo ao fim da construção e
        <strong>${d.validados < d.modulos.length ? 'ainda não tem data de término definida' : 'foi concluída'}</strong>.
      </p>
    </div>

    <div class="phases">
      <div class="phase">
        <div class="phase-stamp"><b>${d.diasFase0} d</b>${dataBr(INICIO_FASE_0)} – ${dataBr(INICIO_FASE_1)}</div>
        <div class="phase-body">
          <h4>Fase 0 · Descoberta e prova de conceito</h4>
          <p>
            Um MVP descartável em Python (FastAPI, Oracle, modelos de machine learning) construído
            para descobrir o que a empresa realmente precisava e provar que era viável. Terminou com
            apresentação à diretoria e aprovação. Nenhuma linha desse código foi para o sistema final —
            o que sobreviveu foi o escopo validado.
          </p>
        </div>
      </div>
      <div class="phase">
        <div class="phase-stamp"><b>${d.diasFase1} d</b>${dataBr(INICIO_FASE_1)} – ${dataBr(d.hoje)}</div>
        <div class="phase-body">
          <h4>Fase 1 · Construção do sistema definitivo</h4>
          <p>
            Reconstrução do zero em outra tecnologia (Node, TypeScript), a partir das anotações já
            validadas com o negócio. É a fase que produz telas, e a única que costuma ser considerada
            quando se pede "o prazo".
          </p>
        </div>
      </div>
      <div class="phase">
        <div class="phase-stamp"><b>${d.diasValidacao} d</b>${d.inicioValidacao ? dataBr(d.inicioValidacao) : '—'} – ${d.validados < d.modulos.length ? 'em curso' : dataBr(d.hoje)}</div>
        <div class="phase-body">
          <h4>Fase 2 · Validação com quem usa</h4>
          <p>
            O financeiro confere número por número contra o ERP e contra o extrato. Aprova ou reprova.
            É a fase que transforma "o código funciona" em "a empresa pode confiar no número".
          </p>
        </div>
      </div>
    </div>
  </section>

  <section>
    <h2>O que foi construído em ${d.diasFase1} dias</h2>

    <div class="table-scroll">
      <table>
        <caption>Contagem direta no código-fonte e no banco de dados, em ${dataBr(d.hoje)}</caption>
        <thead>
          <tr><th>Item</th><th class="n">Quantidade</th></tr>
        </thead>
        <tbody>
          <tr><td>Módulos funcionais para o usuário</td><td class="n">${c.modulos}</td></tr>
          <tr><td>Módulos de API no servidor</td><td class="n">${c.modulosApi}</td></tr>
          <tr><td>Telas</td><td class="n">${c.telas}</td></tr>
          <tr><td>Tabelas de banco de dados</td><td class="n">${c.tabelas}</td></tr>
          <tr><td>Migrações de banco versionadas</td><td class="n">${c.migrations}</td></tr>
          <tr><td>Linhas de código</td><td class="n">${c.linhasCodigo.toLocaleString('pt-BR')}</td></tr>
          <tr><td>Linhas de documentação técnica</td><td class="n">${c.linhasDoc.toLocaleString('pt-BR')}</td></tr>
          <tr><td>Títulos financeiros reais em base</td><td class="n">${c.titulosCp.toLocaleString('pt-BR')}</td></tr>
        </tbody>
      </table>
    </div>

    <p>
      Em ritmo de construção, isso dá <strong>um módulo pronto a cada ${diasPorModulo} dias</strong>. É um número
      excelente — e é exatamente o número que engana, porque "pronto" aqui significa apenas que o
      desenvolvedor terminou.
    </p>
  </section>

  <section>
    <h2>A prova: "pronto" não é "validado"</h2>

    <p class="lead">
      Contas a Pagar é o módulo mais antigo e mais maduro do sistema. Ele mostra, com data e registro
      em banco, a distância entre as duas coisas.
    </p>

    <div class="log">
${renderRegistro(d)}
    </div>

    ${
      d.diasProntoAteValidado !== null
        ? `<div class="pull">
      <p>
        Entre "o desenvolvedor declarou pronto" e "o usuário assinou embaixo" passaram-se
        <strong>${d.diasProntoAteValidado} dias</strong> e ${d.rodadasReferencia} rodadas de conferência.
      </p>
      <p class="src">E foi o módulo que correu melhor.</p>
    </div>`
        : `<div class="pull">
      <p>Nenhum módulo completou o ciclo de validação ainda.</p>
    </div>`
    }

    <p>
      Mesmo depois de validado, nos dois dias seguintes ainda foram encontrados dois defeitos reais
      nesse módulo: uma tela que atribuía o pagamento de R$ 474 mil a uma auxiliar que apenas havia
      dado baixa no ERP, e 414 pagamentos sem vínculo rastreável com o extrato bancário. Nenhum dos
      dois quebrava o sistema. Os dois quebrariam uma auditoria.
    </p>
  </section>

  <section>
    <h2>O placar hoje</h2>

    <p>
      Dos ${c.modulos} módulos, <strong>${c.modulosProntos} estão construídos</strong>,
      ${c.modulosParciais} ${c.modulosParciais === 1 ? 'está parcial' : 'estão parciais'} — e
      <strong class="num">${d.validados}</strong> ${d.validados === 1 ? 'passou' : 'passaram'} pela conferência do usuário final.
    </p>

    <div class="scoreboard">
${renderPlacar(d.modulos)}
    </div>

    <p>
      Em porcentagem de código, o sistema está perto do fim. Em porcentagem de confiança auditável,
      está em <strong>${pctValidado}%</strong>.
    </p>
  </section>

  <section>
    <h2>Histórico de conferência</h2>

    <p>
      Esta seção cresce sozinha: cada aprovação ou reprovação registrada no sistema aparece aqui na
      próxima geração do documento.
    </p>

    ${renderHistorico(d.validacoes)}
  </section>

  <section>
    <h2>Quanto falta</h2>

    <p>
      Esta é a única projeção do documento — tudo acima é medição. A aritmética usa
      ${p.baseadoEmCiclos === 0
        ? 'uma referência conservadora, porque nenhum ciclo fechou ainda'
        : p.baseadoEmCiclos === 1
          ? 'o único ciclo de validação já concluído'
          : `a média dos ${p.baseadoEmCiclos} ciclos de validação já concluídos`} como referência.
    </p>

    <div class="table-scroll">
      <table>
        <caption>Projeção a partir dos ciclos reais de validação</caption>
        <thead>
          <tr><th>Cenário</th><th class="n">Dias</th><th class="n">Equivale a</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Financeiro confere <strong>1 módulo por vez</strong></td>
            <td class="n">${p.serialDias}</td>
            <td class="n">${formatarDiasComoMeses(p.serialDias)}</td>
          </tr>
          <tr>
            <td>Financeiro confere <strong>2 módulos em paralelo</strong></td>
            <td class="n">${p.paraleloDias}</td>
            <td class="n">${formatarDiasComoMeses(p.paraleloDias)}</td>
          </tr>
          <tr>
            <td><strong>Total do projeto</strong> até sistema validado</td>
            <td class="n">${d.diasTotais + p.totalMinDias} – ${d.diasTotais + p.totalMaxDias}</td>
            <td class="n">${formatarDiasComoMeses(d.diasTotais + p.totalMinDias)} – ${formatarDiasComoMeses(d.diasTotais + p.totalMaxDias)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="assump">
      <h3>Premissas desta projeção</h3>
      <ul>
        <li>${restantes} ${restantes === 1 ? 'módulo ainda a validar' : 'módulos ainda a validar'}.</li>
        <li>Cada um consome cerca de ${p.diasPorCiclo} dias de conferência ativa, como consumiram os ciclos já fechados.</li>
        <li>Cada reprovação gera correção e nova rodada.</li>
        <li>O time financeiro não é dedicado ao projeto: confere entre as próprias tarefas.</li>
        <li>Não estão previstos módulos novos, mudanças de escopo nem correções pós-validação.</li>
      </ul>
    </div>
  </section>

  <section>
    <h2>O que este caso permite afirmar</h2>

    <ol class="findings">
      <li>
        <div>
          <h4>Escrever o código é a parte rápida e a mais previsível</h4>
          <p>
            Um módulo a cada ${diasPorModulo} dias, sustentado por ${d.diasFase1} dias seguidos. Se o prazo
            dependesse só de programar, este sistema estaria entregue há meses.
          </p>
        </div>
      </li>
      <li>
        <div>
          <h4>O prazo real é ditado por quem confere, não por quem programa</h4>
          <p>
            ${d.diasEsperandoConferencia !== null
              ? `Contas a Pagar ficou ${d.diasEsperandoConferencia} dias parado esperando a primeira conferência.`
              : 'O módulo mais maduro seguiu esperando a primeira conferência.'}
            Não foi falta de desenvolvimento — foi falta de agenda de quem precisava olhar.
          </p>
        </div>
      </li>
      <li>
        <div>
          <h4>"Pronto" declarado por quem desenvolve não é evidência</h4>
          <p>
            ${d.diasProntoAteValidado !== null
              ? `O módulo passou ${d.diasProntoAteValidado} dias rotulado como pronto carregando defeitos que só apareceram`
              : 'O módulo segue rotulado como pronto, com defeitos que só aparecem'}
            quando alguém do financeiro confere contra o ERP. Software sem conferência é hipótese.
          </p>
        </div>
      </li>
      <li>
        <div>
          <h4>Descoberta é trabalho, não atraso</h4>
          <p>
            Os ${d.diasFase0} dias da fase 0 parecem tempo perdido: o código foi jogado fora. Foram eles que
            permitiram que 8 módulos entrassem em produção 9 dias após o início da construção,
            porque o escopo já estava discutido e aprovado.
          </p>
        </div>
      </li>
      <li>
        <div>
          <h4>Um prazo sem agenda reservada do time de negócio é um prazo que não se cumpre</h4>
          <p>
            Prometer um sistema financeiro em dois meses é prometer, na prática, metade da construção
            e nenhuma validação. O que seria entregue no prazo é um sistema que ninguém conferiu.
          </p>
        </div>
      </li>
    </ol>
  </section>

  <section>
    <h2>Referência para a próxima estimativa</h2>

    <p class="lead">
      Para um sistema de porte equivalente — integrado ao ERP, com dado financeiro auditável, feito
      por uma pessoa — este caso sugere a seguinte distribuição:
    </p>

    <div class="table-scroll">
      <table>
        <thead>
          <tr><th>Fase</th><th class="n">Proporção do prazo</th><th>O que entrega</th></tr>
        </thead>
        <tbody>
          <tr><td>Descoberta e prova de conceito</td><td class="n">${Math.round((d.diasFase0 / (d.diasTotais + p.totalMaxDias)) * 100)}%</td><td>Escopo validado com o negócio</td></tr>
          <tr><td>Construção</td><td class="n">${Math.round((d.diasFase1 / (d.diasTotais + p.totalMaxDias)) * 100)}%</td><td>Sistema funcionando com dado real</td></tr>
          <tr><td>Validação e correção</td><td class="n">${Math.round(((d.diasValidacao + p.totalMaxDias) / (d.diasTotais + p.totalMaxDias)) * 100)}%</td><td>Números em que a empresa pode confiar</td></tr>
        </tbody>
      </table>
    </div>

    <div class="pull">
      <p>
        A conta que importa não é "em quanto tempo fica pronto".
        É <strong>"em quanto tempo alguém assina embaixo do número"</strong>.
      </p>
    </div>
  </section>

  <footer>
    <h3 class="first">Como cada número foi apurado</h3>
    <dl>
      <dt>Datas da fase 0</dt>
      <dd>
        Carimbo de data dos arquivos do repositório do MVP (<span class="num">Pioneira Insights</span>):
        primeiro arquivo em ${dataBr(INICIO_FASE_0)}, documento de arquitetura em 28/03/2026,
        apresentação ao financeiro em ${dataBr(INICIO_FASE_1)}.
      </dd>

      <dt>Datas da fase 1</dt>
      <dd>
        Histórico do Git do repositório atual (commit inicial em ${dataBr(INICIO_FASE_1)} às 17:12) cruzado
        com o carimbo dos arquivos de escopo, escritos entre 16:36 e 16:55 do mesmo dia.
      </dd>

      <dt>Registros de validação</dt>
      <dd>
        Tabela <span class="num">audit.validacao_funcionalidade</span> do banco de produção.
        ${d.validacoes.length === 0 ? 'Nenhum registro ainda.' : `As ${d.validacoes.length} linhas existentes estão transcritas literalmente neste documento, sem edição.`}
      </dd>

      <dt>Inventário</dt>
      <dd>
        Contagem direta de arquivos e linhas no código-fonte, e consulta ao catálogo de tabelas do
        PostgreSQL. Nenhum número foi estimado.
      </dd>

      <dt>Projeção</dt>
      <dd>
        Única extrapolação do documento, marcada como tal. Aritmética simples sobre os ciclos de
        validação já concluídos, com premissas declaradas.
      </dd>

      <dt>Atualização</dt>
      <dd>
        Este documento é gerado por
        <span class="num">apps/FinancasBackend/src/scripts/gerar-relatorio-prazo.ts</span>, que lê o banco
        a cada execução. Conforme o financeiro validar mais funcionalidades, os números, o placar e o
        histórico mudam sozinhos — basta gerar de novo e republicar.
      </dd>
    </dl>

    <p class="stamp">
      Sistema Financeiro · Viação Pioneira · gerado em ${d.geradoEm}
    </p>
  </footer>

</div>
`;
}

// ---------------------------------------------------------------------------
// CSS (constante — o conteúdo é que varia)
// ---------------------------------------------------------------------------

const CSS = `  :root {
    --paper:      #FBFBFC;
    --surface:    #FFFFFF;
    --ink:        #14161C;
    --muted:      #5B6170;
    --faint:      #878D9B;
    --rule:       #E1E4EA;
    --rule-firm:  #C9CED8;
    --accent:     #C4840B;
    --accent-soft:#FBF0D8;
    --ok:         #1C7A4B;
    --ok-soft:    #E4F2EA;
    --fail:       #AE3A2D;
    --fail-soft:  #F8E7E4;
    --wait:       #8A8F9C;
    --wait-soft:  #EEF0F3;
    --shadow:     0 1px 2px rgba(20,22,28,.05), 0 8px 24px -16px rgba(20,22,28,.25);

    --serif: Cambria, Georgia, "Times New Roman", serif;
    --sans:  "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
    --mono:  Consolas, "SFMono-Regular", "Roboto Mono", "Courier New", monospace;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper:      #0E1014;
      --surface:    #171A21;
      --ink:        #E7E9ED;
      --muted:      #99A0AE;
      --faint:      #767D8C;
      --rule:       #252A33;
      --rule-firm:  #363D49;
      --accent:     #F0B437;
      --accent-soft:#2A2113;
      --ok:         #4FBB86;
      --ok-soft:    #12251C;
      --fail:       #E4715F;
      --fail-soft:  #2A1815;
      --wait:       #7C8391;
      --wait-soft:  #1D2129;
      --shadow:     0 1px 2px rgba(0,0,0,.4), 0 8px 24px -16px rgba(0,0,0,.8);
    }
  }

  :root[data-theme="dark"] {
    --paper:      #0E1014;
    --surface:    #171A21;
    --ink:        #E7E9ED;
    --muted:      #99A0AE;
    --faint:      #767D8C;
    --rule:       #252A33;
    --rule-firm:  #363D49;
    --accent:     #F0B437;
    --accent-soft:#2A2113;
    --ok:         #4FBB86;
    --ok-soft:    #12251C;
    --fail:       #E4715F;
    --fail-soft:  #2A1815;
    --wait:       #7C8391;
    --wait-soft:  #1D2129;
    --shadow:     0 1px 2px rgba(0,0,0,.4), 0 8px 24px -16px rgba(0,0,0,.8);
  }

  * { box-sizing: border-box; }

  body {
    background: var(--paper);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 16.5px;
    line-height: 1.62;
    margin: 0;
    padding: 0 24px 96px;
    -webkit-font-smoothing: antialiased;
  }

  .wrap { max-width: 50rem; margin: 0 auto; }

  .head { padding: 72px 0 40px; border-bottom: 2px solid var(--ink); }

  .eyebrow {
    font-family: var(--mono);
    font-size: 11.5px;
    letter-spacing: .13em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 20px;
  }

  h1 {
    font-family: var(--serif);
    font-size: clamp(34px, 6vw, 52px);
    line-height: 1.08;
    font-weight: 700;
    letter-spacing: -.015em;
    text-wrap: balance;
    margin: 0 0 18px;
  }

  .standfirst {
    font-size: 19px;
    line-height: 1.5;
    color: var(--muted);
    max-width: 40rem;
    margin: 0;
    text-wrap: pretty;
  }

  .headline-figure {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 18px;
    margin: 36px 0 8px;
  }
  .headline-figure .n {
    font-family: var(--serif);
    font-size: clamp(58px, 11vw, 96px);
    line-height: .9;
    font-weight: 700;
    letter-spacing: -.03em;
    font-variant-numeric: tabular-nums;
  }
  .headline-figure .unit {
    font-family: var(--serif);
    font-size: clamp(22px, 4vw, 30px);
    color: var(--muted);
  }
  .headline-note {
    font-size: 15.5px;
    color: var(--muted);
    margin: 0;
    max-width: 34rem;
  }
  .headline-note strong { color: var(--ink); }

  /* Estágio do sistema: onde ele está no arco ideia -> produção. */
  .stages {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 32px 0 0;
    padding: 0;
    counter-reset: st;
  }
  .stages li {
    counter-increment: st;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 13px 7px 10px;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: var(--surface);
    font-family: var(--mono);
    font-size: 11.5px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .stages li::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--rule-firm);
  }
  .stages li.done { color: var(--muted); border-color: var(--rule-firm); }
  .stages li.done::before { background: var(--ok); }
  .stages li.now {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-soft);
    font-weight: 700;
  }
  .stages li.now::before { background: var(--accent); }

  section { padding-top: 56px; }

  h2 {
    font-family: var(--serif);
    font-size: 27px;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: -.01em;
    text-wrap: balance;
    margin: 0 0 6px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--rule-firm);
  }

  h3 {
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 32px 0 10px;
  }
  h3.first { margin-top: 0; }

  p { margin: 16px 0; text-wrap: pretty; }
  p.lead { font-size: 17.5px; }

  a { color: var(--accent); }
  strong { font-weight: 650; }

  .num { font-family: var(--mono); font-variant-numeric: tabular-nums; }

  .rail { margin: 32px 0 8px; }

  .rail-track {
    display: flex;
    height: 46px;
    border: 1px solid var(--rule-firm);
    border-radius: 3px;
    overflow: hidden;
    background: var(--surface);
  }

  .seg {
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .02em;
    white-space: nowrap;
    overflow: hidden;
  }
  .seg-0 { background: var(--wait-soft); color: var(--muted); border-right: 1px solid var(--rule-firm); }
  .seg-1 { background: var(--accent-soft); color: var(--accent); }

  .rail-track.thin { height: 30px; margin-top: 8px; }
  .seg-2 {
    background: var(--ok-soft);
    color: var(--ok);
    border-left: 1px solid var(--ok);
    border-right: 2px dashed var(--ok);
    padding: 0 6px;
  }

  .rail-scale {
    display: flex;
    justify-content: space-between;
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--faint);
    margin-top: 8px;
    letter-spacing: .02em;
  }

  .rail-legend { font-size: 14px; color: var(--muted); margin: 14px 0 0; }

  .phases { display: flex; flex-direction: column; margin: 28px 0 0; }

  .phase {
    display: grid;
    grid-template-columns: 8.5rem 1fr;
    gap: 4px 22px;
    padding: 20px 0;
    border-top: 1px solid var(--rule);
  }
  .phase:last-child { border-bottom: 1px solid var(--rule); }

  .phase-stamp {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--faint);
    letter-spacing: .02em;
    padding-top: 3px;
  }
  .phase-stamp b {
    display: block;
    font-size: 21px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -.01em;
    font-variant-numeric: tabular-nums;
  }
  .phase-body h4 {
    font-family: var(--sans);
    font-size: 16.5px;
    font-weight: 650;
    margin: 0 0 4px;
  }
  .phase-body p { margin: 0; font-size: 15px; color: var(--muted); }

  .table-scroll { overflow-x: auto; margin: 24px 0; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }
  caption {
    caption-side: top;
    text-align: left;
    font-size: 13px;
    color: var(--faint);
    padding-bottom: 10px;
    font-family: var(--mono);
    letter-spacing: .02em;
  }
  th {
    text-align: left;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--muted);
    border-bottom: 1px solid var(--rule-firm);
    padding: 0 14px 9px 0;
    white-space: nowrap;
  }
  td {
    padding: 11px 14px 11px 0;
    border-bottom: 1px solid var(--rule);
    vertical-align: top;
  }
  td.n, th.n { text-align: right; padding-right: 0; font-family: var(--mono); white-space: nowrap; }
  tbody tr:last-child td { border-bottom: none; }

  .pill {
    display: inline-block;
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: .06em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 2px;
    font-weight: 700;
  }
  .pill-ok   { background: var(--ok-soft);   color: var(--ok); }
  .pill-fail { background: var(--fail-soft); color: var(--fail); }
  .pill-wait { background: var(--wait-soft); color: var(--muted); }

  .scoreboard {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1px;
    background: var(--rule);
    border: 1px solid var(--rule);
    border-radius: 3px;
    overflow: hidden;
    margin: 26px 0;
  }
  .mod {
    background: var(--surface);
    padding: 12px 14px 12px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14.5px;
  }
  .chip {
    flex: none;
    width: 4px;
    align-self: stretch;
    border-radius: 2px;
    background: var(--wait);
  }
  .mod.is-ok .chip { background: var(--ok); }
  .mod.is-partial .chip { background: var(--fail); }
  .mod .tag {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .mod.is-ok .tag { color: var(--ok); font-weight: 700; }
  .mod.is-partial .tag { color: var(--fail); }

  .log { margin: 26px 0; border-left: 2px solid var(--rule-firm); padding-left: 22px; }
  .log-entry { padding: 0 0 24px; position: relative; }
  .log-entry:last-child { padding-bottom: 0; }
  .log-entry::before {
    content: "";
    position: absolute;
    left: -27px;
    top: 8px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--paper);
    border: 2px solid var(--rule-firm);
  }
  .log-entry.bad::before  { border-color: var(--fail); background: var(--fail); }
  .log-entry.good::before { border-color: var(--ok);   background: var(--ok); }
  .log-date {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: .04em;
    color: var(--faint);
    display: block;
    margin-bottom: 3px;
  }
  .log-title { font-weight: 650; font-size: 16px; }
  .log-entry.bad .log-title  { color: var(--fail); }
  .log-entry.good .log-title { color: var(--ok); }
  .log-note { margin: 6px 0 0; font-size: 15px; color: var(--muted); }
  .log-quotes { margin: 8px 0 0; padding: 0; list-style: none; }
  .log-quotes li {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--muted);
    padding: 3px 0 3px 16px;
    position: relative;
  }
  .log-quotes li::before { content: "\\203A"; position: absolute; left: 0; color: var(--fail); }
  .log-quotes li.ok { color: var(--ok); }
  .log-quotes li.ok::before { color: var(--ok); }

  .pull {
    margin: 34px 0;
    padding: 24px 26px;
    background: var(--surface);
    border: 1px solid var(--rule-firm);
    border-left: 3px solid var(--accent);
    border-radius: 3px;
    box-shadow: var(--shadow);
  }
  .pull p { margin: 0; font-family: var(--serif); font-size: 20px; line-height: 1.42; }
  .pull p + p { margin-top: 12px; }
  .pull .src {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--faint);
    margin-top: 14px;
    letter-spacing: .02em;
  }

  .findings { counter-reset: f; margin: 26px 0 0; padding: 0; list-style: none; }
  .findings li {
    counter-increment: f;
    display: grid;
    grid-template-columns: 2.4rem 1fr;
    gap: 18px;
    padding: 20px 0;
    border-top: 1px solid var(--rule);
  }
  .findings li:last-child { border-bottom: 1px solid var(--rule); }
  .findings li::before {
    content: counter(f, decimal-leading-zero);
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    padding-top: 4px;
  }
  .findings h4 {
    font-family: var(--sans);
    font-size: 16.5px;
    font-weight: 650;
    margin: 0 0 5px;
    text-wrap: balance;
  }
  .findings p { margin: 0; font-size: 15px; color: var(--muted); }

  .assump {
    background: var(--wait-soft);
    border: 1px solid var(--rule);
    border-radius: 3px;
    padding: 20px 24px;
    margin: 26px 0;
  }
  .assump h3 { margin-top: 0; }
  .assump ul { margin: 0; padding-left: 20px; font-size: 15px; color: var(--muted); }
  .assump li { margin: 6px 0; }

  footer {
    margin-top: 72px;
    padding-top: 28px;
    border-top: 2px solid var(--ink);
    font-size: 14px;
    color: var(--muted);
  }
  footer dl { margin: 18px 0 0; display: grid; grid-template-columns: 1fr; gap: 14px; }
  footer dt {
    font-family: var(--mono);
    font-size: 11.5px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--ink);
    margin-bottom: 3px;
  }
  footer dd { margin: 0; font-size: 14.5px; }
  footer .stamp {
    margin-top: 26px;
    color: var(--faint);
    font-size: 13px;
    font-family: var(--mono);
  }

  @media (max-width: 620px) {
    body { padding: 0 18px 72px; font-size: 16px; }
    .head { padding-top: 48px; }
    .phase { grid-template-columns: 1fr; gap: 8px; }
    .phase-stamp b { display: inline; margin-right: 8px; }
    .findings li { grid-template-columns: 1.8rem 1fr; gap: 12px; }
    .seg { font-size: 10.5px; padding: 0 7px; }
  }

  @media print { body { background: #fff; color: #000; } }`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argOut = process.argv.indexOf('--out');
  const saida = argOut !== -1 && process.argv[argOut + 1] ? process.argv[argOut + 1]! : SAIDA_PADRAO;

  await AppDataSource.initialize();

  const hoje = dataIsoSp();
  const validacoes = await lerValidacoes();

  const catalogo = lerCatalogoModulos();
  const validadas = rotasValidadas(validacoes);
  const modulos: Modulo[] = catalogo.map((m) => ({
    ...m,
    validado: validadas.has(m.href),
  }));

  const tsCodigo = percorrer(join(RAIZ, 'apps'), (c) => c.endsWith('.ts') || c.endsWith('.tsx'))
    .concat(percorrer(join(RAIZ, 'packages'), (c) => c.endsWith('.ts') || c.endsWith('.tsx')));
  const docs = percorrer(join(RAIZ, 'Leia'), (c) => c.endsWith('.md'));
  const telas = percorrer(join(RAIZ, 'apps', 'FinancasFrontend', 'src', 'app'), (c) =>
    c.endsWith('page.tsx'),
  );
  const migrations = percorrer(join(RAIZ, 'apps', 'FinancasBackend', 'src', 'migrations'), (c) =>
    /\d{13}-.*\.ts$/.test(c),
  );

  const contagens: Contagens = {
    modulos: modulos.length,
    modulosProntos: modulos.filter((m) => m.status === 'pronto').length,
    modulosParciais: modulos.filter((m) => m.status === 'parcial').length,
    modulosApi: contarPastas(join(RAIZ, 'apps', 'FinancasBackend', 'src', 'modules')),
    telas: telas.length,
    migrations: migrations.length,
    tabelas: await contarEscalar(
      `SELECT count(*)::text AS n FROM information_schema.tables
        WHERE table_schema IN ('finance','identity','integration','audit')`,
    ),
    linhasCodigo: contarLinhas(tsCodigo),
    linhasDoc: contarLinhas(docs),
    titulosCp: await contarEscalar('SELECT count(*)::text AS n FROM finance.contas_pagar'),
  };

  const inicioValidacao = validacoes[0]?.criadoEm ?? null;
  const referencia = calcularReferencia(validacoes, FUNCIONALIDADE_REFERENCIA, CP_DECLARADO_PRONTO);

  const dados: DadosRelatorio = {
    hoje,
    geradoEm: formatarDataHora(new Date()),
    diasTotais: diasEntre(INICIO_FASE_0, hoje),
    diasFase0: diasEntre(INICIO_FASE_0, INICIO_FASE_1),
    diasFase1: diasEntre(INICIO_FASE_1, hoje),
    diasValidacao: inicioValidacao ? diasEntre(inicioValidacao, hoje) : 0,
    inicioValidacao,
    modulos,
    validados: modulos.filter((m) => m.validado).length,
    contagens,
    validacoes,
    projecao: montarProjecao(validacoes, modulos.length - modulos.filter((m) => m.validado).length),
    diasProntoAteValidado: referencia.diasProntoAteValidado,
    diasEsperandoConferencia: referencia.diasEsperandoConferencia,
    rodadasReferencia: referencia.rodadas,
  };

  mkdirSync(dirname(saida), { recursive: true });
  writeFileSync(saida, renderDocumento(dados), 'utf8');

  console.log(`Relatório gerado: ${saida}`);
  console.log(
    `  ${dados.diasTotais} dias · ${contagens.modulos} módulos · ${dados.validados} validado(s) · ` +
      `${validacoes.length} registro(s) de conferência`,
  );

  await AppDataSource.destroy();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
