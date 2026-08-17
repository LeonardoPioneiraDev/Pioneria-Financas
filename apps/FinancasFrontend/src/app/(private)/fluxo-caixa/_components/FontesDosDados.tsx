'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Bus, Receipt, Wallet, Settings2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Card colapsável que explica em linguagem leiga de onde vem cada componente
 * do Fluxo de Caixa. Pra usuário não-técnico entender o cálculo sem precisar
 * conversar com TI.
 */
export function FontesDosDados({
  inadimplenciaPerc,
  gdfMediaDiariaCents,
  gdfDiasComRepasse,
  gdfJanelaDias,
  horizonteDias,
}: {
  inadimplenciaPerc: number;
  gdfMediaDiariaCents: number;
  gdfDiasComRepasse: number;
  gdfJanelaDias: number;
  horizonteDias: number;
}) {
  // Aberto por padrão: é a melhor explicação da tela — não faz sentido esconder.
  const [aberto, setAberto] = useState(true);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          {aberto ? (
            <ChevronDown className="h-4 w-4 text-pioneira-700 dark:text-yellow-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-pioneira-700 dark:text-yellow-400" />
          )}
          <span className="text-sm font-bold text-pioneira-900 dark:text-yellow-200">
            De onde vem cada número?
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            (explicação em linguagem do dia-a-dia)
          </span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {aberto ? 'recolher ▲' : 'expandir ▼'}
        </span>
      </button>

      {aberto && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            O Fluxo de Caixa soma 4 coisas pra prever o caixa dos próximos {horizonteDias} dias.
            Veja de onde vem cada uma:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FonteCard
              icone={<Bus className="h-5 w-5" />}
              titulo="Repasse do GDF (BRB Mobilidade)"
              subtitulo="fonte principal — repasse real que cai no banco"
              cor="emerald"
              corpo={
                <>
                  <p>
                    A <strong>maior parte do que entra</strong> no caixa vem do repasse do{' '}
                    <strong>GDF via BRB Mobilidade</strong>. O governo paga a{' '}
                    <strong>tarifa técnica</strong> — o valor cheio da passagem, não só o que o
                    passageiro pagou no cartão — incluindo o complemento das gratuidades, que
                    costuma chegar depois e maior, às vezes referente a meses anteriores.
                  </p>
                  <p className="mt-2">
                    <strong>De onde o sistema tira o número:</strong> dos repasses que{' '}
                    <strong>de fato caíram no extrato bancário</strong> nos últimos{' '}
                    <strong>{gdfJanelaDias} dias</strong> — <em>não</em> da matriz de bilhetagem
                    (o que passou no cartão), que é bem menor. Calcula a média por dia e projeta
                    pros próximos {horizonteDias} dias.
                  </p>
                  {gdfDiasComRepasse > 0 && (
                    <p className="mt-2 text-emerald-700 dark:text-emerald-400">
                      <strong>Atualmente:</strong> média de R${' '}
                      {(gdfMediaDiariaCents / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/dia
                      (repasses reais em {gdfDiasComRepasse} dias dentro da janela de {gdfJanelaDias}).
                    </p>
                  )}
                  <p className="mt-2 text-amber-700 dark:text-amber-400 text-xs">
                    ⚠ <strong>Limitação:</strong> o repasse é irregular (dias com muito, dias com
                    nada) — a média suaviza, mas é previsão, não certeza.
                  </p>
                </>
              }
            />

            <FonteCard
              icone={<Receipt className="h-5 w-5" />}
              titulo="Contas a Receber (CR)"
              subtitulo="receita complementar — geralmente pequeno ou zero"
              cor="blue"
              corpo={
                <>
                  <p>
                    Faturas tradicionais que a Pioneira emite pra clientes pagarem em data
                    futura:
                  </p>
                  <ul className="mt-1 ml-4 list-disc text-xs">
                    <li>Vale-transporte corporativo (empresas pagam mensalmente)</li>
                    <li>Integração tarifária com outros operadores</li>
                    <li>Adiantamentos diversos</li>
                  </ul>
                  <p className="mt-2">
                    <strong>Como o sistema prevê isso:</strong> soma os títulos que vencem
                    nos próximos {horizonteDias} dias.
                  </p>
                  <p className="mt-2 text-amber-700 dark:text-amber-400 text-xs">
                    ⚠ <strong>Geralmente fica vazio:</strong> a Pioneira não emite faturas
                    com antecedência. A receita real vem do BRB (acima), não daqui.
                  </p>
                </>
              }
            />

            <FonteCard
              icone={<Wallet className="h-5 w-5" />}
              titulo="Saídas: Folha + Contas a Pagar"
              subtitulo="tudo que a Pioneira tem que pagar"
              cor="red"
              corpo={
                <>
                  <p>Todo dinheiro que precisa <strong>sair</strong> do caixa vem de 2 fontes:</p>
                  <ul className="mt-1 ml-4 list-disc text-xs">
                    <li><strong>Folha (a maior saída)</strong> — salários líquidos, do dado real da folha (FLP), projetada pela folha mais recente</li>
                    <li><strong>NF</strong> — fornecedores (combustível, peças, serviços)</li>
                    <li><strong>Guias</strong> — tributos + encargos da folha (FGTS, INSS, IRRF)</li>
                    <li><strong>Pensão / manuais</strong> — lançados no Globus</li>
                  </ul>
                  <p className="mt-2">
                    <strong>Como o sistema prevê isso:</strong> a folha vem do líquido da folha
                    mensal; o resto soma os títulos a pagar (CP) que vencem nos próximos{' '}
                    {horizonteDias} dias e ainda não foram pagos.
                  </p>
                  <p className="mt-2 text-emerald-700 dark:text-emerald-400 text-xs">
                    ✓ A folha era a maior saída e antes ficava <strong>de fora</strong> — agora entra
                    pelo dado real, então a cobertura reflete o caixa de verdade.
                  </p>
                </>
              }
            />

            <FonteCard
              icone={<Settings2 className="h-5 w-5" />}
              titulo="Ajuste aplicado"
              subtitulo="por que o sistema desconta uma % do CR"
              cor="amber"
              corpo={
                <>
                  <p>
                    O <strong>repasse do GDF</strong> já entra pelo <strong>valor real do
                    extrato</strong> — é dinheiro que já caiu, então não precisa de ajuste. Só o{' '}
                    <strong>CR</strong> leva um desconto pra não superestimar:
                  </p>
                  <ul className="mt-2 ml-4 list-disc text-xs space-y-1">
                    <li>
                      <strong>Inadimplência CR ({inadimplenciaPerc.toFixed(2)}%):</strong>{' '}
                      % dos clientes que normalmente atrasam mais de 30 dias ou cancelam
                      o título nos últimos 6 meses.
                    </li>
                  </ul>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <strong>Por quê:</strong> melhor projetar conservador (menor) e
                    surpreender pra mais do que contar com dinheiro que não vem.
                  </p>
                </>
              }
            />
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            <strong className="text-gray-700 dark:text-gray-300">Resumo da conta:</strong>{' '}
            Para cada dia, o sistema faz: <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">
              (repasse GDF médio do extrato) + (CR vencendo - inadimplência) - (CP vencendo)
            </code>{' '}
            = saldo do dia. Quando esse saldo acumulado fica negativo, é o que
            chamamos de <strong>gap de caixa</strong>.
          </div>
        </div>
      )}
    </Card>
  );
}

