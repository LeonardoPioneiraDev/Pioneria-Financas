'use client';

import { Building2, Coins, Receipt, Wallet, ScrollText, Calendar, AlertCircle, ShieldCheck } from 'lucide-react';
import { HelpModal } from '@/components/shared/HelpModal';

/**
 * Modais explicativos reutilizáveis na tela /folha.
 * Cada componente exporta um botão "?" que abre uma explicação contextualizada.
 * Linguagem em português comum — evita jargão contábil sempre que possível.
 */

export function AjudaContasAPagar() {
  return (
    <HelpModal titulo="O que é “Contas a Pagar”?" resumo="Tudo o que a empresa precisa pagar para alguém (fornecedor, governo, banco…)">
      <p>
        <strong>“Contas a Pagar”</strong> é o conjunto de tudo que a Pioneira <strong>tem que pagar</strong> para alguém — fornecedores, governo (impostos),
        bancos (empréstimos), prestadores de serviço, etc.
      </p>
      <p>
        No sistema antigo (Globus/Praxio) o departamento financeiro chama isso de <strong>“CPG”</strong> (sigla interna). Aqui você verá <strong>Contas a Pagar</strong> ou
        apenas <strong>“financeiro a pagar”</strong>.
      </p>
      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
        <p className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4" /> Importante
        </p>
        <p className="text-xs mt-1 text-amber-800 dark:text-amber-300">
          A folha tem partes que <strong>passam</strong> por Contas a Pagar (INSS, FGTS, IRRF, vale-transporte, vale-alimentação, sindicato)
          e partes que <strong>NÃO passam</strong> — o <strong>salário líquido</strong> de cada funcionário sai direto da folha pro banco.
        </p>
      </div>
    </HelpModal>
  );
}

export function AjudaFolhaCpgVsFlp() {
  return (
    <HelpModal titulo="Por que essa tela mostra só parte da folha?" resumo="Salários líquidos não passam por aqui">
      <div className="space-y-3">
        <p>
          A folha de pagamento da Pioneira tem <strong>dois caminhos diferentes</strong> dentro do sistema:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-pioneira-300 dark:border-yellow-800 bg-pioneira-50/60 dark:bg-yellow-950/30 p-3">
            <p className="font-bold text-pioneira-900 dark:text-yellow-200 flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Esta tela
            </p>
            <p className="text-xs mt-1">
              <strong>Encargos e benefícios</strong> da folha — coisas que a empresa paga para <em>fora dela</em>:
            </p>
            <ul className="text-xs mt-2 space-y-0.5 list-disc list-inside text-gray-700 dark:text-gray-300">
              <li>INSS, FGTS, IRRF (governo)</li>
              <li>Vale-transporte (operadora de ônibus)</li>
              <li>Vale-alimentação (Sodexo, Alelo…)</li>
              <li>Contribuição sindical (sindicato)</li>
            </ul>
          </div>
          <div className="rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 p-3">
            <p className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <Building2 className="h-4 w-4" /> Folha por Setor
            </p>
            <p className="text-xs mt-1">
              <strong>Folha completa</strong> dos ~3.000 funcionários:
            </p>
            <ul className="text-xs mt-2 space-y-0.5 list-disc list-inside text-gray-700 dark:text-gray-300">
              <li>Salário base de cada funcionário</li>
              <li>Horas extras, adicionais, prêmios</li>
              <li>Descontos individuais</li>
              <li>Contra-cheque por pessoa</li>
              <li>Quebra por setor e função</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <strong>Por que separado?</strong> Porque o pagamento do salário líquido sai direto da folha (módulo FLP)
          para o banco via arquivo de remessa, sem passar pela aprovação financeira de “Contas a Pagar”. Já os encargos
          e benefícios precisam ser registrados como contas a pagar porque envolvem boletos, guias e datas fixas.
        </p>
      </div>
    </HelpModal>
  );
}

