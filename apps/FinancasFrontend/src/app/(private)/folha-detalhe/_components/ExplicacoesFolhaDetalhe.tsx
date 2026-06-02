'use client';

import { Building2, Briefcase, Coins, Clock, Moon, Shield, Receipt, Wallet, FileText, Users, Calendar } from 'lucide-react';
import { HelpModal } from '@/components/shared/HelpModal';

// Re-exporta modais comuns que também valem aqui (mantém uma única fonte da verdade).
export {
  AjudaINSS,
  AjudaFGTS,
  AjudaIRRF,
  AjudaCompetencia,
  AjudaRetencao,
} from '../../folha/_components/ExplicacoesFolha';

// ============ MODAIS ESPECÍFICOS DA FOLHA POR SETOR ============

export function AjudaProventosDescontos() {
  return (
    <HelpModal titulo="O que são “Proventos” e “Descontos”?" resumo="Proventos = ganho · Descontos = desconto do salário · Líquido = o que sobra">
      <p>
        Um contra-cheque (holerite) sempre tem <strong>três valores principais</strong>:
      </p>
      <div className="space-y-2">
        <div className="rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 p-3">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <Coins className="h-4 w-4" /> Proventos
          </p>
          <p className="text-xs mt-1">
            Tudo o que <strong>soma</strong> no salário do funcionário: salário base, horas extras, adicional noturno,
            insalubridade, periculosidade, prêmios, comissões, gratificações, 13º.
          </p>
        </div>
        <div className="rounded-lg border-l-4 border-l-red-500 bg-red-50/60 dark:bg-red-950/30 p-3">
          <p className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-1.5">
            <Receipt className="h-4 w-4" /> Descontos
          </p>
          <p className="text-xs mt-1">
            Tudo o que <strong>subtrai</strong> do salário: INSS, IRRF, faltas, vale-transporte (parte do funcionário),
            vale-alimentação, pensão alimentícia, plano de saúde, contribuição sindical.
          </p>
        </div>
        <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/30 p-3">
          <p className="font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
            <Wallet className="h-4 w-4" /> Líquido a pagar
          </p>
          <p className="text-xs mt-1">
            <strong>Proventos − Descontos = Líquido.</strong> É o valor que efetivamente cai na conta do funcionário.
          </p>
        </div>
      </div>
      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs">
        <p className="font-semibold text-amber-900 dark:text-amber-200">⚠️ FGTS é diferente</p>
        <p className="text-amber-800 dark:text-amber-300 mt-1">
          O <strong>FGTS não aparece no holerite</strong> como desconto — é a empresa que paga (8% do salário) numa conta da Caixa
          do funcionário. É <strong>custo extra para a Pioneira</strong>, não vem do salário.
        </p>
      </div>
    </HelpModal>
  );
}

export function AjudaSalarioBase() {
  return (
    <HelpModal titulo="O que é Salário Base?" resumo="Valor fixo contratual antes de adicionais">
      <p>
        <strong>Salário base</strong> é o valor combinado em contrato — o piso fixo que o funcionário recebe por mês trabalhando
        a jornada normal (geralmente 220 horas).
      </p>
      <p>
        <strong>Não inclui</strong>:
      </p>
      <ul className="list-disc list-inside space-y-1 text-xs">
        <li>Horas extras</li>
        <li>Adicional noturno (quando trabalha à noite)</li>
        <li>Insalubridade / Periculosidade</li>
        <li>Prêmios, gratificações, comissões</li>
        <li>13º Salário (recebido em novembro/dezembro)</li>
        <li>Férias</li>
      </ul>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        É a base para calcular outros valores: INSS, FGTS, hora extra, 13º. Por isso quando alguém pergunta “qual o seu salário?”,
        a resposta correta é geralmente o salário base — não o líquido (que varia mês a mês).
      </p>
    </HelpModal>
  );
}

export function AjudaHoraExtra() {
  return (
    <HelpModal titulo="O que é Hora Extra?" resumo="Horas trabalhadas além da jornada normal — paga com adicional">
      <p>
        Quando o funcionário trabalha <strong>além da jornada contratual</strong> (geralmente 8h/dia ou 44h/semana), essas horas
        viram <strong>hora extra</strong>.
      </p>
      <p>
        A hora extra é paga com <strong>adicional sobre o valor normal da hora</strong>:
      </p>
      <ul className="list-disc list-inside space-y-1 text-xs">
        <li><strong>Hora extra 50%</strong> (HE 50%) — dias úteis. Vale 1,5× a hora normal.</li>
        <li><strong>Hora extra 100%</strong> (HE 100%) — domingos, feriados ou repouso. Vale 2× a hora normal.</li>
      </ul>
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs">
        <p className="font-semibold text-blue-900 dark:text-blue-200">📐 Exemplo</p>
        <p className="mt-1 text-blue-800 dark:text-blue-300">
          Motorista ganha R$ 2.500 / 220h ≈ R$ 11,36 por hora normal.<br />
          1h extra 50% = R$ 11,36 × 1,5 = <strong>R$ 17,05</strong><br />
          1h extra 100% = R$ 11,36 × 2 = <strong>R$ 22,73</strong>
        </p>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Hora extra também aumenta a base de INSS, FGTS e IRRF — então quando o funcionário faz muita hora extra num mês,
        os encargos sobem proporcionalmente.
      </p>
    </HelpModal>
  );
}

