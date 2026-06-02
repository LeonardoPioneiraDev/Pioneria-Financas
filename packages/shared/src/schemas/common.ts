import { Type, type Static } from '@sinclair/typebox';

export const PaginationQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  search: Type.Optional(Type.String({ maxLength: 200 })),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const PaginatedResponseSchema = <T extends ReturnType<typeof Type.Object>>(item: T) =>
  Type.Object({
    data: Type.Array(item),
    pagination: Type.Object({
      page: Type.Integer(),
      limit: Type.Integer(),
      total: Type.Integer(),
      totalPages: Type.Integer(),
    }),
  });

export const ErrorResponseSchema = Type.Object({
  statusCode: Type.Integer(),
  error: Type.String(),
  message: Type.String(),
});
export type ErrorResponse = Static<typeof ErrorResponseSchema>;