export function AjudaINSS() {
  return (
    <HelpModal titulo="O que é INSS?" resumo="Contribuição previdenciária ao governo federal">
      <p>
        <strong>INSS (Instituto Nacional do Seguro Social)</strong> é a contribuição previdenciária obrigatória pelo trabalho formal.
        Funciona como uma “aposentadoria pública”.
      </p>
      <p>
        Na prática para a Pioneira:
      </p>
      <ul className="list-disc list-inside space-y-1 text-xs">
        <li><strong>INSS empresa</strong>: ~20% sobre a folha — pago pela Pioneira ao governo.</li>
        <li><strong>INSS funcionário</strong>: 7,5% a 14% (depende do salário) — descontado do salário, mas <strong>quem repassa é a empresa</strong>.</li>
        <li><strong>Quando vence</strong>: dia 20 do mês seguinte ao trabalhado (ou primeiro dia útil depois).</li>
      </ul>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Pago via guia GPS (Guia da Previdência Social) ou DARF previdenciário.
      </p>
    </HelpModal>
  );
}

export function AjudaFGTS() {
  return (
    <HelpModal titulo="O que é FGTS?" resumo="Fundo de Garantia — depósito mensal na conta do funcionário">
      <p>
        <strong>FGTS (Fundo de Garantia do Tempo de Serviço)</strong> é um depósito mensal que a empresa faz numa conta da Caixa Econômica
        Federal vinculada a cada funcionário — não é desconto do salário, é um <strong>custo adicional da empresa</strong>.
      </p>
      <ul className="list-disc list-inside space-y-1 text-xs">
        <li>Valor: <strong>8% do salário bruto</strong> de cada funcionário.</li>
        <li>Quem paga: <strong>a Pioneira</strong>, todo mês, na conta FGTS do funcionário.</li>
        <li>Quem recebe: o trabalhador, em caso de demissão sem justa causa, aposentadoria, financiamento de imóvel…</li>
        <li>Vencimento: dia 7 do mês seguinte.</li>
      </ul>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Pago via GRF (Guia de Recolhimento do FGTS) pela Caixa.
      </p>
    </HelpModal>
  );
}

export function AjudaIRRF() {
  return (
    <HelpModal titulo="O que é IRRF da folha?" resumo="Imposto de Renda retido do salário do funcionário">
      <p>
        <strong>IRRF (Imposto de Renda Retido na Fonte)</strong> é o imposto de renda que a empresa <strong>desconta do salário do funcionário</strong>
        e <strong>repassa ao governo</strong>.
      </p>
      <ul className="list-disc list-inside space-y-1 text-xs">
        <li>É um valor que a Pioneira <strong>já desconta do salário</strong>, então não é “custo extra” — é um repasse.</li>
        <li>Alíquota varia de 0% (até R$ 2.428) a 27,5% (acima de R$ 4.664), conforme tabela do Imposto de Renda.</li>
        <li>Vencimento: até dia 20 do mês seguinte.</li>
      </ul>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Pago via DARF (Documento de Arrecadação de Receitas Federais).
      </p>
    </HelpModal>
  );
}

export function AjudaCompetencia() {
  return (
    <HelpModal titulo="O que é “competência” da folha?" resumo="Mês a que a folha se refere (≠ mês em que é paga)">
      <div className="space-y-3">
        <p>
          <strong>Competência</strong> é o <strong>mês de trabalho</strong> a que a folha se refere — diferente do <strong>mês em que ela é paga</strong>.
        </p>
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/30 p-3">
          <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">Exemplo concreto:</p>
          <p className="text-xs text-blue-800 dark:text-blue-300">
            O funcionário trabalha em <strong>abril/2026</strong> → essa é a <strong>competência</strong>.<br />
            O salário e os encargos (INSS, FGTS) são pagos em <strong>maio/2026</strong> → essa é a <strong>data de pagamento</strong>.
          </p>
        </div>
        <p>
          Por isso esta tela tem dois filtros: <strong>“Mês de pagamento”</strong> (a tesouraria pensa) e <strong>“Competência”</strong> (a contabilidade pensa).
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Alguns títulos podem aparecer como <strong>“Sem competência”</strong> — significa que o sistema legado não associou esse pagamento a um mês
          específico de trabalho. Costuma acontecer com lançamentos manuais ou ajustes.
        </p>
      </div>
    </HelpModal>
  );
}

