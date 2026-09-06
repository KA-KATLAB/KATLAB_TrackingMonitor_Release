import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  MutableRefObject,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";
import { CollectionPager, cx, IconButton, useBoundedPage } from "./ui";

interface SavedOverlayState {
  appScroll: Array<{ element: HTMLElement; overflow: string }>;
  bodyOverflow: string;
  bodyPaddingRight: string;
  marker: string | undefined;
  rootAriaHidden: string | null;
  rootInert: boolean;
}

let leaseCount = 0;
let restoreEpoch = 0;
let savedState: SavedOverlayState | null = null;
let unlockGeneration = 0;

function lockBackground (): void {
  const root = document.getElementById("root");
  const appScroll = [...document.querySelectorAll<HTMLElement>("[data-app-scroll]")];
  savedState = {
    appScroll: appScroll.map((element) => ({
      element,
      overflow: element.style.overflow,
    })),
    bodyOverflow: document.body.style.overflow,
    bodyPaddingRight: document.body.style.paddingRight,
    marker: document.body.dataset.overlayOpen,
    rootAriaHidden: root?.getAttribute("aria-hidden") ?? null,
    rootInert: root?.inert ?? false,
  };
  const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  if (scrollbar > 0) document.body.style.paddingRight = scrollbar + "px";
  document.body.style.overflow = "hidden";
  document.body.dataset.overlayOpen = "1";
  for (const { element } of savedState.appScroll) element.style.overflow = "hidden";
  if (root) {
    root.inert = true;
    root.setAttribute("aria-hidden", "true");
  }
}

function unlockBackground (): void {
  const state = savedState;
  if (!state) return;
  const root = document.getElementById("root");
  document.body.style.overflow = state.bodyOverflow;
  document.body.style.paddingRight = state.bodyPaddingRight;
  if (state.marker === undefined) delete document.body.dataset.overlayOpen;
  else document.body.dataset.overlayOpen = state.marker;
  for (const { element, overflow } of state.appScroll) {
    if (element.isConnected) element.style.overflow = overflow;
  }
  if (root) {
    root.inert = state.rootInert;
    if (state.rootAriaHidden === null) root.removeAttribute("aria-hidden");
    else root.setAttribute("aria-hidden", state.rootAriaHidden);
  }
  savedState = null;
}

function acquireOverlayLease (): () => void {
  unlockGeneration += 1;
  if (leaseCount === 0 && !savedState) lockBackground();
  leaseCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    leaseCount = Math.max(0, leaseCount - 1);
    if (leaseCount !== 0) return;
    const generation = ++unlockGeneration;
    queueMicrotask(() => {
      if (leaseCount === 0 && unlockGeneration === generation) unlockBackground();
    });
  };
}

export function hasOverlayLease (): boolean {
  return leaseCount > 0;
}

export function suppressOverlayFocusRestore (): void {
  restoreEpoch += 1;
}

function isVisibleFocusTarget (element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected || element.closest("[inert]")) return false;
  if (element.matches(":disabled, [aria-disabled='true']")) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden"
    && element.getClientRects().length > 0;
}

function focusMainFallback (): void {
  const target = document.querySelector<HTMLElement>(
    "#main-content [data-view-heading], #main-content h2, #main-content",
  );
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

function focusableWithin (root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not(:disabled)",
    "input:not(:disabled)",
    "select:not(:disabled)",
    "textarea:not(:disabled)",
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
  ].join(",");
  return [...root.querySelectorAll<HTMLElement>(selector)]
    .filter((element) => isVisibleFocusTarget(element));
}

export interface DialogShellProps {
  title: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  initialFocusRef?: MutableRefObject<HTMLElement | null>;
  backdropClose?: boolean;
  closeLabel?: string;
  panelClassName?: string;
  bodyClassName?: string;
}

