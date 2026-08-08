import { useBridge } from '@/context/BridgeProvider';
import { thumbUrl } from '@/services/bridge/api';
import type { Preset } from '@/types';
import { useCallback, useEffect, useState } from 'react';

/** Preset com a URL da miniatura já resolvida — o que os componentes consomem. */
export type PresetView = Preset & {
  /** URL da miniatura, ou "" quando o preset ainda não tem imagem. */
  thumbUrl: string;
};

/**
 * Lista de presets do canal, vinda do backend (nome + existência de miniatura).
 *
 * A URL da miniatura carrega a `thumbRev` como cache-buster, então trocar a imagem de
 * um preset é só atualizar a `rev` — o navegador cacheia cada versão para sempre e não
 * rebaixa a grade inteira a cada render.
 */
export function usePresets(channel: number) {
  const { api, endpoint, link } = useBridge();
  const [presets, setPresets] = useState<PresetView[]>([]);
  const [loading, setLoading] = useState(true);

  const decorate = useCallback(
    (list: Preset[]): PresetView[] =>
      list.map((preset) => ({
        ...preset,
        thumbUrl:
          preset.thumbRev > 0 && endpoint
            ? thumbUrl(endpoint.port, endpoint.token, channel, preset.n, preset.thumbRev)
            : '',
      })),
    [channel, endpoint],
  );

  const refresh = useCallback(async () => {
    if (link !== 'open') return;
    try {
      setPresets(decorate(await api.presetList(channel)));
    } catch {
      // Enlace caiu no meio: o efeito abaixo recarrega quando ele voltar.
    } finally {
      setLoading(false);
    }
  }, [api, channel, decorate, link]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Atualiza um preset localmente, sem recarregar a lista inteira. */
  const patch = useCallback(
    (n: number, changes: Partial<Preset>) => {
      setPresets((prev) => prev.map((preset) => (preset.n === n ? decorate([{ ...preset, ...changes }])[0] : preset)));
    },
    [decorate],
  );

  return { presets, loading, refresh, patch };
}