export function AjudaRetencao() {
  return (
    <HelpModal titulo="O que são “retenções”?" resumo="Impostos que a empresa segura do pagamento ao fornecedor">
      <p>
        Quando a Pioneira contrata um serviço (ex.: empresa de limpeza, contador), em vez de pagar 100% para o fornecedor, ela <strong>retém uma parte</strong>
        e repassa direto ao governo. Essas partes retidas são chamadas de <strong>retenções na fonte</strong>:
      </p>
      <ul className="list-disc list-inside space-y-1 text-xs">
        <li><strong>INSS</strong> — previdência</li>
        <li><strong>IRRF</strong> — imposto de renda</li>
        <li><strong>PIS</strong> e <strong>COFINS</strong> — contribuições sociais</li>
        <li><strong>CSLL</strong> — contribuição sobre lucro</li>
        <li><strong>ISS</strong> — imposto municipal sobre serviços</li>
      </ul>
      <p className="text-xs">
        <strong>Valor a pagar = Valor bruto − retenções.</strong> Ou seja, o fornecedor recebe o valor da nota fiscal menos esses impostos.
      </p>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Para a folha, as retenções típicas são INSS e IRRF do funcionário (descontados do salário e repassados ao governo).
      </p>
    </HelpModal>
  );
}

export function AjudaAging() {
  return (
    <HelpModal titulo="O que são “Vencido”, “Vence em 7 dias”, etc.?" resumo="Cards mostram em que estado está cada pagamento">
      <p>
        Os 4 cards coloridos dividem os pagamentos em <strong>4 grupos</strong> conforme a data de vencimento, comparada com hoje:
      </p>
      <div className="space-y-2">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50/60 dark:bg-red-950/30 border-l-4 border-l-red-500">
          <div className="font-bold text-red-700 dark:text-red-400 shrink-0">🔴 Vencido</div>
          <div className="text-xs">
            Já passou da data e ainda não foi pago. <strong>Atenção: tesouraria precisa resolver.</strong>
          </div>
        </div>
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border-l-4 border-l-amber-500">
          <div className="font-bold text-amber-700 dark:text-amber-400 shrink-0">🟠 Vence em 7 dias</div>
          <div className="text-xs">
            Vai vencer entre hoje e os próximos 7 dias. Tem que programar pagamento.
          </div>
        </div>
        <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border-l-4 border-l-blue-500">
          <div className="font-bold text-blue-700 dark:text-blue-400 shrink-0">🔵 Vence em mais de 7 dias</div>
          <div className="text-xs">
            Tem mais de uma semana — não é urgente, mas precisa estar na agenda.
          </div>
        </div>
        <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border-l-4 border-l-emerald-500">
          <div className="font-bold text-emerald-700 dark:text-emerald-400 shrink-0">🟢 Pago</div>
          <div className="text-xs">
            Já foi quitado. Histórico — apenas para conferência.
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 pt-1">
        Os 4 grupos somam o total no período. A barra colorida no card de cima mostra essa proporção visualmente.
      </p>
    </HelpModal>
  );
}

