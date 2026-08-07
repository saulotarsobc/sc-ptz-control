import type { UpdateStatus } from "@/types";
import { useEffect, useState } from "react";

/**
 * Acompanha a atualização automática empurrada pelo processo principal.
 *
 * Erro vira `null` de propósito: a checagem falha sempre que a máquina está sem
 * internet (o caso comum num salão), e isso não é problema do operador — o app
 * segue funcionando na versão instalada. O erro é registrado no console do main.
 */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(
    () =>
      window.ptz.onUpdateStatus((next) =>
        setStatus(next.state === "error" ? null : next),
      ),
    [],
  );

  return status;
}
