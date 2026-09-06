import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  ForwardedRef,
  HTMLAttributes,
  MutableRefObject,
  ReactNode,
  RefAttributes,
} from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

export function cx (...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function isProbeVisible (element: Element): boolean {
  const html = element as HTMLElement;
  if (!html.isConnected || html.hidden) return false;
  const style = window.getComputedStyle(html);
  return style.display !== "none" && style.visibility !== "hidden"
    && html.getClientRects().length > 0;
}

// Read-only guard used by attract mode. It deliberately observes shared DOM
// semantics instead of lifting every child disclosure's state into App.
export function hasActiveInteraction (): boolean {
  if (document.body.dataset.overlayOpen) return true;
  const expanded = [...document.querySelectorAll('[aria-expanded="true"]')]
    .some(isProbeVisible);
  if (expanded) return true;
  const details = [...document.querySelectorAll("details[open]")].some(isProbeVisible);
  if (details) return true;
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || !focused.isConnected) return false;
  if (focused.matches("input, select, textarea")) return true;
  if (focused.isContentEditable) return true;
  return focused.matches('iframe[src^="/chronicle/"]');
}

let disclosureRestoreEpoch = 0;

export function suppressDisclosureFocusRestore (): void {
  disclosureRestoreEpoch += 1;
}

export function useDisclosureBehavior ({
  open,
  onClose,
  rootRef,
  triggerRef,
  returnFocusRef,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  rootRef: MutableRefObject<HTMLElement | null>;
  triggerRef: MutableRefObject<HTMLElement | null>;
  returnFocusRef?: MutableRefObject<HTMLElement | null>;
  initialFocusRef?: MutableRefObject<HTMLElement | null>;
}): void {
  const onCloseRef = useRef(onClose);
  const lifecycleRef = useRef(0);
  onCloseRef.current = onClose;
  useEffect(() => {
    const lifecycle = ++lifecycleRef.current;
    if (!open) return;
    const mountedEpoch = disclosureRestoreEpoch;
    initialFocusRef?.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        suppressDisclosureFocusRestore();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer);
      queueMicrotask(() => {
        if (lifecycleRef.current !== lifecycle) return;
        if (mountedEpoch !== disclosureRestoreEpoch) return;
        const target = returnFocusRef?.current ?? triggerRef.current;
        if (target?.isConnected && target.getClientRects().length > 0) {
          target.focus({ preventScroll: true });
        } else {
          document.getElementById("main-content")?.focus({ preventScroll: true });
        }
      });
    };
  }, [initialFocusRef, open, returnFocusRef, rootRef, triggerRef]);
}

export const Surface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Surface ({ className, ...props }, ref) {
    return <div ref={ref} className={cx("ui-surface", className)} {...props} />;
  },
);

interface SectionHeadingProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingId?: string;
  headingProps?: HTMLAttributes<HTMLHeadingElement> & { "data-view-heading"?: boolean };
  level?: 2 | 3 | 4;
}

export const SectionHeading = forwardRef<HTMLDivElement, SectionHeadingProps>(
  function SectionHeading ({
    title,
    description,
    actions,
    headingId,
    headingProps,
    level = 2,
    className,
    ...props
  }, ref) {
    const Heading = ("h" + level) as "h2" | "h3" | "h4";
    const { className: headingClassName, ...restHeadingProps } = headingProps ?? {};
    const hierarchyClass = level === 2
      ? "text-lg font-bold leading-7"
      : level === 3
        ? "text-base font-semibold leading-6"
        : "text-sm font-semibold leading-5";
    return (
      <div
        ref={ref}
        className={cx(
          "mb-3 flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2",
          className,
        )}
        {...props}
      >
        <div className="min-w-0 flex-1">
          <Heading {...restHeadingProps} id={headingId ?? restHeadingProps.id}
            className={cx(hierarchyClass, "text-ui-text", headingClassName)}>
            {title}
          </Heading>
          {description && (
            <p className="mt-0.5 max-w-prose text-xs leading-[1.5] text-ui-muted">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
    );
  },
);

type ControlTone = "neutral" | "primary" | "warning" | "danger";

const CONTROL_TONE: Record<ControlTone, string> = {
  neutral: "bg-ui-raised text-ui-text hover:bg-ui-border",
  primary: "bg-ui-primary text-white hover:bg-ui-primary-hover",
  warning: "bg-ui-warning text-slate-950 hover:bg-amber-400",
  danger: "bg-ui-danger text-white hover:bg-rose-500",
};

export interface ControlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
  tone?: ControlTone;
}

export const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  function ControlButton ({
    busy = false,
    tone = "neutral",
    className,
    disabled,
    type = "button",
    ...props
  }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        {...props}
        aria-busy={busy || undefined}
        disabled={disabled || busy}
        className={cx("ui-control", CONTROL_TONE[tone], className)}
      />
    );
  },
);

