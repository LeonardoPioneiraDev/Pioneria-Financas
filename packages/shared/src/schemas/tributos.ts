import { Type, type Static } from '@sinclair/typebox';

/**
 * Calendário tributário — REFERÊNCIA. As regras de vencimento abaixo são os
 * prazos federais padrão (Brasil 2026) e NÃO substituem a orientação da
 * contabilidade. Datas exatas (e ISS municipal) devem ser confirmadas — por
 * isso `regraVencimento` é texto descritivo, não uma data cravada.
 *
 * Não inventamos a apuração da Pioneira aqui: isto é só o "quando vence o quê",
 * cruzado com as guias que já existem no banco (origem='guia').
 */
export const CALENDARIO_TRIBUTARIO_REF = [
  {
    codigo: 'IRRF_SERV',
    tributo: 'IRRF',
    descricao: 'IRRF retido sobre serviços (PJ/PF)',
    periodicidade: 'mensal',
    regraVencimento: 'Até o último dia útil do 2º decêndio do mês seguinte ao fato gerador',
    esfera: 'federal',
    tipo: 'recolhimento',
    obs: 'Confirmar código de receita por natureza do serviço.',
  },
  {
    codigo: 'CSRF',
    tributo: 'PIS/COFINS/CSLL (retidos)',
    descricao: 'Contribuições retidas na fonte sobre serviços (CSRF, cód. 5952)',
    periodicidade: 'mensal',
    regraVencimento: 'Até o último dia útil do 2º decêndio do mês seguinte ao pagamento',
    esfera: 'federal',
    tipo: 'recolhimento',
    obs: 'Dispensado p/ fornecedor do Simples Nacional.',
  },
  {
    codigo: 'PIS_COFINS',
    tributo: 'PIS/COFINS (próprios)',
    descricao: 'PIS e COFINS da apuração própria',
    periodicidade: 'mensal',
    regraVencimento: 'Até o dia 25 do mês seguinte ao fato gerador',
    esfera: 'federal',
    tipo: 'recolhimento',
    obs: 'Depende do regime (Lucro Real/Presumido) — confirmar com a contabilidade.',
  },
  {
    codigo: 'INSS',
    tributo: 'INSS / Previdência',
    descricao: 'Contribuição previdenciária (GPS / DARF previdenciário)',
    periodicidade: 'mensal',
    regraVencimento: 'Dia 20 do mês seguinte (antecipa p/ dia útil anterior se não útil)',
    esfera: 'federal',
    tipo: 'recolhimento',
    obs: 'Inclui retenção de 11% sobre cessão de mão de obra, quando houver.',
  },
  {
    codigo: 'FGTS',
    tributo: 'FGTS',
    descricao: 'Fundo de Garantia (FGTS Digital)',
    periodicidade: 'mensal',
    regraVencimento: 'Dia 20 do mês seguinte',
    esfera: 'fgts',
    tipo: 'recolhimento',
    obs: 'Vencimento alterado para o dia 20 com o FGTS Digital.',
  },
  {
    codigo: 'IRPJ_CSLL',
    tributo: 'IRPJ/CSLL',
    descricao: 'IRPJ e CSLL (estimativa mensal ou apuração trimestral)',
    periodicidade: 'mensal/trimestral',
    regraVencimento: 'Último dia útil do mês seguinte (estimativa) — confirmar periodicidade',
    esfera: 'federal',
    tipo: 'recolhimento',
    obs: 'Mensal por estimativa OU trimestral — depende da opção da empresa.',
  },
  {
    codigo: 'ISS',
    tributo: 'ISS',
    descricao: 'ISS (próprio e/ou retido) — municipal',
    periodicidade: 'mensal',
    regraVencimento: 'Conforme legislação municipal (DF) — confirmar data e alíquota',
    esfera: 'municipal',
    tipo: 'recolhimento',
    obs: 'Alíquota e regra de retenção variam por município (DF: 2%–5%).',
  },
  {
    codigo: 'EFD_REINF_DCTFWEB',
    tributo: 'EFD-Reinf / DCTFWeb',
    descricao: 'Obrigações acessórias (escrituração de retenções e confissão de débitos)',
    periodicidade: 'mensal',
    regraVencimento: 'Até o dia 15 do mês seguinte (EFD-Reinf) — confirmar',
    esfera: 'federal',
    tipo: 'declaracao',
    obs: 'Declaração, não recolhimento. Alimenta a DCTFWeb.',
  },
] as const;

/**
 * Estado das fontes tributárias — TRANSPARÊNCIA. O sistema reflete o Globus:
 * onde o Globus tem o dado, mostramos; onde não tem, dizemos "vazio" — nunca
 * inventamos. Se a equipe passar a preencher no Globus, aparece aqui sozinho.
 *
 * estado:
 *   - 'preenchido'   → o Globus tem o dado e o sistema usa.
 *   - 'vazio_globus' → o campo existe no Globus mas a Pioneira não preenche.
 *   - 'fora_globus'  → o dado é feito fora do Globus (ex.: apuração no contador).
 */