export function AjudaAdicionalNoturno() {
  return (
    <HelpModal titulo="O que é Adicional Noturno?" resumo="Acréscimo de 20% para quem trabalha à noite">
      <p>
        Quem trabalha entre <strong>22h e 5h da manhã</strong> recebe um adicional de <strong>no mínimo 20%</strong> sobre o valor da hora normal —
        é o <strong>adicional noturno</strong>.
      </p>
      <p>
        Importante para empresa de ônibus: motoristas de turnos da madrugada acumulam adicional noturno alto.
      </p>
      <p className="text-xs">
        Além disso, a <strong>hora noturna é reduzida</strong>: vale 52min 30s em vez de 60min — ou seja, 7h trabalhadas à noite contam
        como 8h para fins de jornada.
      </p>
    </HelpModal>
  );
}

export function AjudaInsalubridadePericulosidade() {
  return (
    <HelpModal titulo="Insalubridade vs Periculosidade" resumo="Adicionais por atividade perigosa ou insalubre">
      <div className="space-y-3">
        <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/30 p-3">
          <p className="font-semibold text-amber-800 dark:text-amber-300">⚗ Insalubridade</p>
          <p className="text-xs mt-1">
            Adicional para quem trabalha exposto a <strong>agentes nocivos à saúde</strong> (ruído, calor, produtos químicos,
            poeiras). Vale <strong>10%, 20% ou 40%</strong> sobre o salário mínimo, conforme o grau (leve/médio/alto).
          </p>
        </div>
        <div className="rounded-lg border-l-4 border-l-red-500 bg-red-50/60 dark:bg-red-950/30 p-3">
          <p className="font-semibold text-red-800 dark:text-red-300">⚠ Periculosidade</p>
          <p className="text-xs mt-1">
            Adicional para quem trabalha exposto a <strong>risco de morte ou acidente grave</strong> (eletricidade, explosivos,
            inflamáveis, segurança patrimonial). Vale <strong>30%</strong> sobre o salário base.
          </p>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <strong>Não acumulam</strong>: se o funcionário tem direito aos dois, escolhe o mais vantajoso (geralmente periculosidade).
          Para empresa de ônibus, motoristas de transporte coletivo geralmente recebem <strong>periculosidade 30%</strong> por estarem
          em via pública com risco de acidentes.
        </p>
      </div>
    </HelpModal>
  );
}

export function AjudaTipoFolhaFlp() {
  return (
    <HelpModal titulo="Tipos de folha (mensal, adiantamento, 13º…)" resumo="Mesmo mês pode ter várias folhas separadas">
      <p>
        Num mesmo mês, a Pioneira processa <strong>folhas diferentes</strong>, cada uma para uma finalidade:
      </p>
      <div className="space-y-2 text-xs">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
          <p className="font-semibold">1. <strong>Mensal</strong> (a principal)</p>
          <p className="text-gray-600 dark:text-gray-400 mt-0.5">
            O salário regular do mês. Sai entre dia 1 e 5 do mês seguinte ao trabalhado.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
          <p className="font-semibold">2. <strong>Adiantamento</strong> (vale)</p>
          <p className="text-gray-600 dark:text-gray-400 mt-0.5">
            Antecipação de parte do salário, paga no meio do mês (geralmente dia 15-20). Costuma ser ~40% do salário base.
            É descontado da folha mensal seguinte.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
          <p className="font-semibold">3. <strong>13º Salário</strong></p>
          <p className="text-gray-600 dark:text-gray-400 mt-0.5">
            Folha extra de fim de ano, paga em 2 parcelas: 1ª até 30/nov (50% sem desconto), 2ª até 20/dez
            (50% com INSS e IRRF descontados).
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
          <p className="font-semibold">4. <strong>Férias</strong></p>
          <p className="text-gray-600 dark:text-gray-400 mt-0.5">
            Folha do funcionário em férias: salário + 1/3 constitucional. Paga até 2 dias antes do início.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
          <p className="font-semibold">5. <strong>Rescisão</strong></p>
          <p className="text-gray-600 dark:text-gray-400 mt-0.5">
            Folha final quando o funcionário sai (demissão sem justa causa, com justa causa, pedido de demissão).
            Inclui saldo de salário, férias proporcionais + 1/3, 13º proporcional, e aviso prévio (se aplicável).
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Por isso o filtro "Tipo de folha" — você pode olhar só a mensal, só adiantamentos, etc.
      </p>
    </HelpModal>
  );
}

