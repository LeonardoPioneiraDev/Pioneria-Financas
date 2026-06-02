'use client';

import { useEffect, useState } from 'react';

/**
 * Retorna o valor apos `delay` ms de estabilidade.
 * Ideal para campos de busca livre - evita disparar fetch a cada keypress.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
