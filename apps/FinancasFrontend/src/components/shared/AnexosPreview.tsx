'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** Extensão de arquivo a partir do mime do data-URI (ex.: 'data:image/png;base64,...' → 'png'). */
function extensaoDoDataUri(dataUri: string): string {
  const m = /^data:image\/([a-z0-9+.-]+);base64,/i.exec(dataUri);
  const tipo = m?.[1]?.toLowerCase() ?? 'png';
  return tipo === 'jpeg' ? 'jpg' : tipo;
}

/**
 * Miniaturas de anexos (prints, data-URI) com preview em modal ao clicar.
 *
 * NÃO usar `<a href={dataUri} target="_blank">`: navegadores Chromium bloqueiam
 * navegação de topo para URLs `data:` (proteção anti-phishing) — o link
 * simplesmente não abre nada. Já `<a download>` funciona normalmente (não é
 * navegação, é download) — é assim que o botão "Baixar" abaixo funciona.
 */
export function AnexosPreview({ anexos, thumbSizeClass = 'h-16' }: { anexos: string[]; thumbSizeClass?: string }) {
  const [abertoIdx, setAbertoIdx] = useState<number | null>(null);
  const aberto = abertoIdx !== null ? anexos[abertoIdx] : null;

  if (anexos.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {anexos.map((src, idx) => (
          <button key={idx} type="button" onClick={() => setAbertoIdx(idx)} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Print anexado"
              className={`${thumbSizeClass} w-auto cursor-zoom-in rounded border border-gray-200 dark:border-gray-700`}
            />
          </button>
        ))}
      </div>

      <Dialog open={!!aberto} onOpenChange={(v) => { if (!v) setAbertoIdx(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">Print anexado</DialogTitle>
          {aberto && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aberto} alt="Print anexado" className="max-h-[80vh] w-full rounded object-contain" />
              <a href={aberto} download={`print-anexado-${(abertoIdx ?? 0) + 1}.${extensaoDoDataUri(aberto)}`} className="mt-3 inline-block">
                <Button size="sm" variant="outline">
                  <Download className="h-3.5 w-3.5" /><span className="ml-1">Baixar</span>
                </Button>
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
