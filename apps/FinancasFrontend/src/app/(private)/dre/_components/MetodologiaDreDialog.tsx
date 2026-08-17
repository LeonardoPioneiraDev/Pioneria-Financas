'use client';

import { Database, Calculator, Info, Layers } from 'lucide-react';
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

/** "Fontes e método" — de onde vêm os números da DRE e como as linhas são montadas. */
export function MetodologiaDreDialog({ aberto, onClose, atualizadoEm }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fontes e método</DialogTitle>
          <DialogDescription>De onde vêm os números da DRE e como cada linha é calculada.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Secao icon={<Database className="h-4 w-4" />} titulo="Fonte dos dados">
            <p>
              Razão contábil do Globus — tabela <code>CTBSALDO</code>, <strong>plano 1</strong>, empresa 4. Só as contas de
              resultado: <strong>classe 3</strong> (despesa) e <strong>classe 4</strong> (receita). O sistema{' '}
              <strong>espelha o razão, não recalcula</strong>.
            </p>
            <p className="text-gray-400">
              {atualizadoEm ? `Última sincronização: ${new Date(atualizadoEm).toLocaleString('pt-BR')}.` : 'Ainda não sincronizado.'}
            </p>
          </Secao>

          <Secao icon={<Layers className="h-4 w-4" />} titulo="Só contas analíticas (folhas)">
            <p>
              O CTBSALDO guarda as contas <strong>sintéticas</strong> (rollup, terminadas em <code>.0000</code>){' '}
              <strong>junto</strong> das analíticas — e elas <strong>triplicam</strong> o valor (nível-3 + nível-4 + folha).
              A DRE soma <strong>apenas as folhas</strong>, por isso os números batem com a realidade (ex.: receita de
              transporte ~R$ 39M/mês, não R$ 116M).
            </p>
          </Secao>

          <Secao icon={<Calculator className="h-4 w-4" />} titulo="Como as linhas são montadas">
            <ul className="space-y-1.5">
              <li>
                Cada linha soma as folhas cujo classificador começa por um prefixo (ex.: <em>Custo com pessoal</em> ={' '}
                <code>3.1.01.01</code> + <code>3.1.01.04</code>).
              </li>
              <li>
                Valor de cada conta = <strong>crédito − débito</strong> (uniforme): receita fica positiva, custo negativo,
                e tudo soma para o resultado.
              </li>
              <li>
                A estrutura de DRE do próprio Globus (<code>CTBITDRE</code>) está vazia — as linhas são montadas pela
                hierarquia do plano de contas.
              </li>
              <li>
                A linha <em>Outros (não classificado)</em> captura qualquer conta fora dos grupos — nada some em silêncio.
              </li>
              <li>Clique em qualquer linha para ver as contas exatas que a compõem.</li>
            </ul>
          </Secao>

          <Secao icon={<Info className="h-4 w-4" />} titulo="Por que o resultado operacional aparece negativo">
            <p>
              A receita operacional contábil é só a <strong>bilhetagem</strong> (VT/PLE/PNE, ~R$ 39M/mês), menor que os
              custos (~R$ 65M). O <strong>repasse/subsídio do GDF não entra como receita operacional neste plano de
              contas</strong>, então o resultado operacional fica negativo. É fiel ao razão — reconciliar a bilhetagem com
              o repasse do GDF é o trabalho da <strong>visão gerencial</strong> (próxima fase).
            </p>
          </Secao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
