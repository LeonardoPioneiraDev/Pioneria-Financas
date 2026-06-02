import crypto from 'node:crypto';

export function gerarTokenAleatorio(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Serializacao canonica de objeto: chaves ordenadas alfabeticamente em todos
 * os niveis, garantindo que o mesmo conteudo gere sempre o mesmo JSON
 * independente da ordem de insercao das chaves.
 *
 * Tratamento especifico:
 *   - `Date` vira ISO string (estavel mesmo se Oracle retornar Date object)
 *   - `undefined` em objetos e removido (JSON.stringify ja faz isso)
 *   - `null` e preservado
 *   - Arrays mantem ordem (semanticamente significativa)
 */
function jsonCanonico(valor: unknown): string {
  if (valor === null || valor === undefined) return JSON.stringify(valor);
  if (valor instanceof Date) return JSON.stringify(valor.toISOString());
  if (Array.isArray(valor)) {
    return `[${valor.map((v) => jsonCanonico(v)).join(',')}]`;
  }
  if (typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    const chaves = Object.keys(obj).sort();
    const partes = chaves
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${jsonCanonico(obj[k])}`);
    return `{${partes.join(',')}}`;
  }
  return JSON.stringify(valor);
}

/**
 * Hash SHA-256 hex de um objeto JSON com serializacao canonica.
 *
 * Uso: marcar payloads raw do Globus no _stage com `hash_payload`. Permite
 * pular update quando o conteudo nao mudou (sync mais rapido) e detectar
 * mudancas reais quando o conteudo mudou.
 *
 * Chaves ordenadas alfabeticamente, Datas como ISO — duas execucoes com o
 * mesmo dado retornam o mesmo hash.
 */
export function sha256Json(payload: unknown): string {
  return crypto.createHash('sha256').update(jsonCanonico(payload)).digest('hex');
}
