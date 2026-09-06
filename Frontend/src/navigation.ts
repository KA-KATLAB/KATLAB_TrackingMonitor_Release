export const VIEW_VALUES = [
  "changes",
  "overview",
  "history",
  "city",
  "chronicle",
] as const;

export type View = typeof VIEW_VALUES[number];

export type Scope =
  | { kind: "all" }
  | { kind: "repo"; id: string };

export interface AppRoute {
  view: View;
  scope: Scope;
}

export interface ParsedRoute {
  route: AppRoute;
  needsCanonicalReplace: boolean;
}

export const DEFAULT_ROUTE: AppRoute = {
  view: "changes",
  scope: { kind: "all" },
};

const REPO_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const VIEW_SET = new Set<string>(VIEW_VALUES);

export function isView (value: string): value is View {
  return VIEW_SET.has(value);
}

export function isLegalRepoId (value: string): boolean {
  return REPO_ID_PATTERN.test(value);
}

export function scopeEquals (left: Scope, right: Scope): boolean {
  return left.kind === right.kind
    && (left.kind === "all" || (right.kind === "repo" && left.id === right.id));
}

export function routeEquals (left: AppRoute, right: AppRoute): boolean {
  return left.view === right.view && scopeEquals(left.scope, right.scope);
}

export function scopeApiId (scope: Scope): string | undefined {
  return scope.kind === "repo" ? scope.id : undefined;
}

export function scopeKey (scope: Scope): string {
  return scope.kind === "all" ? "all" : `repo:${scope.id}`;
}

export function scopeLabel (scope: Scope): string {
  return scope.kind === "all" ? "All repos" : scope.id;
}

export function scopeAccessibleName (scope: Scope): string {
  return scope.kind === "all" ? "Scope: all repos" : `Scope: repo ${scope.id}`;
}

export function scopeFileToken (scope: Scope): string {
  if (scope.kind === "all") return "all-repos";
  // Percent-encoding keeps distinct repo ids distinct while removing Windows
  // filename separators/reserved characters. encodeURIComponent leaves '*'.
  const encoded = encodeURIComponent(scope.id).replace(/\*/g, "%2A");
  return `repo-${encoded}`;
}

export function parseRouteSearch (search: string): ParsedRoute {
  const params = new URLSearchParams(search);
  const viewValues = params.getAll("view");
  const repoValues = params.getAll("repo");
  const view: View = viewValues.length === 1 && isView(viewValues[0])
    ? viewValues[0]
    : "changes";
  const scope: Scope = repoValues.length === 1 && isLegalRepoId(repoValues[0])
    ? { kind: "repo", id: repoValues[0] }
    : { kind: "all" };
  const route = { view, scope };
  return {
    route,
    needsCanonicalReplace: params.toString() !== formatRouteSearch(route),
  };
}

export function formatRouteSearch (route: AppRoute): string {
  const params = new URLSearchParams();
  if (route.view !== "changes") params.set("view", route.view);
  if (route.scope.kind === "repo") params.set("repo", route.scope.id);
  return params.toString();
}

export function formatRouteUrl (
  route: AppRoute,
  pathname: string,
  hash = "",
): string {
  const search = formatRouteSearch(route);
  return pathname + (search ? `?${search}` : "") + hash;
}

export function repairRouteMembership (
  route: AppRoute,
  repoIds: ReadonlySet<string>,
): AppRoute {
  if (route.scope.kind === "repo" && !repoIds.has(route.scope.id)) {
    return { ...route, scope: { kind: "all" } };
  }
  return route;
}