export function AjudaTiposFolha() {
  return (
    <HelpModal titulo="O que significa cada tipo de folha?" resumo="Categorias agrupando o tipo do pagamento">
      <p>O sistema classifica cada pagamento da folha em uma destas categorias:</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <Grupo cor="pioneira" titulo="Funcionário" itens={['Salário base', '13º Salário', 'Férias', 'Rescisão', 'Adiantamento / Vale']} />
        <Grupo cor="red" titulo="Encargo" itens={['INSS empresa', 'INSS funcionário (retido)', 'FGTS (8% do salário)', 'IRRF (retido)', 'Outros encargos previdenciários']} />
        <Grupo cor="emerald" titulo="Benefício" itens={['Vale-transporte', 'Vale-alimentação (Sodexo, Alelo…)']} />
        <Grupo cor="amber" titulo="Desconto" itens={['Contribuição sindical', 'Pensão alimentícia']} />
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        A classificação é feita automaticamente pelo sistema com base no nome do favorecido e códigos do Globus.
        Se você ver “Não Classificado” ou “Outros Encargos” em grande quantidade, vale checar com o time financeiro
        para refinarmos as regras de classificação.
      </p>
    </HelpModal>
  );
}

function Grupo({ cor, titulo, itens }: { cor: 'pioneira' | 'red' | 'emerald' | 'amber'; titulo: string; itens: string[] }) {
  const corMap = {
    pioneira: 'border-l-pioneira-400 bg-pioneira-50/40 dark:bg-yellow-950/20',
    red: 'border-l-red-400 bg-red-50/40 dark:bg-red-950/20',
    emerald: 'border-l-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20',
    amber: 'border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20',
  };
  return (
    <div className={`p-2 rounded border-l-4 ${corMap[cor]}`}>
      <p className="font-semibold">{titulo}</p>
      <ul className="mt-1 space-y-0.5 list-disc list-inside text-gray-700 dark:text-gray-300">
        {itens.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}

export function AjudaComoLerEstaTela() {
  return (
    <HelpModal titulo="Como ler esta tela" tamanho="md" resumo="Guia rápido das seções">
      <div className="space-y-3">
        <p>Esta página tem <strong>5 seções</strong>, de cima para baixo:</p>
        <Secao numero={1} icone={ScrollText} titulo="Filtros (mês de pagamento ou competência)">
          Escolha o período que quer analisar. <strong>“Mês de pagamento”</strong> mostra o que cai no banco
          naquele mês. <strong>“Competência”</strong> mostra a folha referente àquele mês de trabalho.
        </Secao>
        <Secao numero={2} icone={Receipt} titulo="Total no período (header amarelo)">
          O grande quadro destacado mostra <strong>quanto a Pioneira vai pagar no total</strong> e quantos
          títulos isso representa. A barra colorida embaixo divide entre Vencido (vermelho), Vence em 7d (laranja),
          Vence depois (azul) e Pago (verde).
        </Secao>
        <Secao numero={3} icone={Calendar} titulo="4 cards de urgência">
          Detalham a barra do header: <strong>quanto está vencido, vence em breve, vence depois e já foi pago</strong>.
          Os 4 cards <strong>somam o total</strong>.
        </Secao>
        <Secao numero={4} icone={Coins} titulo="Quebra por tipo (período inteiro)">
          Mostra <strong>quanto foi para cada categoria</strong>: salários, INSS, FGTS, vale-transporte, etc. Ajuda
          a entender “onde” o dinheiro foi.
        </Secao>
        <Secao numero={5} icone={ShieldCheck} titulo="Detalhe por competência">
          Cada cartão é uma <strong>competência específica</strong> (ex.: Maio/2026, Abril/2026, Sem competência).
          Útil para conferir mês a mês.
        </Secao>
      </div>
    </HelpModal>
  );
}

function Secao({ numero, icone: Icone, titulo, children }: { numero: number; icone: React.ComponentType<{ className?: string }>; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center text-xs font-bold text-pioneira-900 dark:text-gray-900">
          {numero}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-pioneira-900 dark:text-yellow-200 flex items-center gap-1.5">
          <Icone className="h-3.5 w-3.5" /> {titulo}
        </p>
        <p className="text-xs mt-0.5 text-gray-700 dark:text-gray-300">{children}</p>
      </div>
    </div>
  );
}
