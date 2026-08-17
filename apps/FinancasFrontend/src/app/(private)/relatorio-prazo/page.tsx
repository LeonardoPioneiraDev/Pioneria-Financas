'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import type { RelatorioPrazoResponse } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MODULOS } from '@/lib/module-status';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Linha do tempo do projeto — da ideia até a produção.
 *
 * Existe porque o documento publicado precisa ser regenerado à mão; esta tela
 * lê o banco a cada abertura e não fica desatualizada nunca. Os números da API
 * são medidos; a única projeção da página está rotulada como tal.
 */

const ESTAGIOS = ['Ideia', 'Descoberta', 'Construção', 'Validação', 'Produção'] as const;

function dataBr(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

function meses(dias: number): string {
  return `${(dias / 30.44).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses`;
}

export default function RelatorioPrazoPage() {
  const { data, isLoading, isError, error } = useQuery<RelatorioPrazoResponse>({
    queryKey: ['relatorio-prazo'],
    queryFn: async () => (await api.get<RelatorioPrazoResponse>('/api/relatorio-prazo')).data,
    // O dado muda quando alguém valida algo — não precisa de polling agressivo,
    // mas também não pode servir cache velho para quem abriu a tela agora.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const modulos = useMemo(() => Object.values(MODULOS), []);

  const resumo = useMemo(() => {
    if (!data) return null;
    const validadas = new Set(
      data.validacoes.filter((v) => v.status === 'validado').map((v) => v.funcionalidade),
    );
    const lista = modulos.map((m) => ({
      nome: m.nome,
      href: m.href,
      status: m.status,
      validado: validadas.has(m.href),
    }));
    const validados = lista.filter((m) => m.validado).length;
    const restantes = lista.length - validados;

    const serial = data.cicloValidacao.diasPorCiclo * restantes;
    const paralelo = Math.round(serial / 2);

    return {
      lista,
      validados,
      restantes,
      prontos: lista.filter((m) => m.status === 'pronto').length,
      parciais: lista.filter((m) => m.status === 'parcial').length,
      pctValidado: Math.round((validados / Math.max(1, lista.length)) * 100),
      serial,
      paralelo,
      emProducao: restantes === 0,
    };
  }, [data, modulos]);

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Medindo a linha do tempo…
      </p>
    );
  }

  if (isError || !data || !resumo) {
    return (
      <Card className="flex items-start gap-2 p-4 text-sm text-red-700 dark:text-red-300">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{(error as Error)?.message ?? 'Não foi possível carregar a linha do tempo.'}</span>
      </Card>
    );
  }

  const pct0 = (data.dias.fase0 / Math.max(1, data.dias.total)) * 100;
  const estagioAtual = resumo.emProducao ? 4 : 3;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-pioneira-700 dark:text-yellow-500">
          Sistema Financeiro · Viação Pioneira · {dataBr(data.marcos.inicioFase0)} – {dataBr(data.hoje)}
        </p>
        <h1 className="mt-3 text-2xl font-bold text-pioneira-900 sm:text-3xl dark:text-yellow-200">
          Da ideia à produção
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
          Quanto tempo o sistema levou desde a primeira ideia até estar em produção, fase por fase.
          Nenhum número aqui é estimado: todos saem do banco de dados e dos registros de conferência
          do próprio sistema, lidos no momento em que você abriu esta tela.
        </p>
      </div>

      {/* Número de abertura */}
      <Card className="p-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-5xl font-bold tabular-nums text-pioneira-900 sm:text-6xl dark:text-yellow-200">
            {data.dias.total}
          </span>
          <span className="text-lg text-gray-500 dark:text-gray-400">dias da ideia até hoje</span>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
          <strong className="text-gray-900 dark:text-gray-100">{meses(data.dias.total)}.</strong>{' '}
          {resumo.lista.length} módulos integrados ao ERP, rodando com dado real — com{' '}
          <strong className="text-gray-900 dark:text-gray-100">
            {resumo.validados === 1
              ? '1 módulo já conferido e assinado'
              : `${resumo.validados} módulos já conferidos e assinados`}{' '}
            pela área de negócio
          </strong>
          .{' '}
          {resumo.emProducao
            ? 'O sistema completou o ciclo e está em produção.'
            : 'O sistema ainda não está em produção plena: a contagem continua.'}
        </p>

        {/* Estágio no arco */}
        <ol className="mt-5 flex flex-wrap gap-1.5">
          {ESTAGIOS.map((nome, i) => {
            const concluido = i < estagioAtual;
            const atual = i === estagioAtual;
            return (
              <li
                key={nome}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider',
                  atual
                    ? 'border-pioneira-500 bg-pioneira-50 font-bold text-pioneira-800 dark:border-yellow-600 dark:bg-yellow-950/30 dark:text-yellow-300'
                    : concluido
                      ? 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
                      : 'border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-500',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    atual
                      ? 'bg-pioneira-600 dark:bg-yellow-400'
                      : concluido
                        ? 'bg-emerald-500'
                        : 'bg-gray-300 dark:bg-gray-600',
                  )}
                />
                {nome}
              </li>
            );
          })}
        </ol>
      </Card>

      {/* As três fases */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          As três fases, na proporção real
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Só a do meio é a que normalmente se imagina quando alguém pede um prazo.
        </p>

        <div className="mt-5">
          <div className="flex h-11 overflow-hidden rounded-md border border-gray-300 dark:border-gray-600">
            <div
              className="flex items-center overflow-hidden whitespace-nowrap bg-gray-100 px-3 font-mono text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              style={{ width: `${pct0.toFixed(1)}%` }}
            >
              Fase 0 · {data.dias.fase0} d
            </div>
            <div
              className="flex items-center overflow-hidden whitespace-nowrap bg-pioneira-100 px-3 font-mono text-[11px] font-semibold text-pioneira-800 dark:bg-yellow-950/40 dark:text-yellow-300"
              style={{ width: `${(100 - pct0).toFixed(1)}%` }}
            >
              Fase 1 · Construção · {data.dias.fase1} d
            </div>
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-gray-400 dark:text-gray-500">
            <span>{dataBr(data.marcos.inicioFase0)}</span>
            <span>{dataBr(data.marcos.inicioFase1)}</span>
            <span>{dataBr(data.hoje)} · hoje</span>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-gray-200 dark:divide-gray-700">
          {[
            {
              dias: data.dias.fase0,
              periodo: `${dataBr(data.marcos.inicioFase0)} – ${dataBr(data.marcos.inicioFase1)}`,
              titulo: 'Fase 0 · Descoberta e prova de conceito',
              texto:
                'MVP descartável construído para descobrir o que a empresa precisava e provar que era viável. Terminou com apresentação à diretoria e aprovação. O código foi jogado fora; o escopo validado sobreviveu.',
            },
            {
              dias: data.dias.fase1,
              periodo: `${dataBr(data.marcos.inicioFase1)} – ${dataBr(data.hoje)}`,
              titulo: 'Fase 1 · Construção do sistema definitivo',
              texto:
                'Reconstrução do zero a partir das anotações já validadas com o negócio. É a fase que produz telas.',
            },
            {
              dias: data.dias.validacao,
              periodo: `${dataBr(data.inicioValidacao)} – ${resumo.emProducao ? dataBr(data.hoje) : 'em curso'}`,
              titulo: 'Fase 2 · Validação com quem usa',
              texto:
                'O financeiro confere número por número contra o ERP e contra o extrato. É a fase que transforma "o código funciona" em "a empresa pode confiar no número".',
            },
          ].map((f) => (
            <div key={f.titulo} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-5">
              <div className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
                <span className="block text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {f.dias} d
                </span>
                {f.periodo}
              </div>
              <div>
                <dt className="text-sm font-semibold text-gray-900 dark:text-gray-100">{f.titulo}</dt>
                <dd className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{f.texto}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Card>

      {/* "Pronto" não é "validado" */}
      {data.referencia.diasProntoAteValidado !== null && (
        <Card className="border-l-4 border-l-pioneira-500 p-6 dark:border-l-yellow-600">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            "Pronto" não é "validado"
          </h2>
          <p className="mt-3 text-base text-gray-700 dark:text-gray-200">
            Em <span className="font-mono">{data.referencia.funcionalidade}</span>, entre o
            desenvolvedor declarar pronto e o usuário assinar embaixo passaram-se{' '}
            <strong className="text-gray-900 dark:text-gray-100">
              {data.referencia.diasProntoAteValidado} dias
            </strong>{' '}
            e {data.referencia.rodadas}{' '}
            {data.referencia.rodadas === 1 ? 'rodada' : 'rodadas'} de conferência.
          </p>
          {data.referencia.diasEsperandoConferencia !== null && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Desses, <strong>{data.referencia.diasEsperandoConferencia} dias</strong> foram só
              esperando a primeira conferência acontecer. Não foi falta de desenvolvimento — foi
              falta de agenda de quem precisava olhar.
            </p>
          )}
        </Card>
      )}

      {/* Placar */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">O placar hoje</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Dos {resumo.lista.length} módulos, <strong>{resumo.prontos} estão construídos</strong>,{' '}
          {resumo.parciais} {resumo.parciais === 1 ? 'está parcial' : 'estão parciais'} — e{' '}
          <strong className="font-mono">{resumo.validados}</strong>{' '}
          {resumo.validados === 1 ? 'passou' : 'passaram'} pela conferência do usuário final.
        </p>

        <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-3 dark:border-gray-700 dark:bg-gray-700">
          {resumo.lista.map((m) => (
            <div
              key={m.href}
              className="flex items-center gap-2.5 bg-white px-3 py-2.5 text-sm dark:bg-gray-900"
            >
              <span
                className={cn(
                  'w-1 self-stretch rounded-sm',
                  m.validado
                    ? 'bg-emerald-500'
                    : m.status === 'parcial'
                      ? 'bg-red-400'
                      : 'bg-gray-300 dark:bg-gray-600',
                )}
              />
              <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-100">
                {m.nome}
              </span>
              <span
                className={cn(
                  'font-mono text-[10px] uppercase tracking-wider',
                  m.validado
                    ? 'font-bold text-emerald-600 dark:text-emerald-400'
                    : m.status === 'parcial'
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-gray-400 dark:text-gray-500',
                )}
              >
                {m.validado ? 'Validado' : m.status === 'parcial' ? 'Parcial' : 'A validar'}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Em porcentagem de código, o sistema está perto do fim. Em porcentagem de confiança
          auditável, está em <strong>{resumo.pctValidado}%</strong>.
        </p>
      </Card>

      {/* Histórico de conferência */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Histórico de conferência
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Cada aprovação ou reprovação registrada, transcrita sem edição. Esta lista cresce sozinha.
        </p>

        {data.validacoes.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Nenhuma conferência registrada ainda.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-gray-300 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  <th className="whitespace-nowrap py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Funcionalidade</th>
                  <th className="py-2 pr-4">Resultado</th>
                  <th className="py-2">Observação de quem conferiu</th>
                </tr>
              </thead>
              <tbody>
                {data.validacoes.map((v, i) => (
                  <tr
                    key={`${v.funcionalidade}-${v.criadoEm}-${i}`}
                    className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                  >
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-gray-500 dark:text-gray-400">
                      {dataBr(v.criadoEm)}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-700 dark:text-gray-200">
                      {v.funcionalidade}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge
                        variant={
                          v.status === 'validado'
                            ? 'success'
                            : v.status === 'reprovado'
                              ? 'danger'
                              : 'muted'
                        }
                      >
                        {v.status === 'validado' ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : v.status === 'reprovado' ? (
                          <XCircle className="mr-1 h-3 w-3" />
                        ) : (
                          <Clock className="mr-1 h-3 w-3" />
                        )}
                        {v.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-gray-600 dark:text-gray-300">
                      {v.observacoes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Quanto falta — projeção */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Quanto falta</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Esta é a <strong>única projeção</strong> desta tela — tudo acima é medição. A aritmética
          usa{' '}
          {data.cicloValidacao.baseadoEmCiclos === 0
            ? 'uma referência conservadora, porque nenhum ciclo de validação fechou ainda'
            : data.cicloValidacao.baseadoEmCiclos === 1
              ? 'o único ciclo de validação já concluído'
              : `a média dos ${data.cicloValidacao.baseadoEmCiclos} ciclos já concluídos`}{' '}
          ({data.cicloValidacao.diasPorCiclo} dias por módulo).
        </p>

        {resumo.emProducao ? (
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Todos os módulos foram validados. Não há projeção pendente.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-gray-300 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  <th className="py-2 pr-4">Cenário</th>
                  <th className="py-2 pr-4 text-right">Dias</th>
                  <th className="py-2 text-right">Equivale a</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2.5 pr-4">Conferindo 1 módulo por vez</td>
                  <td className="py-2.5 pr-4 text-right font-mono">{resumo.serial}</td>
                  <td className="py-2.5 text-right font-mono">{meses(resumo.serial)}</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2.5 pr-4">Conferindo 2 módulos em paralelo</td>
                  <td className="py-2.5 pr-4 text-right font-mono">{resumo.paralelo}</td>
                  <td className="py-2.5 text-right font-mono">{meses(resumo.paralelo)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-semibold">Total do projeto até validado</td>
                  <td className="py-2.5 pr-4 text-right font-mono">
                    {data.dias.total + resumo.paralelo} – {data.dias.total + resumo.serial}
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    {meses(data.dias.total + resumo.paralelo)} –{' '}
                    {meses(data.dias.total + resumo.serial)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 rounded-md bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Premissas
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              {resumo.restantes}{' '}
              {resumo.restantes === 1 ? 'módulo ainda a validar' : 'módulos ainda a validar'}.
            </li>
            <li>
              Cada um consome cerca de {data.cicloValidacao.diasPorCiclo} dias de conferência ativa.
            </li>
            <li>Cada reprovação gera correção e nova rodada.</li>
            <li>O time financeiro confere entre as próprias tarefas, sem dedicação exclusiva.</li>
            <li>Não estão previstos módulos novos nem mudanças de escopo.</li>
          </ul>
        </div>
      </Card>

      {/* Nota de método */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Como cada número foi apurado
        </h2>
        <dl className="mt-3 space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-gray-900 dark:text-gray-100">
              Registros de conferência
            </dt>
            <dd>
              Tabela <span className="font-mono">audit.validacao_funcionalidade</span>, lida a cada
              abertura desta tela. {data.validacoes.length}{' '}
              {data.validacoes.length === 1 ? 'registro' : 'registros'} hoje.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-gray-900 dark:text-gray-100">
              Catálogo de módulos
            </dt>
            <dd>
              O mesmo catálogo que alimenta o menu e os avisos de status do sistema — não há lista
              paralela que possa divergir.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-gray-900 dark:text-gray-100">
              Datas das fases
            </dt>
            <dd>
              Fase 0 pelo carimbo dos arquivos do MVP; fase 1 pelo histórico do repositório. São os
              únicos valores fixos, porque marcam fatos que já aconteceram.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-gray-900 dark:text-gray-100">
              Base do sistema hoje
            </dt>
            <dd>
              {data.contagens.tabelas} tabelas em 4 esquemas ·{' '}
              {data.contagens.titulosCp.toLocaleString('pt-BR')} títulos financeiros reais.
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
