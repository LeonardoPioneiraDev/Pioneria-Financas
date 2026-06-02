import { Type, type Static } from '@sinclair/typebox';
import { BANCOS_CNAB } from './cnab.js';

export { BANCOS_CNAB };

const TipoUnion = Type.Union([Type.Literal('boleto'), Type.Literal('pix')]);
const StatusUnion = Type.Union([
  Type.Literal('emitido'),
  Type.Literal('registrado'),
  Type.Literal('pago'),
  Type.Literal('cancelado'),
]);

export const BoletoEmitidoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  contaReceberId: Type.String({ format: 'uuid' }),
  tipo: TipoUnion,
  bancoCodigo: Type.Union([Type.String(), Type.Null()]),
  bancoNome: Type.Union([Type.String(), Type.Null()]),
  nossoNumero: Type.Union([Type.String(), Type.Null()]),
  linhaDigitavel: Type.Union([Type.String(), Type.Null()]),
  codigoBarras: Type.Union([Type.String(), Type.Null()]),
  qrCodePix: Type.Union([Type.String(), Type.Null()]),
  txidPix: Type.Union([Type.String(), Type.Null()]),
  vencimento: Type.String({ format: 'date' }),
  valorCents: Type.Integer(),
  status: StatusUnion,
  modo: Type.Union([Type.Literal('mock'), Type.Literal('real')]),
  emitidoEm: Type.String({ format: 'date-time' }),
  pagoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  observacao: Type.Union([Type.String(), Type.Null()]),
});
export type BoletoEmitidoResponse = Static<typeof BoletoEmitidoSchema>;

export const CrElegivelBoletoSchema = Type.Object({
  contaReceberId: Type.String({ format: 'uuid' }),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  dataVencimento: Type.String({ format: 'date' }),
  valorCents: Type.Integer(),
  cliente: Type.Union([
    Type.Object({
      razaoSocial: Type.String(),
      cnpjCpf: Type.Union([Type.String(), Type.Null()]),
    }),
    Type.Null(),
  ]),
  jaTemBoleto: Type.Boolean(),
  jaTemPix: Type.Boolean(),
});
export type CrElegivelBoleto = Static<typeof CrElegivelBoletoSchema>;

export const ElegiveisBoletosResponseSchema = Type.Object({
  itens: Type.Array(CrElegivelBoletoSchema),
});
export type ElegiveisBoletosResponse = Static<typeof ElegiveisBoletosResponseSchema>;

export const EmitirBoletoBodySchema = Type.Object({
  contaReceberId: Type.String({ format: 'uuid' }),
  bancoCodigo: Type.String({ minLength: 3, maxLength: 3 }),
});
export type EmitirBoletoBody = Static<typeof EmitirBoletoBodySchema>;

export const EmitirPixBodySchema = Type.Object({
  contaReceberId: Type.String({ format: 'uuid' }),
});
export type EmitirPixBody = Static<typeof EmitirPixBodySchema>;

export const BoletosListResponseSchema = Type.Object({
  itens: Type.Array(BoletoEmitidoSchema),
});
export type BoletosListResponse = Static<typeof BoletosListResponseSchema>;