export function DialogShell ({
  title,
  description,
  headerActions,
  children,
  onClose,
  initialFocusRef,
  backdropClose = false,
  closeLabel = "Close dialog",
  panelClassName,
  bodyClassName,
}: DialogShellProps): JSX.Element {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const mountedRestoreEpoch = useRef(restoreEpoch);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    mountedRestoreEpoch.current = restoreEpoch;
    const release = acquireOverlayLease();
    return () => {
      const restore = mountedRestoreEpoch.current === restoreEpoch;
      const opener = openerRef.current;
      release();
      queueMicrotask(() => {
        if (!restore || hasOverlayLease()) return;
        if (isVisibleFocusTarget(opener)) opener.focus({ preventScroll: true });
        else focusMainFallback();
      });
    };
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const initial = initialFocusRef?.current ?? null;
    if (isVisibleFocusTarget(initial)) initial.focus({ preventScroll: true });
    else if (isVisibleFocusTarget(closeRef.current)) {
      closeRef.current.focus({ preventScroll: true });
    } else {
      panel.focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const stops = focusableWithin(panel);
      if (stops.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const current = document.activeElement as HTMLElement | null;
      const index = current ? stops.indexOf(current) : -1;
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        stops[stops.length - 1].focus();
      } else if (!event.shiftKey && (index === -1 || index === stops.length - 1)) {
        event.preventDefault();
        stops[0].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [initialFocusRef]);

  return createPortal(
    <div
      className="ui-safe-dialog fixed inset-0 z-layer-dialog flex items-start justify-center overflow-y-auto bg-ui-canvas/80"
      onMouseDown={(event) => {
        if (backdropClose && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          "ui-disclosure-enter ui-transition my-auto flex max-h-full max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-panel border border-ui-border bg-ui-surface shadow-2xl",
          panelClassName,
        )}
      >
        <div className="flex min-w-0 items-start gap-2 border-b border-ui-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="break-words text-sm font-semibold text-ui-text">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-0.5 break-words text-xs text-ui-muted">
                {description}
              </div>
            )}
          </div>
          {headerActions && (
            <div className="flex shrink-0 flex-wrap items-center gap-1">{headerActions}</div>
          )}
          <IconButton ref={closeRef} label={closeLabel} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
        <div className={cx("min-h-0 overflow-y-auto p-4", bodyClassName)}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface BoundedChoice {
  id: string;
  label: string;
  description?: string;
  disabledReason?: string;
}

export interface BoundedChoiceDialogProps {
  title: string;
  description?: string;
  fieldLabel: string;
  collectionLabel: string;
  choices: readonly BoundedChoice[];
  value: string;
  onChange: (id: string) => void;
  contextKey: string;
  placeholder: string;
  disabled?: boolean;
  disabledReason?: string;
  triggerClassName?: string;
}

function normalizeChoiceSearch (value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").trim().split(/\s+/)
    .filter(Boolean);
}

function searchableChoiceText (choice: BoundedChoice): string {
  return `${choice.label} ${choice.description ?? ""}`
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
}

export function BoundedChoiceDialog ({
  title,
  description,
  fieldLabel,
  collectionLabel,
  choices,
  value,
  onChange,
  contextKey,
  placeholder,
  disabled = false,
  disabledReason,
  triggerClassName,
}: BoundedChoiceDialogProps): JSX.Element {
  const dialogId = useId().replace(/:/g, "-");
  const helpId = `${dialogId}-help`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selected = choices.find((choice) => choice.id === value);
  const tokens = useMemo(() => normalizeChoiceSearch(query), [query]);
  const filtered = useMemo(() => choices.filter((choice) => {
    if (tokens.length === 0) return true;
    const text = searchableChoiceText(choice);
    return tokens.every((token) => text.includes(token));
  }), [choices, tokens]);
  const pager = useBoundedPage({
    identity: ["bounded-choice", contextKey, JSON.stringify(tokens)],
    totalItems: filtered.length,
    pageSize: 50,
    page,
    onPageChange: setPage,
  });

  useEffect(() => {
    setOpen(false);
    setQuery("");
    setPage(1);
  }, [contextKey]);

  const openDialog = (): void => {
    const selectedIndex = choices.findIndex((choice) => choice.id === value);
    setQuery("");
    setPage(selectedIndex < 0 ? 1 : Math.floor(selectedIndex / 50) + 1);
    setOpen(true);
  };
  const closeDialog = (): void => {
    setOpen(false);
    setQuery("");
    setPage(1);
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${dialogId}-panel`}
        aria-describedby={disabledReason ? helpId : undefined}
        disabled={disabled}
        title={disabledReason}
        onClick={openDialog}
        className={cx(
          "ui-control min-w-0 max-w-full justify-start bg-ui-raised text-left text-ui-text disabled:opacity-40",
          triggerClassName,
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
      </button>
      {disabledReason && <span id={helpId} className="sr-only">{disabledReason}</span>}
      {open && (
        <DialogShell
          title={title}
          description={description}
          onClose={closeDialog}
          initialFocusRef={searchRef}
          backdropClose
          panelClassName="max-w-xl"
        >
          <div id={`${dialogId}-panel`}>
            <label className="block text-sm font-medium text-ui-text" htmlFor={`${dialogId}-search`}>
              {fieldLabel}
            </label>
            <input
              ref={searchRef}
              id={`${dialogId}-search`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="ui-focus-ring mt-1 min-h-10 w-full rounded-control border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
            />
            <p className="mt-1 text-xs text-ui-muted">
              {filtered.length.toLocaleString("en-US")} of {choices.length.toLocaleString("en-US")} choices
            </p>
            <div className="mt-3 grid gap-1" aria-label={collectionLabel}>
              {filtered.slice(pager.start, pager.end).map((choice) => (
                <button
                  key={choice.id}
                  id={`${dialogId}-choice-${encodeURIComponent(choice.id)}`}
                  type="button"
                  aria-current={choice.id === value ? "true" : undefined}
                  aria-disabled={choice.disabledReason ? "true" : undefined}
                  title={choice.disabledReason}
                  onClick={() => {
                    if (choice.disabledReason) return;
                    onChange(choice.id);
                    closeDialog();
                  }}
                  className={cx(
                    "ui-focus-ring min-w-0 rounded-control border px-3 py-2 text-left",
                    choice.id === value
                      ? "border-ui-primary bg-ui-primary/15 text-ui-text"
                      : "border-ui-border bg-ui-raised text-ui-text hover:bg-ui-border",
                    choice.disabledReason && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="block break-words text-sm font-medium">
                    {choice.label}
                    {choice.id === value && (
                      <span className="ml-1 text-xs font-normal text-ui-muted">— current</span>
                    )}
                  </span>
                  {(choice.description || choice.disabledReason) && (
                    <span className="mt-0.5 block break-words text-xs text-ui-muted">
                      {choice.disabledReason ?? choice.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {filtered.length === 0 && (
              <p className="mt-3 rounded-control border border-ui-border p-3 text-sm text-ui-muted">
                No choices match this search.
              </p>
            )}
            {filtered.length > 50 && (
              <CollectionPager
                collectionLabel={collectionLabel}
                page={pager}
                onPageChange={pager.setPage}
              />
            )}
          </div>
        </DialogShell>
      )}
    </>
  );
}