export interface IconButtonProps extends ControlButtonProps {
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton ({ label, title, className, ...props }, ref) {
    return (
      <ControlButton
        {...props}
        ref={ref}
        aria-label={label}
        title={title ?? label}
        className={cx("px-1.5", className)}
      />
    );
  },
);

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  accessibleName?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

function SegmentedControlInner<T extends string> ({
  label,
  options,
  value,
  onChange,
  className,
  ...props
}: SegmentedControlProps<T>, ref: ForwardedRef<HTMLDivElement>): JSX.Element {
  return (
    <div
      {...props}
      ref={ref}
      role="group"
      aria-label={label}
      className={cx("inline-flex min-w-0 rounded-control bg-ui-canvas p-0.5", className)}
    >
      {options.map((option) => (
        <ControlButton
          key={option.value}
          aria-label={option.accessibleName}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cx(
            "border-0 bg-transparent",
            option.value === value && "bg-ui-primary text-white",
          )}
        >
          {option.label}
        </ControlButton>
      ))}
    </div>
  );
}

export const SegmentedControl = forwardRef(SegmentedControlInner) as
  <T extends string>(
    props: SegmentedControlProps<T> & RefAttributes<HTMLDivElement>,
  ) => JSX.Element;

export const VisuallyHidden = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function VisuallyHidden ({ className, ...props }, ref) {
    return <span ref={ref} className={cx("sr-only", className)} {...props} />;
  },
);

export interface BoundedPageWindow {
  page: number;
  pageCount: number;
  pageSize: number;
  start: number;
  end: number;
  totalItems: number;
}

export function getBoundedPageWindow (
  totalItems: number,
  requestedPage: number,
  pageSize: number,
): BoundedPageWindow {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new RangeError("pageSize must be an integer from 1 through 50");
  }
  const total = Number.isFinite(totalItems)
    ? Math.max(0, Math.floor(totalItems))
    : 0;
  if (total === 0) {
    return { page: 0, pageCount: 0, pageSize, start: 0, end: 0, totalItems: 0 };
  }
  const pageCount = Math.ceil(total / pageSize);
  const wanted = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
  const page = Math.min(pageCount, Math.max(1, wanted));
  const start = (page - 1) * pageSize;
  return {
    page,
    pageCount,
    pageSize,
    start,
    end: Math.min(total, start + pageSize),
    totalItems: total,
  };
}

export type CollectionIdentityPart =
  | string
  | number
  | boolean
  | null
  | undefined;

function collectionIdentityKey (identity: readonly CollectionIdentityPart[]): string {
  return JSON.stringify(identity.map((part) => {
    if (part === null) return ["null"];
    if (part === undefined) return ["undefined"];
    if (typeof part === "number") {
      if (Number.isNaN(part)) return ["number", "NaN"];
      if (Object.is(part, -0)) return ["number", "-0"];
      return ["number", String(part)];
    }
    return [typeof part, part];
  }));
}

export interface UseBoundedPageOptions {
  identity: readonly CollectionIdentityPart[];
  totalItems: number;
  pageSize?: number;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
}

interface BoundedPageMemoryValue {
  pages: Readonly<Record<string, number>>;
  setPage: (key: string, page: number) => void;
}