export function AjudaVTVA() {
  return (
    <HelpModal titulo="Vale-Transporte (VT) e Vale-Alimentação (VA)" resumo="Benefícios pagos pela empresa parcialmente descontados do funcionário">
      <div className="space-y-3">
        <div className="rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 p-3">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">🚌 Vale-Transporte (VT)</p>
          <p className="text-xs mt-1">
            A Pioneira fornece créditos de transporte (cartão de ônibus, BRT) para o trabalho. <strong>O funcionário paga até 6% do
            salário base</strong> via desconto na folha; o que passar disso é custo da empresa.
          </p>
        </div>
        <div className="rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 p-3">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">🍽 Vale-Alimentação (VA)</p>
          <p className="text-xs mt-1">
            Crédito mensal em cartão (Sodexo, Alelo, VR, Ticket) para refeição/supermercado.{' '}
            <strong>A maioria das empresas paga 100%</strong> — funcionário não desconta nada, mas a empresa tem benefícios fiscais
            via PAT (Programa de Alimentação do Trabalhador).
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Para a Pioneira com 3.000 funcionários, VT + VA somam alguns milhões de reais por mês. Costuma ser a 3ª maior despesa
        depois de salário + encargos.
      </p>
    </HelpModal>
  );
}

export function AjudaSetorFuncao() {
  return (
    <HelpModal titulo="O que é “Setor” e “Função”?" resumo="Setor = lotação física · Função = cargo do funcionário">
      <div className="space-y-3">
        <div className="rounded-lg border-l-4 border-l-pioneira-400 bg-pioneira-50/60 dark:bg-yellow-950/30 p-3">
          <p className="font-semibold flex items-center gap-1.5"><Building2 className="h-4 w-4" /> Setor (lotação)</p>
          <p className="text-xs mt-1">
            <strong>Onde</strong> o funcionário trabalha fisicamente. Para a Pioneira são as garagens / unidades operacionais
            (ex.: "SANTA MARIA", "GAMA", "SÃO SEBASTIÃO", "ADMINISTRATIVO"). Veio do campo <code>CODAREA</code>/<code>DESCAREA</code>
            do cadastro.
          </p>
        </div>
        <div className="rounded-lg border-l-4 border-l-blue-400 bg-blue-50/60 dark:bg-blue-950/30 p-3">
          <p className="font-semibold flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> Função (cargo)</p>
          <p className="text-xs mt-1">
            <strong>O que</strong> a pessoa faz. Ex.: "MOTORISTA", "COBRADOR", "MECÂNICO", "AUXILIAR ADMINISTRATIVO",
            "TÉCNICO DE SEGURANÇA DO TRABALHO".
          </p>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Um setor (ex.: Santa Maria) tem várias funções (motoristas, mecânicos, administrativos). A quebra por função dentro
          de cada setor permite ver, por exemplo: "quanto pagamos em motoristas de Santa Maria?"
        </p>
      </div>
    </HelpModal>
  );
}

export function AjudaComoLerFolhaDetalhe() {
  return (
    <HelpModal titulo="Como ler esta tela" tamanho="md" resumo="Guia rápido da Folha por Setor">
      <p>Esta tela mostra a <strong>folha completa</strong> da Pioneira, vindo direto do módulo de folha (não do financeiro).</p>
      <div className="space-y-3">
        <div className="flex gap-3">
          <span className="shrink-0 h-7 w-7 rounded-full bg-pioneira-400 text-pioneira-900 dark:text-gray-900 flex items-center justify-center text-xs font-bold">1</span>
          <div>
            <p className="font-semibold text-sm flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Competência e tipo de folha</p>
            <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
              No topo, escolha o <strong>mês trabalhado</strong> e o <strong>tipo</strong> (mensal, adiantamento, 13º, férias, rescisão).
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="shrink-0 h-7 w-7 rounded-full bg-pioneira-400 text-pioneira-900 dark:text-gray-900 flex items-center justify-center text-xs font-bold">2</span>
          <div>
            <p className="font-semibold text-sm flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> 6 KPIs principais</p>
            <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
              Funcionários · Proventos (ganhos) · Descontos · <strong>Líquido (o que cai no banco)</strong> · INSS · FGTS.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="shrink-0 h-7 w-7 rounded-full bg-pioneira-400 text-pioneira-900 dark:text-gray-900 flex items-center justify-center text-xs font-bold">3</span>
          <div>
            <p className="font-semibold text-sm flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Lista por setor</p>
            <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
              Cada setor é uma <strong>linha clicável</strong>. Quando expandir, mostra:
              detalhamento de proventos/descontos/INSS/FGTS/IRRF/VT+VA + <strong>quebra por função</strong> dentro daquele setor.
            </p>
          </div>
        </div>
      </div>
      <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-xs">
        <p className="font-semibold text-red-900 dark:text-red-200 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> LGPD
        </p>
        <p className="text-red-800 dark:text-red-300 mt-1">
          <strong>Cada visualização, filtro ou contra-cheque aberto fica registrado</strong> no log de auditoria
          com seu usuário, IP, horário e parâmetros. Compartilhamento de dados é violação contratual e legal (Lei 13.709/2018).
        </p>
      </div>
    </HelpModal>
  );
}
