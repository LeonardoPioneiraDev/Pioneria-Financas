import {
  Archive,
  Banknote,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Circle,
  CircleDot,
  FileCheck,
  FileText,
  Inbox,
  MessageSquare,
  Paperclip,
  PenTool,
  Phone,
  Send,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

const ICONES: Record<string, LucideIcon> = {
  Archive,
  Banknote,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Circle,
  CircleDot,
  FileCheck,
  FileText,
  Inbox,
  MessageSquare,
  Paperclip,
  PenTool,
  Phone,
  Send,
  ShieldCheck,
};

export function getIconeEtapa(nome: string | undefined | null): LucideIcon {
  if (!nome) return Circle;
  return ICONES[nome] ?? Circle;
}

interface CorEtapa {
  bg: string;
  border: string;
  text: string;
  ring: string;
}

const CORES: Record<string, CorEtapa> = {
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    border: 'border-blue-400 dark:border-blue-500',
    text: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-400/40',
  },
  amber: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    border: 'border-amber-400 dark:border-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-400/40',
  },
  emerald: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    border: 'border-emerald-400 dark:border-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-400/40',
  },
  red: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    border: 'border-red-400 dark:border-red-500',
    text: 'text-red-700 dark:text-red-300',
    ring: 'ring-red-400/40',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    border: 'border-purple-400 dark:border-purple-500',
    text: 'text-purple-700 dark:text-purple-300',
    ring: 'ring-purple-400/40',
  },
  pioneira: {
    bg: 'bg-pioneira-200 dark:bg-pioneira-800/40',
    border: 'border-pioneira-400 dark:border-pioneira-500',
    text: 'text-pioneira-800 dark:text-pioneira-200',
    ring: 'ring-pioneira-400/40',
  },
  gray: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    border: 'border-gray-300 dark:border-gray-700',
    text: 'text-gray-500 dark:text-gray-400',
    ring: 'ring-gray-300/40',
  },
};

export function getCorEtapa(cor: string | undefined | null): CorEtapa {
  if (!cor) return CORES.gray!;
  return CORES[cor] ?? CORES.gray!;
}

export const ACAO_LABEL: Record<string, string> = {
  criou: 'criou o workflow',
  avancou: 'avancou a etapa',
  voltou: 'retornou a etapa',
  comentou: 'comentou',
  anexou: 'anexou um arquivo',
  aprovou: 'aprovou (etapa final)',
  rejeitou: 'rejeitou',
  cancelou: 'cancelou o workflow',
  retomou: 'retomou o workflow',
  atribuiu: 'atribuiu a outro responsavel',
};