function FonteCard({
  icone,
  titulo,
  subtitulo,
  cor,
  corpo,
}: {
  icone: ReactNode;
  titulo: string;
  subtitulo: string;
  cor: 'emerald' | 'blue' | 'red' | 'amber';
  corpo: ReactNode;
}) {
  const cores: Record<typeof cor, { borda: string; bg: string; iconBg: string; iconText: string }> = {
    emerald: {
      borda: 'border-l-emerald-500',
      bg: 'bg-emerald-50/40 dark:bg-emerald-950/20',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      iconText: 'text-emerald-700 dark:text-emerald-300',
    },
    blue: {
      borda: 'border-l-blue-500',
      bg: 'bg-blue-50/40 dark:bg-blue-950/20',
      iconBg: 'bg-blue-100 dark:bg-blue-900/40',
      iconText: 'text-blue-700 dark:text-blue-300',
    },
    red: {
      borda: 'border-l-red-500',
      bg: 'bg-red-50/40 dark:bg-red-950/20',
      iconBg: 'bg-red-100 dark:bg-red-900/40',
      iconText: 'text-red-700 dark:text-red-300',
    },
    amber: {
      borda: 'border-l-amber-500',
      bg: 'bg-amber-50/40 dark:bg-amber-950/20',
      iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      iconText: 'text-amber-700 dark:text-amber-300',
    },
  };
  const c = cores[cor];

  return (
    <div className={cn('rounded-lg border border-gray-200 dark:border-gray-800 border-l-4 p-3', c.borda, c.bg)}>
      <div className="flex items-start gap-2 mb-2">
        <div className={cn('shrink-0 rounded p-1.5', c.iconBg, c.iconText)}>{icone}</div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold leading-tight">{titulo}</h4>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 italic mt-0.5">{subtitulo}</p>
        </div>
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{corpo}</div>
    </div>
  );
}
