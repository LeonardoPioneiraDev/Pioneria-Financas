'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { buildNavigationGroups, restricaoDoUsuario, type NavigationGroup } from '@/components/layout/navigation';

// Descrição curta por rota — o "para que serve" de cada módulo no card.
const DESCRICOES: Record<string, string> = {
  '/contas-pagar': 'Títulos a pagar, prazos de vencimento e trilha de aprovação.',
  '/contas-receber': 'Recebíveis — o que entrou no extrato, classificado por origem.',
  '/recebiveis-gdf': 'Matriz de repasse da BRB Mobilidade (bilhetagem × resgate).',
  '/conciliacao': 'Casa créditos do extrato com títulos e confirma baixas.',
  '/folha': 'Encargos e benefícios da folha real (FLP), por evento.',
  '/folha-detalhe': 'Custo de pessoal por setor e centro de custo.',
  '/tributos': 'Retenções (INSS, ISS, IRRF…) e conferência de tributos.',
  '/depreciacao': 'Depreciação contábil por classe de frota.',
  '/fluxo-caixa': 'Projeção e realizado de caixa, com receita GDF explícita.',
  '/orcamento': 'Orçado × realizado por centro de custo.',
  '/dre': 'Demonstração de resultado contábil e gerencial.',
  '/painel-cfo': 'Visão executiva consolidada — KPIs, DPO/DSO.',
  '/auditoria': 'Trilha de acesso e alterações sensíveis.',
  '/perguntas': 'Decisões pendentes registradas para o financeiro.',
  '/minhas-funcionalidades': 'Valide e libere as suas próximas telas.',
  '/admin/usuarios': 'Cadastro, convites e permissões de acesso.',
  '/admin/metrics': 'Métricas de request e atividade do sistema.',
  '/admin/sincronismo': 'Agendamento das integrações com o Globus.',
  '/admin/parametros': 'Identidade, branding e parâmetros gerais.',
  '/admin/integracoes': 'Chaves e status das integrações externas.',
};

// Cor de acento por seção (classes estáticas — Tailwind precisa vê-las no fonte).
const ACENTO: Record<string, { wrap: string; ring: string }> = {
  Operacional: {
    wrap: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    ring: 'hover:border-emerald-300 dark:hover:border-emerald-600/60',
  },
  'Folha & Tributos': {
    wrap: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    ring: 'hover:border-sky-300 dark:hover:border-sky-600/60',
  },
  Planejamento: {
    wrap: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    ring: 'hover:border-violet-300 dark:hover:border-violet-600/60',
  },
  Executivo: {
    wrap: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    ring: 'hover:border-amber-300 dark:hover:border-amber-600/60',
  },
  Admin: {
    wrap: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    ring: 'hover:border-gray-300 dark:hover:border-gray-600',
  },
  Liberação: {
    wrap: 'bg-pioneira-100 text-pioneira-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    ring: 'hover:border-pioneira-300 dark:hover:border-yellow-600/60',
  },
};
const ACENTO_PADRAO = {
  wrap: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  ring: 'hover:border-gray-300 dark:hover:border-gray-600',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [hoje, setHoje] = useState('');

  // Data em client-only pra não haver mismatch de hidratação (fuso SP).
  useEffect(() => {
    setHoje(
      new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date()),
    );
  }, []);

  const grupos = useMemo<NavigationGroup[]>(() => {
    if (!user) return [];
    return buildNavigationGroups(user.role, restricaoDoUsuario(user));
  }, [user]);

  // Seções de módulos (exclui o próprio Dashboard).
  const secoes = grupos
    .map((g) => ({ ...g, items: g.items.filter((i) => i.href !== '/dashboard') }))
    .filter((g) => g.items.length > 0);

  const totalModulos = secoes.reduce((n, g) => n + g.items.length, 0);
  const primeiroNome = user?.nomeCompleto?.split(' ')[0] ?? '';

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-yellow-400/15 bg-gradient-to-br from-pioneira-50/70 via-white to-white dark:from-yellow-950/20 dark:via-black/40 dark:to-black/40 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-pioneira-200/30 dark:bg-yellow-500/10 blur-3xl" />
        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-yellow-300/60 capitalize">
          {hoje || ' '}
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold bg-gradient-to-r from-[#6b5d1a] via-[#7d6b1e] to-[#6b5d1a] dark:from-gray-100 dark:via-white dark:to-gray-100 bg-clip-text text-transparent">
          Bem-vindo(a), {primeiroNome}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
          {totalModulos > 0
            ? `Você tem acesso a ${totalModulos} módulo${totalModulos > 1 ? 's' : ''}. Escolha por onde começar.`
            : 'Seu acesso ainda está sendo liberado. Fale com um administrador se precisar de um módulo.'}
        </p>
      </div>

      {/* Módulos por seção */}
      {secoes.map((grupo) => {
        const acento = ACENTO[grupo.label] ?? ACENTO_PADRAO;
        return (
          <section key={grupo.label} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-yellow-300">
                {grupo.label}
              </h2>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {grupo.items.length} {grupo.items.length > 1 ? 'módulos' : 'módulo'}
              </span>
              <div className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grupo.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group relative flex items-start gap-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${acento.ring}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${acento.wrap}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{item.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                        {DESCRICOES[item.href] ?? 'Abrir módulo.'}
                      </p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-300 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 dark:text-gray-600" />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Estado vazio (usuário sem nenhum módulo liberado) */}
      {secoes.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 dark:border-white/15 py-16 text-center">
          <Sparkles className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">Nenhum módulo liberado ainda</p>
          <p className="mt-1 max-w-sm text-xs text-gray-400 dark:text-gray-500">
            Assim que o seu acesso for liberado, os módulos aparecem aqui.
          </p>
        </div>
      )}
    </div>
  );
}