const BoundedPageMemoryContext = createContext<BoundedPageMemoryValue | null>(null);

export function BoundedPageMemoryProvider ({
  pages,
  onPageChange,
  children,
}: {
  pages: Readonly<Record<string, number>>;
  onPageChange: (key: string, page: number) => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <BoundedPageMemoryContext.Provider value={{ pages, setPage: onPageChange }}>
      {children}
    </BoundedPageMemoryContext.Provider>
  );
}

export interface BoundedPageState extends BoundedPageWindow {
  setPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
}

export function useBoundedPage ({
  identity,
  totalItems,
  pageSize = 50,
  page: controlledPage,
  defaultPage = 1,
  onPageChange,
}: UseBoundedPageOptions): BoundedPageState {
  const [internalPage, setInternalPage] = useState(defaultPage);
  const key = collectionIdentityKey(identity);
  const previousKeyRef = useRef(key);
  const identityChanged = previousKeyRef.current !== key;
  const requestedPage = identityChanged ? 1 : (controlledPage ?? internalPage);
  const pageWindow = getBoundedPageWindow(totalItems, requestedPage, pageSize);

  const commitPage = useCallback((nextPage: number) => {
    const next = getBoundedPageWindow(totalItems, nextPage, pageSize).page;
    if (controlledPage === undefined) setInternalPage(next);
    onPageChange?.(next);
  }, [controlledPage, onPageChange, pageSize, totalItems]);

  useEffect(() => {
    if (identityChanged) {
      previousKeyRef.current = key;
      commitPage(totalItems === 0 ? 0 : 1);
      return;
    }
    const current = controlledPage ?? internalPage;
    if (current !== pageWindow.page) commitPage(pageWindow.page);
  }, [
    commitPage,
    controlledPage,
    identityChanged,
    internalPage,
    key,
    pageWindow.page,
    totalItems,
  ]);

  return {
    ...pageWindow,
    setPage: commitPage,
    nextPage: () => commitPage(pageWindow.page + 1),
    previousPage: () => commitPage(pageWindow.page - 1),
  };
}

export function useRememberedBoundedPage (
  memoryKey: string,
  options: UseBoundedPageOptions,
): BoundedPageState {
  const memory = useContext(BoundedPageMemoryContext);
  return useBoundedPage({
    ...options,
    page: memory?.pages[memoryKey] ?? options.page,
    onPageChange: (page) => {
      options.onPageChange?.(page);
      memory?.setPage(memoryKey, page);
    },
  });
}

export interface CollectionPagerProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  collectionLabel: string;
  controlsId?: string;
  page: BoundedPageWindow;
  onPageChange: (page: number) => void;
}

export const CollectionPager = forwardRef<HTMLDivElement, CollectionPagerProps>(
  function CollectionPager ({
    collectionLabel,
    controlsId,
    page,
    onPageChange,
    className,
    ...props
  }, ref) {
    const range = page.totalItems === 0
      ? "0 of 0"
      : (page.start + 1) + "–" + page.end + " of " + page.totalItems;
    return (
      <div
        {...props}
        ref={ref}
        className={cx(
          "flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-ui-muted",
          className,
        )}
      >
        <span>{range}</span>
        <div className="flex items-center gap-1">
          <ControlButton
            aria-label={collectionLabel + ": previous page"}
            aria-controls={controlsId}
            disabled={page.page <= 1}
            onClick={() => onPageChange(page.page - 1)}
            className="px-1.5"
          >
            <ChevronLeftIcon />
            <span>Previous</span>
          </ControlButton>
          <span className="min-w-16 text-center tabular-nums">
            Page {page.page} of {page.pageCount}
          </span>
          <ControlButton
            aria-label={collectionLabel + ": next page"}
            aria-controls={controlsId}
            disabled={page.page === 0 || page.page >= page.pageCount}
            onClick={() => onPageChange(page.page + 1)}
            className="px-1.5"
          >
            <span>Next</span>
            <ChevronRightIcon />
          </ControlButton>
        </div>
      </div>
    );
  },
);
