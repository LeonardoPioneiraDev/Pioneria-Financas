'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  CONTA_PAGAR_STATUS,
  type ContaPagarStatus,
  ORIGEM_DOCUMENTO_CP,
  type OrigemDocumentoCp,
  ORIGEM_DOCUMENTO_CP_LABELS,
} from '@pioneira/shared/enums/conta-pagar-status';
import type { SetorCp } from '@pioneira/shared/schemas/contas-pagar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<ContaPagarStatus, string> = {
  pendente: 'Pendente',
  em_aprovacao: 'Em aprov.',
  aprovado: 'Aprovado',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

export interface FiltrosCpValues {
  dtIni: string;
  dtFim: string;
  dtPagIni: string;
  dtPagFim: string;
  search: string;
  status: ContaPagarStatus[];
  origem: OrigemDocumentoCp[];
  setores: string[];
  valorMinBrl: string;
  valorMaxBrl: string;
  somenteVencidos: boolean;
}

interface FiltrosCpProps {
  valores: FiltrosCpValues;
  onChange: (novos: FiltrosCpValues) => void;
  onLimpar: () => void;
  setoresDisponiveis: SetorCp[];
}

function inicioDoMes(): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
}
function inicioProximoMes(): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString().slice(0, 10);
}

export function FiltrosCp({ valores, onChange, onLimpar, setoresDisponiveis }: FiltrosCpProps) {
  const [aberto, setAberto] = useState(false);
  // Quando o filtro de pagamento esta ativo, o backend ignora o de vencimento
  // (busca passa a ser "titulos pagos no periodo X"). Refletir visualmente.
  const filtroPagamentoAtivo = !!(valores.dtPagIni || valores.dtPagFim);

  const toggleStatus = (s: ContaPagarStatus): void => {
    const novos = valores.status.includes(s) ? valores.status.filter((x) => x !== s) : [...valores.status, s];
    onChange({ ...valores, status: novos });
  };

  const toggleOrigem = (o: OrigemDocumentoCp): void => {
    const novos = valores.origem.includes(o) ? valores.origem.filter((x) => x !== o) : [...valores.origem, o];
    onChange({ ...valores, origem: novos });
  };

  const toggleSetor = (codigo: string): void => {
    const novos = valores.setores.includes(codigo)
      ? valores.setores.filter((x) => x !== codigo)
      : [...valores.setores, codigo];
    onChange({ ...valores, setores: novos });
  };

  const filtroAtivo =
    valores.search ||
    valores.status.length > 0 ||
    valores.origem.length > 0 ||
    valores.setores.length > 0 ||
    valores.valorMinBrl ||
    valores.valorMaxBrl ||
    valores.somenteVencidos ||
    valores.dtPagIni ||
    valores.dtPagFim ||
    valores.dtIni !== inicioDoMes() ||
    valores.dtFim !== inicioProximoMes();

  return (
    <Card className="p-3 sm:p-4 space-y-3">
      {/* Linha 1: busca + datas + este mes */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-5">
          <Label htmlFor="search" className="text-xs">Buscar por documento, fornecedor ou CNPJ</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="search"
              placeholder="ex: 0000022853, Auto Posto..."
              value={valores.search}
              onChange={(e) => onChange({ ...valores, search: e.target.value })}
              className="pl-9"
            />
          </div>
        </div>
        <div className={cn('md:col-span-3', filtroPagamentoAtivo && 'opacity-40 pointer-events-none')}>
          <Label htmlFor="dtIni" className="text-xs">
            Vencimento de {filtroPagamentoAtivo && <span className="text-[10px] text-amber-700 dark:text-amber-400">(ignorado)</span>}
          </Label>
          <Input
            id="dtIni"
            type="date"
            value={valores.dtIni}
            onChange={(e) => onChange({ ...valores, dtIni: e.target.value })}
            disabled={filtroPagamentoAtivo}
          />
        </div>
        <div className={cn('md:col-span-3', filtroPagamentoAtivo && 'opacity-40 pointer-events-none')}>
          <Label htmlFor="dtFim" className="text-xs" title="Para um unico dia, repita a mesma data nos dois campos.">
            Vencimento ate {filtroPagamentoAtivo && <span className="text-[10px] text-amber-700 dark:text-amber-400">(ignorado)</span>}
          </Label>
          <Input
            id="dtFim"
            type="date"
            value={valores.dtFim}
            onChange={(e) => onChange({ ...valores, dtFim: e.target.value })}
            disabled={filtroPagamentoAtivo}
          />
        </div>
        <div className="md:col-span-1">
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="w-full"
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? 'Menos' : 'Mais'}
          </Button>
        </div>
      </div>

      {/* Linha 1b: filtro opcional por data de pagamento */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-3">
          <Label htmlFor="dtPagIni" className="text-xs">Pagamento de</Label>
          <Input
            id="dtPagIni"
            type="date"
            value={valores.dtPagIni}
            onChange={(e) => onChange({ ...valores, dtPagIni: e.target.value })}
          />
        </div>
        <div className="md:col-span-3">
          <Label htmlFor="dtPagFim" className="text-xs" title="Para um unico dia, repita a mesma data nos dois campos.">Pagamento ate</Label>
          <Input
            id="dtPagFim"
            type="date"
            value={valores.dtPagFim}
            onChange={(e) => onChange({ ...valores, dtPagFim: e.target.value })}
          />
        </div>
        <div className="md:col-span-6 flex items-center">
          {valores.dtPagIni || valores.dtPagFim ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => onChange({ ...valores, dtPagIni: '', dtPagFim: '' })}
            >
              <X className="h-4 w-4" />
              Limpar pagamento
            </Button>
          ) : (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              Opcional — filtra pelos pagos no intervalo. Para um unico dia, repita a mesma data nos dois campos. <strong>Quando ativo, ignora o filtro de vencimento.</strong>
            </span>
          )}
        </div>
      </div>

      {/* Linha 2: filtros avancados expansiveis */}
      {aberto && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="md:col-span-6">
            <Label className="text-xs">Status</Label>
            <div className="flex flex-wrap gap-2">
              {CONTA_PAGAR_STATUS.map((s) => {
                const ativo = valores.status.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium border-2 transition-colors',
                      ativo
                        ? 'bg-pioneira-400/20 dark:bg-yellow-500/20 border-pioneira-400 dark:border-yellow-400 text-pioneira-900 dark:text-yellow-200'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-pioneira-300 dark:hover:border-yellow-500',
                    )}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>
          {/*
            Filtro por setor: so renderiza se houver setores com CPs. Setor vem
            100% do Globus — centro de custo financeiro do item (CPGITDOC.CODCUSTOFIN),
            descricao em CPGCUSTOS. `codigo` aqui e o CODCUSTOFIN (ex "20003").
          */}
          {setoresDisponiveis.length > 0 && (
            <div className="md:col-span-12">
              <Label className="text-xs">Setor</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {setoresDisponiveis.map((s) => {
                  const ativo = valores.setores.includes(s.codigo);
                  const rotulo = s.nome ?? `Cod. ${s.codigo}`;
                  return (
                    <button
                      key={s.codigo}
                      type="button"
                      onClick={() => toggleSetor(s.codigo)}
                      title={`${s.codigo} - ${s.nome ?? 'sem descricao'} (${s.totalCps} CPs)`}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium border-2 transition-colors',
                        ativo
                          ? 'bg-pioneira-400/20 dark:bg-yellow-500/20 border-pioneira-400 dark:border-yellow-400 text-pioneira-900 dark:text-yellow-200'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-pioneira-300 dark:hover:border-yellow-500',
                      )}
                    >
                      {rotulo}
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-1">({s.totalCps})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="md:col-span-12">
            <Label className="text-xs">Origem do titulo</Label>
            <div className="flex flex-wrap gap-2">
              {ORIGEM_DOCUMENTO_CP.map((o) => {
                const ativo = valores.origem.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggleOrigem(o)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium border-2 transition-colors',
                      ativo
                        ? 'bg-pioneira-400/20 dark:bg-yellow-500/20 border-pioneira-400 dark:border-yellow-400 text-pioneira-900 dark:text-yellow-200'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-pioneira-300 dark:hover:border-yellow-500',
                    )}
                  >
                    {ORIGEM_DOCUMENTO_CP_LABELS[o]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="valorMin" className="text-xs">Valor minimo (R$)</Label>
            <Input
              id="valorMin"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={valores.valorMinBrl}
              onChange={(e) => onChange({ ...valores, valorMinBrl: e.target.value })}
            />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="valorMax" className="text-xs">Valor maximo (R$)</Label>
            <Input
              id="valorMax"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={valores.valorMaxBrl}
              onChange={(e) => onChange({ ...valores, valorMaxBrl: e.target.value })}
            />
          </div>
          <div className="md:col-span-12 flex items-center justify-between gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={valores.somenteVencidos}
                onChange={(e) => onChange({ ...valores, somenteVencidos: e.target.checked })}
                className="h-4 w-4 rounded accent-pioneira-400 dark:accent-yellow-400"
              />
              <span>Mostrar apenas vencidos em aberto</span>
            </label>
            {filtroAtivo && (
              <Button variant="ghost" size="sm" type="button" onClick={onLimpar}>
                <X className="h-4 w-4" />
                Limpar filtros
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