export const FONTES_TRIBUTARIAS = [
  {
    item: 'Setor / centro de custo do título',
    descricao: 'Unidade (garagem) responsável pelo gasto.',
    fonteGlobus: 'CPGITDOC.CODCUSTOFIN → CPGCUSTOS.DESCRICAO',
    estado: 'preenchido',
    orientacao: '~95% dos itens preenchidos. Já aparece nas pílulas de setor.',
  },
  {
    item: 'Retenções na fonte (PIS/COFINS/CSLL/IRRF)',
    descricao: 'Valores retidos no pagamento de NF de serviço.',
    fonteGlobus: 'CPGDOCTO.VLRPISCPG / VLRCOFINSCPG / VLRCSLCPG / VLRIRRFCPG',
    estado: 'preenchido',
    orientacao: 'Preenchido nas NF de serviço (NFS). Conferência ativa na tela de Divergências.',
  },
  {
    item: 'Regime tributário da empresa',
    descricao: 'Lucro Real x Presumido — base da heurística de retenção.',
    fonteGlobus: 'CTB_ECF_APUR_IRPJ_CSLL.FORMA_TRIB',
    estado: 'preenchido',
    orientacao: "Globus confirma 'R' = Lucro Real (exercício 2024).",
  },
  {
    item: 'INSS retido',
    descricao: 'Retenção de 11% (cessão de mão de obra etc.).',
    fonteGlobus: 'CPGDOCTO.VLRINSSCPG',
    estado: 'vazio_globus',
    orientacao: 'Vem ZERO em 100% dos títulos. Por isso é só informativo — não dá pra conferir o que não existe. Se houver retenção real, precisa ser lançada no Globus.',
  },
  {
    item: 'ISS retido',
    descricao: 'Retenção de ISS sobre serviços.',
    fonteGlobus: 'CPGDOCTO.VLRISSCPG',
    estado: 'vazio_globus',
    orientacao: 'Vem ZERO em 100% dos títulos. ISS é municipal e depende da política de retenção da Pioneira.',
  },
  {
    item: 'Código de receita / imposto da guia',
    descricao: 'Qual tributo e código de receita de cada guia (DARF/GPS).',
    fonteGlobus: 'CPGDOCTO.CODRECEITA_GUIA / IMPOSTO_GUIA',
    estado: 'vazio_globus',
    orientacao: 'Quase vazio (≈5 de 800 guias). Para virar relatório de guias por imposto, esses campos precisam ser preenchidos no lançamento da guia no Globus.',
  },
  {
    item: 'Apuração mensal de PIS/COFINS',
    descricao: 'O cálculo mensal do imposto devido pela empresa.',
    fonteGlobus: 'Não disponível no Globus (a ECF é anual e defasada)',
    estado: 'fora_globus',
    orientacao: 'A apuração mensal é feita fora do Globus (contador ou sistema fiscal externo). Para o sistema mostrar, precisaríamos integrar essa fonte externa.',
  },
] as const;

export const FonteTributariaSchema = Type.Object({
  item: Type.String(),
  descricao: Type.String(),
  fonteGlobus: Type.String(),
  estado: Type.Union([Type.Literal('preenchido'), Type.Literal('vazio_globus'), Type.Literal('fora_globus')]),
  orientacao: Type.String(),
});
export type FonteTributaria = Static<typeof FonteTributariaSchema>;

export const CoberturaTributariaResponseSchema = Type.Object({
  /** Prova ao vivo, calculada do banco local (não é referência). */
  retencoes: Type.Object({
    notasServico: Type.Integer(),
    comAlgumaRetencao: Type.Integer(),
    inssCentsTotal: Type.Integer(),
    issCentsTotal: Type.Integer(),
  }),
  guias: Type.Object({ total: Type.Integer() }),
  fontes: Type.Array(FonteTributariaSchema),
});
export type CoberturaTributariaResponse = Static<typeof CoberturaTributariaResponseSchema>;

export const ObrigacaoTributariaSchema = Type.Object({
  codigo: Type.String(),
  tributo: Type.String(),
  descricao: Type.String(),
  periodicidade: Type.String(),
  regraVencimento: Type.String(),
  esfera: Type.Union([Type.Literal('federal'), Type.Literal('municipal'), Type.Literal('fgts')]),
  tipo: Type.Union([Type.Literal('recolhimento'), Type.Literal('declaracao')]),
  obs: Type.String(),
});
export type ObrigacaoTributaria = Static<typeof ObrigacaoTributariaSchema>;

export const CalendarioGuiaItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  fornecedorRazaoSocial: Type.Union([Type.String(), Type.Null()]),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  tipoDocumento: Type.Union([Type.String(), Type.Null()]),
  dataVencimento: Type.String({ format: 'date' }),
  dataPagamento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  valorAPagarCents: Type.Integer(),
  status: Type.String(),
});
export type CalendarioGuiaItem = Static<typeof CalendarioGuiaItemSchema>;

export const CalendarioTributarioQuerySchema = Type.Object({
  ano: Type.Optional(Type.Integer({ minimum: 2000, maximum: 2100 })),
  mes: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
});
export type CalendarioTributarioQuery = Static<typeof CalendarioTributarioQuerySchema>;

export const CalendarioTributarioResponseSchema = Type.Object({
  ano: Type.Integer(),
  mes: Type.Integer(),
  /** Obrigações de referência (prazos padrão — confirmar com a contabilidade). */
  obrigacoes: Type.Array(ObrigacaoTributariaSchema),
  /**
   * Guias (origem='guia') JÁ lançadas no banco com vencimento no mês — dado real,
   * não referência. É o cruzamento entre "o que vence" e "o que está no sistema".
   */
  guias: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
    pagasQuantidade: Type.Integer(),
    pagasValorCents: Type.Integer(),
    vencidasEmAbertoQuantidade: Type.Integer(),
    vencidasEmAbertoValorCents: Type.Integer(),
    itens: Type.Array(CalendarioGuiaItemSchema),
  }),
});
export type CalendarioTributarioResponse = Static<typeof CalendarioTributarioResponseSchema>;
