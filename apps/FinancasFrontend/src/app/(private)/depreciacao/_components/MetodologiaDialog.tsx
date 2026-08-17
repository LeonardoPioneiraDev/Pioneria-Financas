'use client';

import { Database, Calculator, Info, CalendarClock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface Props {
  aberto: boolean;
  onClose: () => void;
  atualizadoEm: string | null;
}

/** Bloco de seção com ícone + título + conteúdo. */
function Secao({ icon, titulo, children }: { icon: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-gray-400">{icon}</span>
        <h3 className="text-sm font-semibold">{titulo}</h3>
      </div>
      <div className="space-y-1.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{children}</div>
    </section>
  );
}

/**
 * "Fontes e método" — explica, de forma central, de onde vêm os números da tela
 * de Depreciação e como cada um é calculado. Reforça a regra do projeto: todo
 * número é rastreável até a fonte.
 */
export function MetodologiaDialog({ aberto, onClose, atualizadoEm }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fontes e método</DialogTitle>
          <DialogDescription>De onde vêm os números desta tela e como cada um é calculado.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Secao icon={<Database className="h-4 w-4" />} titulo="Fonte dos dados">
            <p>
              Razão contábil do Globus — tabela <code>CTBSALDO</code> (saldo mensal por conta), empresa 4. A depreciação
              é <strong>calculada pelo financeiro em planilha e escriturada</strong> no Globus por classe de ativo; o
              sistema apenas <strong>espelha o valor oficial, sem recalcular</strong>. A Pioneira não usa a rotina de
              ativo fixo do Globus (ATF).
            </p>
            <p className="text-gray-400">
              {atualizadoEm
                ? `Última sincronização: ${new Date(atualizadoEm).toLocaleString('pt-BR')}.`
                : 'Ainda não sincronizado.'}{' '}
              Use o botão “Sincronizar” pra reimportar sob demanda.
            </p>
          </Secao>

          <Secao icon={<Calculator className="h-4 w-4" />} titulo="Como cada número é calculado">
            <ul className="space-y-1.5">
              <li>
                <strong>Despesa do mês</strong> = Σ (débito − crédito) das contas <code>3.1.02.07.*</code> (depreciação
                da frota própria) na competência.
              </li>
              <li>
                <strong>Imobilizado bruto</strong> = saldo acumulado das contas <code>1.3.02.01</code> (bens próprios) +{' '}
                <code>1.3.02.02/03</code> (direito de uso do arrendamento).
              </li>
              <li>
                <strong>Depreciação acumulada</strong> = saldo acumulado da conta <code>1.3.02.50</code> (redutora do
                ativo).
              </li>
              <li>
                <strong>Valor líquido</strong> = imobilizado bruto − depreciação acumulada.
              </li>
            </ul>
            <p className="text-gray-400">
              Clique em qualquer <strong>classe</strong> (nas tabelas abaixo) pra ver as contas exatas que compõem o
              número, com débito e crédito de cada uma.
            </p>
          </Secao>

          <Secao icon={<Info className="h-4 w-4" />} titulo="Por que a despesa é baixa (arrendamento)">
            <p>
              A frota própria (<code>3.1.02.07</code>) já está quase toda depreciada, por isso a despesa mensal é
              pequena. A <strong>frota arrendada</strong> (direito de uso na base) <strong>não é depreciada no
              razão</strong>: seu custo é escriturado como <strong>contraprestação de arrendamento mercantil</strong>{' '}
              (<code>3.1.02.04/05</code>), classificada como despesa financeira/operacional — não como depreciação — e
              por isso fica fora desta tela.
            </p>
          </Secao>

          <Secao icon={<CalendarClock className="h-4 w-4" />} titulo="Ajuste de dezembro e meses não lançados">
            <ul className="space-y-1.5">
              <li>
                <strong>Dezembro</strong>: o razão traz o estorno de fechamento do exercício — por isso a série mostra um
                valor negativo nesse mês. Não é a depreciação do mês.
              </li>
              <li>
                <strong>Meses ainda não escriturados</strong> aparecem como <em>“não lançado”</em> na série — nunca como
                R$ 0. Quando não tem dado, o sistema diz que não tem.
              </li>
            </ul>
          </Secao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
