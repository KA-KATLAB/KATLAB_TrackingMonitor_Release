import type { ReactNode } from "react";
import { DialogShell } from "./dialog";

/** The existing scope collection owns choices and paging; this owns no route state. */
export function RepositorySwitcher ({ children, onClose }: {
  children: ReactNode;
  onClose: () => void;
}): JSX.Element {
  return (
    <DialogShell title="Repository scope" description="Choose a repository or the whole workspace."
      onClose={onClose} closeLabel="Close repository scope" backdropClose
      panelClassName="max-w-lg">
      {children}
    </DialogShell>
  );
}
