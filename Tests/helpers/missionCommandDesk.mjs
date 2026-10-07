import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(fileURLToPath(new URL("../../Frontend/package.json", import.meta.url)));
const ts = require("typescript");
const sha = value => createHash("sha256").update(value).digest("hex");
const SOURCES = {
  "Frontend/src/App.tsx": {
    "baselineRaw": "945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e",
    "baselineLF": "c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a",
    "reviewedLF": "b98cfe4b7322d489149450bee7a07f732ff15e1e534d122caa6af72b52be8684",
    "nativeEol": "\r\n",
    "windows": [
      {
        "name": "add dedicated route-focus cancellation callback",
        "before": "  const consumeInitialDayScopeAction = useCallback(() => {\n",
        "after": "  const cancelMissionRouteFocus = useCallback(() => {\n    flushSync(() => setRouteFocusRequest(null));\n  }, []);\n\n  const consumeInitialDayScopeAction = useCallback(() => {\n",
        "count": 1
      },
      {
        "name": "wire actual sole LazyMissionView caller",
        "before": "                <LazyMissionView scope={scopeApiId(scope)} invalidationNonce={missionNonce}\n                  entryState={missionUi} onEntryStateChange={setMissionUi}\n                  onStatus={announceStatus} />\n",
        "after": "                <LazyMissionView scope={scopeApiId(scope)} invalidationNonce={missionNonce}\n                  entryState={missionUi} onEntryStateChange={setMissionUi}\n                  onSectionNavigation={cancelMissionRouteFocus}\n                  onStatus={announceStatus} />\n",
        "count": 1
      }
    ]
  },
  "Frontend/src/MissionView.tsx": {
    "baselineRaw": "aa13ef82e543e58e2762568e0b1d430ef2622c0ab3f95aa5433edb5fb1a7bdab",
    "baselineLF": "b2ebe76aa6ab6527dcf21bd90ad67d718f29ff8521a137262cfa4309c17be622",
    "reviewedLF": "72646e387b14c714ec2c8a2e2dad2da84385358a8f1e9ac2f7a18bb996bcd57c",
    "nativeEol": "\r\n",
    "windows": [
      {
        "name": "add Mission-lazy component import",
        "before": "import { runAssignmentRequest } from \"./assignmentRequest\";\n",
        "after": "import { runAssignmentRequest } from \"./assignmentRequest\";\nimport { MissionCommandDesk } from \"./missionCommandDesk\";\n",
        "count": 1
      },
      {
        "name": "add optional presentation-only prop",
        "before": "export interface MissionViewProps {\n  scope: string | undefined;\n  invalidationNonce: number;\n  entryState: MissionEntryState;\n  onEntryStateChange: (state: MissionEntryState) => void;\n  onStatus: (message: string) => void;\n}\n",
        "after": "export interface MissionViewProps {\n  scope: string | undefined;\n  invalidationNonce: number;\n  entryState: MissionEntryState;\n  onEntryStateChange: (state: MissionEntryState) => void;\n  onStatus: (message: string) => void;\n  onSectionNavigation?: () => void;\n}\n",
        "count": 1
      },
      {
        "name": "destructure optional callback",
        "before": "export function MissionView ({ scope, invalidationNonce, entryState,\n  onEntryStateChange, onStatus }: MissionViewProps): JSX.Element {\n",
        "after": "export function MissionView ({ scope, invalidationNonce, entryState,\n  onEntryStateChange, onStatus, onSectionNavigation }: MissionViewProps): JSX.Element {\n",
        "count": 1
      },
      {
        "name": "focusable existing Attribution forecast heading",
        "before": "      <SectionHeading title=\"Attribution forecast\" level={3}\n",
        "after": "      <SectionHeading title=\"Attribution forecast\" level={3}\n        headingId=\"mission-forecast-heading\" headingProps={{ tabIndex: -1 }}\n",
        "count": 1
      },
      {
        "name": "focusable existing Now heading",
        "before": "        <SectionHeading title=\"Now\" level={3}\n",
        "after": "        <SectionHeading title=\"Now\" level={3}\n          headingId=\"mission-now-heading\" headingProps={{ tabIndex: -1 }}\n",
        "count": 1
      },
      {
        "name": "focusable existing Plan scope heading",
        "before": "          <SectionHeading title=\"Plan scope\" level={3}\n",
        "after": "          <SectionHeading title=\"Plan scope\" level={3}\n            headingId=\"mission-plans-heading\" headingProps={{ tabIndex: -1 }}\n",
        "count": 1
      },
      {
        "name": "focusable existing Verification rail heading",
        "before": "        <SectionHeading title=\"Verification rail\" level={3}\n",
        "after": "        <SectionHeading title=\"Verification rail\" level={3}\n          headingId=\"mission-verification-heading\" headingProps={{ tabIndex: -1 }}\n",
        "count": 1
      },
      {
        "name": "focusable existing Evidence queue heading",
        "before": "        <SectionHeading title=\"Evidence queue\" level={3}\n",
        "after": "        <SectionHeading title=\"Evidence queue\" level={3}\n          headingId=\"mission-evidence-heading\" headingProps={{ tabIndex: -1 }}\n",
        "count": 1
      },
      {
        "name": "focusable existing Session flight recorder heading",
        "before": "        <SectionHeading title=\"Session flight recorder\" level={3}\n",
        "after": "        <SectionHeading title=\"Session flight recorder\" level={3}\n          headingId=\"mission-flight-heading\" headingProps={{ tabIndex: -1 }}\n",
        "count": 1
      },
      {
        "name": "focusable existing selected Now heading",
        "before": "      <SectionHeading\n        title={<span className=\"inline-flex items-center gap-2\"><MissionIcon /> Now</span>}\n",
        "after": "      <SectionHeading\n        headingId=\"mission-now-heading\" headingProps={{ tabIndex: -1 }}\n        title={<span className=\"inline-flex items-center gap-2\"><MissionIcon /> Now</span>}\n",
        "count": 1
      },
      {
        "name": "wrap all original Now-through-Flight children without blank-line whitespace",
        "before": "      <NowPanel plan={selectedPlan} scope={scope} summary={mission?.summary ?? null}\n        busy={missionBusy} />\n\n      {mission && mission.plans.length > 0 && (\n        <Surface tone=\"quiet\">\n          <SectionHeading title=\"Plan scope\" level={3}\n            headingId=\"mission-plans-heading\" headingProps={{ tabIndex: -1 }}\n            description={`${mission.plans.length} tracked plans in this scope. Choose an exact repository + plan pair; ambiguous scopes are never guessed.`} />\n          <div id=\"mission-plan-cards\" className=\"grid min-w-0 gap-3 md:grid-cols-2\">\n            {visiblePlans.map((plan) => {\n              const key = planKey(plan.repo, plan.plan_file);\n              return <PlanCard key={key} plan={plan} selected={entryState.planKey === key}\n                onSelect={() => patchEntry({ planKey: key })} />;\n            })}\n          </div>\n          {mission.plans.length > 12 && (\n            <CollectionPager collectionLabel=\"Mission plans\" controlsId=\"mission-plan-cards\"\n              page={planPager} onPageChange={planPager.setPage} className=\"mt-3\" />\n          )}\n        </Surface>\n      )}\n\n      <ForecastPanel result={forecastResult} repoId={forecastRepoId}\n        loading={missionBusy} error={Boolean(missionError)}\n        onRetry={refresh} retryBusy={refreshBusy} />\n\n      <Surface>\n        <SectionHeading title=\"Verification rail\" level={3}\n          headingId=\"mission-verification-heading\" headingProps={{ tabIndex: -1 }}\n          description=\"Current backend-evaluated gate state, freshness, and clean-review streak.\" />\n        {!selectedPlan ? (\n          <p className=\"text-sm text-ui-muted [overflow-wrap:anywhere]\">\n            {missionPlanPrompt(mission?.summary ?? null, scope, missionBusy,\n              \"Select one exact plan to inspect its requirements.\")}\n          </p>\n        ) : selectedPlan.requirements.length === 0 ? (\n          <p className=\"text-sm text-ui-muted\">This plan declares no verification requirements.</p>\n        ) : (\n          <div id=\"mission-verification-rail\" className=\"grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3\">\n            {selectedPlan.requirements.slice(\n              verificationPager.start, verificationPager.end,\n            ).map((requirement) => {\n              const state = requirementPresentation(requirement);\n              return (\n                <article key={requirement.check_id}\n                  className={cx(\"min-w-0 rounded-panel border p-3\", TONE_CLASS[state.tone])}>\n                  <div className=\"flex min-w-0 flex-wrap items-start justify-between gap-2\">\n                    <div className=\"min-w-0\">\n                      <h4 className=\"break-words text-base font-semibold\">{requirement.label}</h4>\n                      <p className=\"break-all font-mono text-xs opacity-80\">{requirement.check_id}</p>\n                    </div>\n                    <span className=\"rounded-full border border-current px-2 py-0.5 text-xs font-semibold\">\n                      <span aria-hidden=\"true\">{state.marker} </span>{state.label}\n                    </span>\n                  </div>\n                  <dl className=\"mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs\">\n                    <dt>Outcome</dt><dd className=\"break-words\">{requirement.latest_outcome ?? \"not reported\"}</dd>\n                    <dt>Observed</dt><dd>{requirement.observed_at ? fmtRel(requirement.observed_at) : \"never\"}</dd>\n                    <dt>Fresh after</dt><dd className=\"break-all font-mono\">{fmtTs(requirement.freshness_floor)}</dd>\n                    {state.progress && <><dt>Streak</dt><dd>{state.progress} clean</dd></>}\n                  </dl>\n                </article>\n              );\n            })}\n          </div>\n        )}\n        {selectedPlan && selectedPlan.requirements.length > 50 && (\n          <CollectionPager collectionLabel=\"Verification requirements\"\n            controlsId=\"mission-verification-rail\" page={verificationPager}\n            onPageChange={verificationPager.setPage} className=\"mt-3\" />\n        )}\n      </Surface>\n\n      <Surface>\n        <SectionHeading title=\"Evidence queue\" level={3}\n          headingId=\"mission-evidence-heading\" headingProps={{ tabIndex: -1 }}\n          description=\"Missing or unhealthy requirements plus selected-plan and eligible unassigned evidence from the current bounded ledger page.\"\n          actions={\n            <SegmentedControl<EvidenceFilter>\n              label=\"Evidence filter\"\n              className=\"max-w-full flex-wrap\"\n              value={entryState.evidenceFilter}\n              onChange={(evidenceFilter) => patchEntry({ evidenceFilter })}\n              options={[\n                { value: \"attention\", label: \"Attention\" },\n                { value: \"unassigned\", label: \"Unassigned\" },\n                { value: \"all\", label: \"All\" },\n              ]}\n            />\n          }\n        />\n        {evidenceError && <ErrorNotice message={evidenceError} onRetry={refresh}\n          busy={refreshBusy} />}\n        {!selectedPlan ? (\n          <p className=\"text-sm text-ui-muted [overflow-wrap:anywhere]\">\n            {missionPlanPrompt(mission?.summary ?? null, scope, missionBusy,\n              \"Select a plan to inspect evidence.\")}\n          </p>\n        ) : (\n          <div className=\"grid min-w-0 gap-4 xl:grid-cols-2\">\n            <section className=\"min-w-0\" aria-labelledby=\"mission-requirement-queue-title\">\n              <h4 id=\"mission-requirement-queue-title\" className=\"ui-panel-title mb-3 text-ui-text\">\n                Requirement attention\n              </h4>\n              <div id=\"mission-requirement-queue\" className=\"ui-work-list\">\n                {visibleRequirements.map((requirement) => {\n                  const state = requirementPresentation(requirement);\n                  return (\n                    <div key={requirement.check_id}\n                      className=\"ui-work-row justify-between text-sm\">\n                      <span className=\"min-w-0 flex-1\">\n                        <span className=\"block break-words text-base text-ui-text\">{requirement.label}</span>\n                        <span className=\"block break-all font-mono text-xs text-ui-muted\">{requirement.check_id}</span>\n                      </span>\n                      <span className={cx(\"shrink-0 font-semibold\", TONE_CLASS[state.tone].split(\" \").at(-1))}>\n                        <span aria-hidden=\"true\">{state.marker} </span>{state.label}\n                      </span>\n                    </div>\n                  );\n                })}\n                {visibleRequirements.length === 0 && (\n                  <p className=\"rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted\">\n                    {entryState.evidenceFilter === \"unassigned\"\n                      ? \"Requirement states are hidden by the unassigned-evidence filter.\"\n                      : \"No requirement needs attention.\"}\n                  </p>\n                )}\n              </div>\n              {requirementRows.length > 50 && (\n                <CollectionPager collectionLabel=\"Requirement evidence queue\"\n                  controlsId=\"mission-requirement-queue\" page={requirementPager}\n                  onPageChange={requirementPager.setPage} className=\"mt-3\" />\n              )}\n            </section>\n            <section className=\"min-w-0\" aria-labelledby=\"mission-ledger-queue-title\">\n              <h4 id=\"mission-ledger-queue-title\" className=\"ui-panel-title mb-3 text-ui-text\">\n                Evidence ledger\n              </h4>\n              <div id=\"mission-ledger-queue\" className=\"ui-work-list\">\n                {evidenceRows.map((row) => (\n                  <div key={row.evidence_id}\n                    className=\"ui-work-row items-center justify-between text-sm\">\n                    <div className=\"min-w-0 flex-1\">\n                      <p className=\"break-words text-base text-ui-text\">{activityLabel(row)}</p>\n                      <p className=\"mt-0.5 break-words text-xs text-ui-muted\">\n                        {row.provider} · {fmtTs(row.ts)} · {row.outcome ?? \"outcome not reported\"}\n                      </p>\n                      <p className=\"mt-0.5 break-all font-mono text-xs text-ui-muted\">\n                        {row.effective_assignment.repo && row.effective_assignment.plan_file\n                          ? `${row.effective_assignment.mode}: ${row.effective_assignment.repo} · ${row.effective_assignment.plan_file}`\n                          : \"UNASSIGNED\"}\n                      </p>\n                    </div>\n                    {(eligibleAssignmentPlans(mission?.plans ?? [], row).length > 0\n                      || (row.effective_assignment.repo !== null\n                        && row.assignment_repo_ids.includes(row.effective_assignment.repo)\n                        && row.effective_assignment.mode !== \"UNASSIGNED\"\n                        && row.effective_assignment.mode !== \"NONE\")) && (\n                      <ControlButton onClick={() => setAssignment(row)}>\n                        {row.effective_assignment.mode === \"UNASSIGNED\" ? \"Assign\" : \"Review assignment\"}\n                      </ControlButton>\n                    )}\n                  </div>\n                ))}\n                {evidenceBusy ? (\n                  <p className=\"rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted\"\n                    role=\"status\">Loading evidence ledger...</p>\n                ) : !evidenceError && evidenceRows.length === 0 && (\n                  <p className=\"rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted\">\n                    No matching canonical evidence on this activity page.\n                  </p>\n                )}\n              </div>\n              {!evidenceBusy && evidence.total > 50 && (\n                <CollectionPager collectionLabel=\"Evidence ledger activity\"\n                  controlsId=\"mission-ledger-queue\" page={evidencePager}\n                  onPageChange={evidencePager.setPage} className=\"mt-3\" />\n              )}\n            </section>\n          </div>\n        )}\n      </Surface>\n\n      <Surface>\n        <SectionHeading title=\"Session flight recorder\" level={3}\n          headingId=\"mission-flight-heading\" headingProps={{ tabIndex: -1 }}\n          description=\"Provider + session identity, deterministic time ordering, and explicit session-root lanes.\" />\n        {sessionsError && <ErrorNotice message={sessionsError} onRetry={refresh}\n          busy={refreshBusy} />}\n        <div className=\"grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]\">\n          <section className=\"min-w-0\" aria-labelledby=\"mission-session-list-title\">\n            <h4 id=\"mission-session-list-title\" className=\"ui-panel-title mb-3 text-ui-text\">\n              Sessions\n            </h4>\n            <div id=\"mission-session-list\" className=\"max-h-96 space-y-2 overflow-y-auto pr-1\">\n              {sessions.items.map((session) => (\n                <button key={sessionIdentityKey(session.provider, session.session_id)} type=\"button\"\n                  aria-pressed={sameSession(entryState.session, session)}\n                  onClick={() => patchEntry({\n                    session: { provider: session.provider, sessionId: session.session_id },\n                    cursor: 0,\n                  })}\n                  className={cx(\n                    \"ui-control h-auto w-full min-w-0 flex-col items-start p-3 text-left\",\n                    sameSession(entryState.session, session)\n                      ? \"border-ui-focus bg-sky-950/40\"\n                      : \"bg-ui-canvas\",\n                  )}>\n                  <span className=\"block w-full break-all font-mono text-xs text-ui-text\">\n                    {session.provider} · {session.session_id}\n                  </span>\n                  <span className=\"mt-1 block text-xs text-ui-muted\">\n                    {session.event_count} events · {session.agent_count} agents · {session.repo_count} repos\n                  </span>\n                  <span className=\"mt-0.5 block text-xs text-ui-muted\">\n                    {fmtRel(session.ended_at)} · {session.delivery}\n                  </span>\n                </button>\n              ))}\n              {sessionsBusy ? (\n                <p className=\"rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted\"\n                  role=\"status\">Loading sessions...</p>\n              ) : !sessionsError && sessions.items.length === 0 && (\n                  <p className=\"rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted\">\n                    No provider sessions recorded in this scope.\n                  </p>\n                )}\n            </div>\n            {!sessionsBusy && sessions.total > 50 && (\n              <CollectionPager collectionLabel=\"Flight recorder sessions\"\n                controlsId=\"mission-session-list\" page={sessionPager}\n                onPageChange={sessionPager.setPage} className=\"mt-3\" />\n            )}\n          </section>\n\n          <section className=\"min-w-0\" aria-labelledby=\"mission-timeline-title\">\n            <div className=\"mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2\">\n              <h4 id=\"mission-timeline-title\" className=\"ui-panel-title text-ui-text\">\n                Timeline\n              </h4>\n              {selectedSession && (\n                <span className=\"max-w-full break-all font-mono text-xs text-ui-muted\">\n                  {selectedSession.provider} · {selectedSession.sessionId}\n                </span>\n              )}\n            </div>\n            {timelineError && <ErrorNotice message={timelineError} onRetry={refresh}\n              busy={refreshBusy} />}\n            <div className=\"ui-local-scroller mission-timeline\" role=\"region\"\n              aria-label=\"Visual agent activity timeline\" tabIndex={0}>\n              <div className=\"min-w-[42rem] space-y-2 p-2\">\n                {flight.lanes.map((lane) => (\n                  <div key={lane.id} className=\"grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-3\">\n                    <div className=\"min-w-0\">\n                      <p className=\"truncate text-xs font-semibold text-ui-text\" title={lane.label}>{lane.label}</p>\n                      <p className=\"truncate text-xs text-ui-muted\" title={lane.parent}>{lane.parent}</p>\n                    </div>\n                    <div className=\"relative h-10 rounded-control border border-ui-border bg-ui-canvas\">\n                      <span className=\"absolute left-2 right-2 top-1/2 h-px bg-ui-border\" aria-hidden=\"true\" />\n                      {lane.points.map((point) => (\n                        <button type=\"button\" key={point.row.id}\n                          aria-label={`Activity ${point.index + 1}: ${activityLabel(point.row)}, ${fmtTs(point.row.ts)}`}\n                          aria-pressed={selectedActivity?.id === point.row.id}\n                          title={activityLabel(point.row)}\n                          onClick={() => patchEntry({ cursor: point.index })}\n                          className={cx(\n                            \"mission-timeline-point ui-transition\",\n                            selectedActivity?.id === point.row.id && \"is-selected\",\n                          )}\n                          style={{ \"--mission-x\": `${2 + point.position * 0.96}%` } as CSSProperties}>\n                          <span className=\"sr-only\">{activityLabel(point.row)}</span>\n                        </button>\n                      ))}\n                    </div>\n                  </div>\n                ))}\n                {timelineBusy ? (\n                  <p className=\"p-3 text-sm text-ui-muted\" role=\"status\">Loading session activity...</p>\n                ) : !timelineError && !sessionsError && flight.rows.length === 0 && (\n                  <p className=\"p-3 text-sm text-ui-muted\">Select a recorded session to inspect its activity.</p>\n                )}\n              </div>\n            </div>\n\n            {flight.rows.length > 0 && (\n              <div className=\"mt-3 rounded-panel border border-ui-border bg-ui-canvas/50 p-3\">\n                <div className=\"flex min-w-0 flex-wrap items-center gap-2\">\n                  {!reducedMotion && (\n                    <IconButton label={playing ? \"Pause timeline replay\" : \"Play timeline replay\"}\n                      aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>\n                      {playing ? <PauseIcon /> : <PlayIcon />}\n                    </IconButton>\n                  )}\n                  <label className=\"min-w-[12rem] flex-1 text-xs text-ui-muted\">\n                    Activity {cursor + 1} of {flight.rows.length}\n                    <input type=\"range\" min={0} max={Math.max(0, flight.rows.length - 1)}\n                      value={cursor} onChange={(event) => patchEntry({ cursor: Number(event.target.value) })}\n                      className=\"mt-1 w-full\" />\n                  </label>\n                </div>\n                {selectedActivity && (\n                  <div className=\"mt-3 grid min-w-0 gap-1 text-xs sm:grid-cols-2\">\n                    <p className=\"break-words text-ui-text\">{activityLabel(selectedActivity)}</p>\n                    <p className=\"break-words text-ui-muted\">Actor: {activityActor(selectedActivity)}</p>\n                    <p className=\"break-all text-ui-muted\">Time: {fmtTs(selectedActivity.ts)}</p>\n                    <p className=\"break-words text-ui-muted\">Duration: {formatDuration(selectedActivity.duration_ms)}</p>\n                  </div>\n                )}\n              </div>\n            )}\n\n            {!timelineBusy && timeline.total > 50 && (\n              <CollectionPager collectionLabel=\"Session activity\"\n                controlsId=\"mission-exact-data\" page={timelinePager}\n                onPageChange={timelinePager.setPage} className=\"mt-3\" />\n            )}\n\n            {!timelineBusy && !timelineError && (!sessionsError || flight.rows.length > 0)\n              && <details className=\"mt-3 rounded-panel border border-ui-border\">\n              <summary className=\"ui-control cursor-pointer border-0 bg-ui-raised px-3\">\n                Exact data\n              </summary>\n              <div id=\"mission-exact-data\" className=\"border-t border-ui-border p-2\">\n                <ActivityTable rows={flight.rows} selectedId={selectedActivity?.id ?? null}\n                  onSelect={(index) => patchEntry({ cursor: index })} />\n              </div>\n            </details>}\n          </section>\n        </div>\n      </Surface>\n\n",
        "after": "      <MissionCommandDesk showPlans={Boolean(mission && mission.plans.length > 0)}\n        onSectionNavigation={onSectionNavigation}>\n        <NowPanel plan={selectedPlan} scope={scope} summary={mission?.summary ?? null}\n          busy={missionBusy} />\n\n        {mission && mission.plans.length > 0 && (\n          <Surface tone=\"quiet\">\n            <SectionHeading title=\"Plan scope\" level={3}\n              headingId=\"mission-plans-heading\" headingProps={{ tabIndex: -1 }}\n              description={`${mission.plans.length} tracked plans in this scope. Choose an exact repository + plan pair; ambiguous scopes are never guessed.`} />\n            <div id=\"mission-plan-cards\" className=\"grid min-w-0 gap-3 md:grid-cols-2\">\n              {visiblePlans.map((plan) => {\n                const key = planKey(plan.repo, plan.plan_file);\n                return <PlanCard key={key} plan={plan} selected={entryState.planKey === key}\n                  onSelect={() => patchEntry({ planKey: key })} />;\n              })}\n            </div>\n            {mission.plans.length > 12 && (\n              <CollectionPager collectionLabel=\"Mission plans\" controlsId=\"mission-plan-cards\"\n                page={planPager} onPageChange={planPager.setPage} className=\"mt-3\" />\n            )}\n          </Surface>\n        )}\n\n        <ForecastPanel result={forecastResult} repoId={forecastRepoId}\n          loading={missionBusy} error={Boolean(missionError)}\n          onRetry={refresh} retryBusy={refreshBusy} />\n\n        <Surface>\n          <SectionHeading title=\"Verification rail\" level={3}\n            headingId=\"mission-verification-heading\" headingProps={{ tabIndex: -1 }}\n            description=\"Current backend-evaluated gate state, freshness, and clean-review streak.\" />\n          {!selectedPlan ? (\n            <p className=\"text-sm text-ui-muted [overflow-wrap:anywhere]\">\n              {missionPlanPrompt(mission?.summary ?? null, scope, missionBusy,\n                \"Select one exact plan to inspect its requirements.\")}\n            </p>\n          ) : selectedPlan.requirements.length === 0 ? (\n            <p className=\"text-sm text-ui-muted\">This plan declares no verification requirements.</p>\n          ) : (\n            <div id=\"mission-verification-rail\" className=\"grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3\">\n              {selectedPlan.requirements.slice(\n                verificationPager.start, verificationPager.end,\n              ).map((requirement) => {\n                const state = requirementPresentation(requirement);\n                return (\n                  <article key={requirement.check_id}\n                    className={cx(\"min-w-0 rounded-panel border p-3\", TONE_CLASS[state.tone])}>\n                    <div className=\"flex min-w-0 flex-wrap items-start justify-between gap-2\">\n                      <div className=\"min-w-0\">\n                        <h4 className=\"break-words text-base font-semibold\">{requirement.label}</h4>\n                        <p className=\"break-all font-mono text-xs opacity-80\">{requirement.check_id}</p>\n                      </div>\n                      <span className=\"rounded-full border border-current px-2 py-0.5 text-xs font-semibold\">\n                        <span aria-hidden=\"true\">{state.marker} </span>{state.label}\n                      </span>\n                    </div>\n                    <dl className=\"mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs\">\n                      <dt>Outcome</dt><dd className=\"break-words\">{requirement.latest_outcome ?? \"not reported\"}</dd>\n                      <dt>Observed</dt><dd>{requirement.observed_at ? fmtRel(requirement.observed_at) : \"never\"}</dd>\n                      <dt>Fresh after</dt><dd className=\"break-all font-mono\">{fmtTs(requirement.freshness_floor)}</dd>\n                      {state.progress && <><dt>Streak</dt><dd>{state.progress} clean</dd></>}\n                    </dl>\n                  </article>\n                );\n              })}\n            </div>\n          )}\n          {selectedPlan && selectedPlan.requirements.length > 50 && (\n            <CollectionPager collectionLabel=\"Verification requirements\"\n              controlsId=\"mission-verification-rail\" page={verificationPager}\n              onPageChange={verificationPager.setPage} className=\"mt-3\" />\n          )}\n        </Surface>\n\n        <Surface>\n          <SectionHeading title=\"Evidence queue\" level={3}\n            headingId=\"mission-evidence-heading\" headingProps={{ tabIndex: -1 }}\n            description=\"Missing or unhealthy requirements plus selected-plan and eligible unassigned evidence from the current bounded ledger page.\"\n            actions={\n              <SegmentedControl<EvidenceFilter>\n                label=\"Evidence filter\"\n                className=\"max-w-full flex-wrap\"\n                value={entryState.evidenceFilter}\n                onChange={(evidenceFilter) => patchEntry({ evidenceFilter })}\n                options={[\n                  { value: \"attention\", label: \"Attention\" },\n                  { value: \"unassigned\", label: \"Unassigned\" },\n                  { value: \"all\", label: \"All\" },\n                ]}\n              />\n            }\n          />\n          {evidenceError && <ErrorNotice message={evidenceError} onRetry={refresh}\n            busy={refreshBusy} />}\n          {!selectedPlan ? (\n            <p className=\"text-sm text-ui-muted [overflow-wrap:anywhere]\">\n              {missionPlanPrompt(mission?.summary ?? null, scope, missionBusy,\n                \"Select a plan to inspect evidence.\")}\n            </p>\n          ) : (\n            <div className=\"grid min-w-0 gap-4 xl:grid-cols-2\">\n              <section className=\"min-w-0\" aria-labelledby=\"mission-requirement-queue-title\">\n                <h4 id=\"mission-requirement-queue-title\" className=\"ui-panel-title mb-3 text-ui-text\">\n                  Requirement attention\n                </h4>\n                <div id=\"mission-requirement-queue\" className=\"ui-work-list\">\n                  {visibleRequirements.map((requirement) => {\n                    const state = requirementPresentation(requirement);\n                    return (\n                      <div key={requirement.check_id}\n                        className=\"ui-work-row justify-between text-sm\">\n                        <span className=\"min-w-0 flex-1\">\n                          <span className=\"block break-words text-base text-ui-text\">{requirement.label}</span>\n                          <span className=\"block break-all font-mono text-xs text-ui-muted\">{requirement.check_id}</span>\n                        </span>\n                        <span className={cx(\"shrink-0 font-semibold\", TONE_CLASS[state.tone].split(\" \").at(-1))}>\n                          <span aria-hidden=\"true\">{state.marker} </span>{state.label}\n                        </span>\n                      </div>\n                    );\n                  })}\n                  {visibleRequirements.length === 0 && (\n                    <p className=\"rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted\">\n                      {entryState.evidenceFilter === \"unassigned\"\n                        ? \"Requirement states are hidden by the unassigned-evidence filter.\"\n                        : \"No requirement needs attention.\"}\n                    </p>\n                  )}\n                </div>\n                {requirementRows.length > 50 && (\n                  <CollectionPager collectionLabel=\"Requirement evidence queue\"\n                    controlsId=\"mission-requirement-queue\" page={requirementPager}\n                    onPageChange={requirementPager.setPage} className=\"mt-3\" />\n                )}\n              </section>\n              <section className=\"min-w-0\" aria-labelledby=\"mission-ledger-queue-title\">\n                <h4 id=\"mission-ledger-queue-title\" className=\"ui-panel-title mb-3 text-ui-text\">\n                  Evidence ledger\n                </h4>\n                <div id=\"mission-ledger-queue\" className=\"ui-work-list\">\n                  {evidenceRows.map((row) => (\n                    <div key={row.evidence_id}\n                      className=\"ui-work-row items-center justify-between text-sm\">\n                      <div className=\"min-w-0 flex-1\">\n                        <p className=\"break-words text-base text-ui-text\">{activityLabel(row)}</p>\n                        <p className=\"mt-0.5 break-words text-xs text-ui-muted\">\n                          {row.provider} · {fmtTs(row.ts)} · {row.outcome ?? \"outcome not reported\"}\n                        </p>\n                        <p className=\"mt-0.5 break-all font-mono text-xs text-ui-muted\">\n                          {row.effective_assignment.repo && row.effective_assignment.plan_file\n                            ? `${row.effective_assignment.mode}: ${row.effective_assignment.repo} · ${row.effective_assignment.plan_file}`\n                            : \"UNASSIGNED\"}\n                        </p>\n                      </div>\n                      {(eligibleAssignmentPlans(mission?.plans ?? [], row).length > 0\n                        || (row.effective_assignment.repo !== null\n                          && row.assignment_repo_ids.includes(row.effective_assignment.repo)\n                          && row.effective_assignment.mode !== \"UNASSIGNED\"\n                          && row.effective_assignment.mode !== \"NONE\")) && (\n                        <ControlButton onClick={() => setAssignment(row)}>\n                          {row.effective_assignment.mode === \"UNASSIGNED\" ? \"Assign\" : \"Review assignment\"}\n                        </ControlButton>\n                      )}\n                    </div>\n                  ))}\n                  {evidenceBusy ? (\n                    <p className=\"rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted\"\n                      role=\"status\">Loading evidence ledger...</p>\n                  ) : !evidenceError && evidenceRows.length === 0 && (\n                    <p className=\"rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted\">\n                      No matching canonical evidence on this activity page.\n                    </p>\n                  )}\n                </div>\n                {!evidenceBusy && evidence.total > 50 && (\n                  <CollectionPager collectionLabel=\"Evidence ledger activity\"\n                    controlsId=\"mission-ledger-queue\" page={evidencePager}\n                    onPageChange={evidencePager.setPage} className=\"mt-3\" />\n                )}\n              </section>\n            </div>\n          )}\n        </Surface>\n\n        <Surface>\n          <SectionHeading title=\"Session flight recorder\" level={3}\n            headingId=\"mission-flight-heading\" headingProps={{ tabIndex: -1 }}\n            description=\"Provider + session identity, deterministic time ordering, and explicit session-root lanes.\" />\n          {sessionsError && <ErrorNotice message={sessionsError} onRetry={refresh}\n            busy={refreshBusy} />}\n          <div className=\"grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]\">\n            <section className=\"min-w-0\" aria-labelledby=\"mission-session-list-title\">\n              <h4 id=\"mission-session-list-title\" className=\"ui-panel-title mb-3 text-ui-text\">\n                Sessions\n              </h4>\n              <div id=\"mission-session-list\" className=\"max-h-96 space-y-2 overflow-y-auto pr-1\">\n                {sessions.items.map((session) => (\n                  <button key={sessionIdentityKey(session.provider, session.session_id)} type=\"button\"\n                    aria-pressed={sameSession(entryState.session, session)}\n                    onClick={() => patchEntry({\n                      session: { provider: session.provider, sessionId: session.session_id },\n                      cursor: 0,\n                    })}\n                    className={cx(\n                      \"ui-control h-auto w-full min-w-0 flex-col items-start p-3 text-left\",\n                      sameSession(entryState.session, session)\n                        ? \"border-ui-focus bg-sky-950/40\"\n                        : \"bg-ui-canvas\",\n                    )}>\n                    <span className=\"block w-full break-all font-mono text-xs text-ui-text\">\n                      {session.provider} · {session.session_id}\n                    </span>\n                    <span className=\"mt-1 block text-xs text-ui-muted\">\n                      {session.event_count} events · {session.agent_count} agents · {session.repo_count} repos\n                    </span>\n                    <span className=\"mt-0.5 block text-xs text-ui-muted\">\n                      {fmtRel(session.ended_at)} · {session.delivery}\n                    </span>\n                  </button>\n                ))}\n                {sessionsBusy ? (\n                  <p className=\"rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted\"\n                    role=\"status\">Loading sessions...</p>\n                ) : !sessionsError && sessions.items.length === 0 && (\n                    <p className=\"rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted\">\n                      No provider sessions recorded in this scope.\n                    </p>\n                  )}\n              </div>\n              {!sessionsBusy && sessions.total > 50 && (\n                <CollectionPager collectionLabel=\"Flight recorder sessions\"\n                  controlsId=\"mission-session-list\" page={sessionPager}\n                  onPageChange={sessionPager.setPage} className=\"mt-3\" />\n              )}\n            </section>\n\n            <section className=\"min-w-0\" aria-labelledby=\"mission-timeline-title\">\n              <div className=\"mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2\">\n                <h4 id=\"mission-timeline-title\" className=\"ui-panel-title text-ui-text\">\n                  Timeline\n                </h4>\n                {selectedSession && (\n                  <span className=\"max-w-full break-all font-mono text-xs text-ui-muted\">\n                    {selectedSession.provider} · {selectedSession.sessionId}\n                  </span>\n                )}\n              </div>\n              {timelineError && <ErrorNotice message={timelineError} onRetry={refresh}\n                busy={refreshBusy} />}\n              <div className=\"ui-local-scroller mission-timeline\" role=\"region\"\n                aria-label=\"Visual agent activity timeline\" tabIndex={0}>\n                <div className=\"min-w-[42rem] space-y-2 p-2\">\n                  {flight.lanes.map((lane) => (\n                    <div key={lane.id} className=\"grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-3\">\n                      <div className=\"min-w-0\">\n                        <p className=\"truncate text-xs font-semibold text-ui-text\" title={lane.label}>{lane.label}</p>\n                        <p className=\"truncate text-xs text-ui-muted\" title={lane.parent}>{lane.parent}</p>\n                      </div>\n                      <div className=\"relative h-10 rounded-control border border-ui-border bg-ui-canvas\">\n                        <span className=\"absolute left-2 right-2 top-1/2 h-px bg-ui-border\" aria-hidden=\"true\" />\n                        {lane.points.map((point) => (\n                          <button type=\"button\" key={point.row.id}\n                            aria-label={`Activity ${point.index + 1}: ${activityLabel(point.row)}, ${fmtTs(point.row.ts)}`}\n                            aria-pressed={selectedActivity?.id === point.row.id}\n                            title={activityLabel(point.row)}\n                            onClick={() => patchEntry({ cursor: point.index })}\n                            className={cx(\n                              \"mission-timeline-point ui-transition\",\n                              selectedActivity?.id === point.row.id && \"is-selected\",\n                            )}\n                            style={{ \"--mission-x\": `${2 + point.position * 0.96}%` } as CSSProperties}>\n                            <span className=\"sr-only\">{activityLabel(point.row)}</span>\n                          </button>\n                        ))}\n                      </div>\n                    </div>\n                  ))}\n                  {timelineBusy ? (\n                    <p className=\"p-3 text-sm text-ui-muted\" role=\"status\">Loading session activity...</p>\n                  ) : !timelineError && !sessionsError && flight.rows.length === 0 && (\n                    <p className=\"p-3 text-sm text-ui-muted\">Select a recorded session to inspect its activity.</p>\n                  )}\n                </div>\n              </div>\n\n              {flight.rows.length > 0 && (\n                <div className=\"mt-3 rounded-panel border border-ui-border bg-ui-canvas/50 p-3\">\n                  <div className=\"flex min-w-0 flex-wrap items-center gap-2\">\n                    {!reducedMotion && (\n                      <IconButton label={playing ? \"Pause timeline replay\" : \"Play timeline replay\"}\n                        aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>\n                        {playing ? <PauseIcon /> : <PlayIcon />}\n                      </IconButton>\n                    )}\n                    <label className=\"min-w-[12rem] flex-1 text-xs text-ui-muted\">\n                      Activity {cursor + 1} of {flight.rows.length}\n                      <input type=\"range\" min={0} max={Math.max(0, flight.rows.length - 1)}\n                        value={cursor} onChange={(event) => patchEntry({ cursor: Number(event.target.value) })}\n                        className=\"mt-1 w-full\" />\n                    </label>\n                  </div>\n                  {selectedActivity && (\n                    <div className=\"mt-3 grid min-w-0 gap-1 text-xs sm:grid-cols-2\">\n                      <p className=\"break-words text-ui-text\">{activityLabel(selectedActivity)}</p>\n                      <p className=\"break-words text-ui-muted\">Actor: {activityActor(selectedActivity)}</p>\n                      <p className=\"break-all text-ui-muted\">Time: {fmtTs(selectedActivity.ts)}</p>\n                      <p className=\"break-words text-ui-muted\">Duration: {formatDuration(selectedActivity.duration_ms)}</p>\n                    </div>\n                  )}\n                </div>\n              )}\n\n              {!timelineBusy && timeline.total > 50 && (\n                <CollectionPager collectionLabel=\"Session activity\"\n                  controlsId=\"mission-exact-data\" page={timelinePager}\n                  onPageChange={timelinePager.setPage} className=\"mt-3\" />\n              )}\n\n              {!timelineBusy && !timelineError && (!sessionsError || flight.rows.length > 0)\n                && <details className=\"mt-3 rounded-panel border border-ui-border\">\n                <summary className=\"ui-control cursor-pointer border-0 bg-ui-raised px-3\">\n                  Exact data\n                </summary>\n                <div id=\"mission-exact-data\" className=\"border-t border-ui-border p-2\">\n                  <ActivityTable rows={flight.rows} selectedId={selectedActivity?.id ?? null}\n                    onSelect={(index) => patchEntry({ cursor: index })} />\n                </div>\n              </details>}\n            </section>\n          </div>\n        </Surface>\n      </MissionCommandDesk>\n\n",
        "count": 1
      }
    ]
  }
};
const SUITES = {
  "Tests/test_achievement_gallery.mjs": {
    "baselineRaw": "566b91ea834d43735f01aab2817f6129c10496d1d2772fcd8151d0652739458c",
    "baselineLF": "566b91ea834d43735f01aab2817f6129c10496d1d2772fcd8151d0652739458c",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const bytes = readFileSync(resolve(root, name)); assert.equal(sha(bytes), raw, name + \" RAW\");",
        "after": "    const bytes = deskPreservation(name, readFileSync(resolve(root, name))); assert.equal(sha(bytes), raw, name + \" RAW\");",
        "count": 1
      }
    ]
  },
  "Tests/test_active_plan_gallery.mjs": {
    "baselineRaw": "ffd3c9b18d1ad35ba7dd2875af404ab4ac9638e935c1027d9b5bf1f83ccbf260",
    "baselineLF": "ffd3c9b18d1ad35ba7dd2875af404ab4ac9638e935c1027d9b5bf1f83ccbf260",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const current = read(path); ending(current); assert.equal(sha(current), rawPin, path); assert.equal(sha(lf(current)), lfPin, path);",
        "after": "    const current = deskPreservation(path, read(path)); ending(current); assert.equal(sha(current), rawPin, path); assert.equal(sha(lf(current)), lfPin, path);",
        "count": 1
      }
    ]
  },
  "Tests/test_attribution_station.mjs": {
    "baselineRaw": "531efc1d9e3eed8ccff969a5108983257a79233ee4bfaad9f5e9ed040a368cd1",
    "baselineLF": "531efc1d9e3eed8ccff969a5108983257a79233ee4bfaad9f5e9ed040a368cd1",
    "nativeEol": "\n",
    "calls": 3,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "  if (name === \"Tests/test_workbench_2_0.mjs\") return studioWorkbench(text);\n  if (name === \"Tests/test_changes_review_desk.mjs\") return studioChanges(text);",
        "after": "  if (name === \"Tests/test_workbench_2_0.mjs\") return studioWorkbench(deskPreservation(name, text));\n  if (name === \"Tests/test_changes_review_desk.mjs\") return studioChanges(deskPreservation(name, text));",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const text = read(name); assert.equal(sha(text), raw, name + \" RAW\"); assert.equal(sha(lf(text)), normalized, name + \" LF\");",
        "after": "    const text = deskPreservation(name, read(name)); assert.equal(sha(text), raw, name + \" RAW\"); assert.equal(sha(lf(text)), normalized, name + \" LF\");",
        "count": 1
      }
    ]
  },
  "Tests/test_changes_review_desk.mjs": {
    "baselineRaw": "69cb772a0f77b46ba6940cc8e662609e7be56905e4758c270f86b09bdbdb12bf",
    "baselineLF": "69cb772a0f77b46ba6940cc8e662609e7be56905e4758c270f86b09bdbdb12bf",
    "nativeEol": "\n",
    "calls": 2,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "  if (name === \"Tests/test_workbench_2_0.mjs\") return restoreAttributionWorkbenchSuite(studioWorkbench(text));\n  return text;\n};",
        "after": "  if (name === \"Tests/test_workbench_2_0.mjs\") return restoreAttributionWorkbenchSuite(studioWorkbench(deskPreservation(name, text)));\n  return text;\n};",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const text = read(name); assert.equal(sha(text), raw, name + \" RAW\");",
        "after": "    const text = deskPreservation(name, read(name)); assert.equal(sha(text), raw, name + \" RAW\");",
        "count": 1
      }
    ]
  },
  "Tests/test_chronicle_reader_canvas.mjs": {
    "baselineRaw": "d3f108fc0358a4de6ba1e51dd34deefebf9fd27a9fa696daf59c91d40b1d040b",
    "baselineLF": "d3f108fc0358a4de6ba1e51dd34deefebf9fd27a9fa696daf59c91d40b1d040b",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const value = read(path); assert.equal(sha(value), raw, path); assert.equal(sha(lf(value)), normalized, path);",
        "after": "    const value = deskPreservation(path, read(path)); assert.equal(sha(value), raw, path); assert.equal(sha(lf(value)), normalized, path);",
        "count": 1
      }
    ]
  },
  "Tests/test_diagnostic_studio.mjs": {
    "baselineRaw": "897dfd9d0506182a0df1cb99cbb249285b295db393538a460dd5d5469fd98944",
    "baselineLF": "897dfd9d0506182a0df1cb99cbb249285b295db393538a460dd5d5469fd98944",
    "nativeEol": "\n",
    "calls": 3,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const source = read(spec[1]), [, , restore, bytes, lines, pin, , imported, current] = spec;",
        "after": "    const source = deskPreservation(spec[1], read(spec[1])), [, , restore, bytes, lines, pin, , imported, current] = spec;",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const raw = readFileSync(resolve(root, name)), text = read(name);",
        "after": "    const raw = deskPreservation(name, readFileSync(resolve(root, name))), text = deskPreservation(name, read(name));",
        "count": 1
      }
    ]
  },
  "Tests/test_diff_availability.mjs": {
    "baselineRaw": "11dd036c47e308db4211995d7fe6652f173c756c962da568cd57a98f06f555bc",
    "baselineLF": "11dd036c47e308db4211995d7fe6652f173c756c962da568cd57a98f06f555bc",
    "nativeEol": "\n",
    "calls": 5,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "restoreChangesWorkbench(read(\"App.tsx\"))",
        "after": "restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", read(\"App.tsx\")))",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "  const source = read(\"App.tsx\").replace(/\\r\\n/g, \"\\n\");",
        "after": "  const source = deskPreservation(\"Frontend/src/App.tsx\", read(\"App.tsx\")).replace(/\\r\\n/g, \"\\n\");",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "  const source = read(\"App.tsx\");",
        "after": "  const source = deskPreservation(\"Frontend/src/App.tsx\", read(\"App.tsx\"));",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "  const currentLF = readFileSync(fileURLToPath(import.meta.url), \"utf8\").replace(/\\r\\n/g, \"\\n\");",
        "after": "  const currentLF = deskPreservation(\"Tests/test_diff_availability.mjs\", readFileSync(fileURLToPath(import.meta.url), \"utf8\")).replace(/\\r\\n/g, \"\\n\");",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "restoreChangesWorkbenchOracleAdapters(\"test_history_graph_read_states.mjs\", readFileSync(resolve(root, \"Tests/test_history_graph_read_states.mjs\"), \"utf8\"))",
        "after": "restoreChangesWorkbenchOracleAdapters(\"test_history_graph_read_states.mjs\", deskPreservation(\"Tests/test_history_graph_read_states.mjs\", readFileSync(resolve(root, \"Tests/test_history_graph_read_states.mjs\"), \"utf8\")))",
        "count": 1
      }
    ]
  },
  "Tests/test_git_graph_merge_seed.mjs": {
    "baselineRaw": "b96152392094e68d39e35de42a8e968ba89e42ea7ca6ebf6f91e26d995c21f75",
    "baselineLF": "b96152392094e68d39e35de42a8e968ba89e42ea7ca6ebf6f91e26d995c21f75",
    "nativeEol": "\n",
    "calls": 4,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "const appSource = restoreChangesWorkbench(read(\"Frontend/src/App.tsx\"));",
        "after": "const appSource = restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", read(\"Frontend/src/App.tsx\")));",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "restoreChangesWorkbenchOracleAdapters(name, read(`Tests/${name}`))",
        "after": "restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, read(`Tests/${name}`)))",
        "count": 2
      },
      {
        "name": "project only reviewed preservation input",
        "before": "  const prefix = Buffer.from(lf(read(\"Tests/test_diff_availability.mjs\"))).subarray(0, 15449);",
        "after": "  const prefix = Buffer.from(lf(deskPreservation(\"Tests/test_diff_availability.mjs\", read(\"Tests/test_diff_availability.mjs\")))).subarray(0, 15449);",
        "count": 1
      }
    ]
  },
  "Tests/test_history_commit_ledger.mjs": {
    "baselineRaw": "66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75",
    "baselineLF": "66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const text = read(name); ending(text); assert.equal(sha(text), rawPin, name); assert.equal(sha(lf(text)), lfPin, name);",
        "after": "    const text = deskPreservation(name, read(name)); ending(text); assert.equal(sha(text), rawPin, name); assert.equal(sha(lf(text)), lfPin, name);",
        "count": 1
      }
    ]
  },
  "Tests/test_history_graph_read_states.mjs": {
    "baselineRaw": "07469e5b16d08c074500fa84b4f969d3fa77ac1b47f91c72e87162439021c4bb",
    "baselineLF": "07469e5b16d08c074500fa84b4f969d3fa77ac1b47f91c72e87162439021c4bb",
    "nativeEol": "\n",
    "calls": 5,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "  const lf = source.replace(/\\r\\n/g, \"\\n\");\n  checkPreservation(lf);",
        "after": "  const lf = deskPreservation(\"Frontend/src/App.tsx\", source).replace(/\\r\\n/g, \"\\n\");\n  checkPreservation(lf);",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "checkPreservation(replaceOnce(source, gate",
        "after": "checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", source), gate",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "checkPreservation(replaceOnce(source, owner",
        "after": "checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", source), owner",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "checkPreservation(replaceOnce(source,\n    \"Explore commit history and its linked captured events.\"",
        "after": "checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", source),\n    \"Explore commit history and its linked captured events.\"",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "checkPreservation(replaceOnce(source, oldGraph",
        "after": "checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", source), oldGraph",
        "count": 1
      }
    ]
  },
  "Tests/test_mission_control_workbench.mjs": {
    "baselineRaw": "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3",
    "baselineLF": "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3",
    "nativeEol": "\n",
    "calls": 6,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const current = lf(appSource).replace(/\\n/g, eol), restored = restoreChangesWorkbench(current);",
        "after": "    const current = lf(deskPreservation(\"Frontend/src/App.tsx\", appSource)).replace(/\\n/g, eol), restored = restoreChangesWorkbench(current);",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "  const source = lf(appSource), actualOwner = owner(parse(source), \"ChangesView\");",
        "after": "  const source = lf(deskPreservation(\"Frontend/src/App.tsx\", appSource)), actualOwner = owner(parse(source), \"ChangesView\");",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const source = lf(appSource).replace(/\\n/g, eol), modified = replaceOnce(source, before, after);",
        "after": "    const source = lf(deskPreservation(\"Frontend/src/App.tsx\", appSource)).replace(/\\n/g, eol), modified = replaceOnce(source, before, after);",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "lf(read(`Tests/${name}`))",
        "after": "lf(deskPreservation(`Tests/${name}`, read(`Tests/${name}`)))",
        "count": 2
      },
      {
        "name": "project only reviewed preservation input",
        "before": "  const prefix = Buffer.from(lf(read(\"Tests/test_diff_availability.mjs\"))).subarray(0, 15449);",
        "after": "  const prefix = Buffer.from(lf(deskPreservation(\"Tests/test_diff_availability.mjs\", read(\"Tests/test_diff_availability.mjs\")))).subarray(0, 15449);",
        "count": 1
      }
    ]
  },
  "Tests/test_mission_owner_retirement.mjs": {
    "baselineRaw": "9adaf72a29ba6e582d7a0fe0227863e4efbbb38d19ecdf8cc07293881231ca1f",
    "baselineLF": "9adaf72a29ba6e582d7a0fe0227863e4efbbb38d19ecdf8cc07293881231ca1f",
    "nativeEol": "\n",
    "calls": 2,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "  const current = read(\"MissionView.tsx\").replace(/\\r\\n/g, \"\\n\");",
        "after": "  const current = deskPreservation(\"Frontend/src/MissionView.tsx\", read(\"MissionView.tsx\")).replace(/\\r\\n/g, \"\\n\");",
        "count": 2
      }
    ]
  },
  "Tests/test_mission_plan_gallery.mjs": {
    "baselineRaw": "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138",
    "baselineLF": "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const raw = read(name); ending(raw);",
        "after": "    const raw = deskPreservation(name, read(name)); ending(raw);",
        "count": 1
      }
    ]
  },
  "Tests/test_mission_plan_snapshot.mjs": {
    "baselineRaw": "03c937081caaeb713761b9f643c59a41c8490c26beab26abde3234c69d8137a3",
    "baselineLF": "03c937081caaeb713761b9f643c59a41c8490c26beab26abde3234c69d8137a3",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "restoreMissionOwnerRetirement(read(\"MissionView.tsx\"))",
        "after": "restoreMissionOwnerRetirement(deskPreservation(\"Frontend/src/MissionView.tsx\", read(\"MissionView.tsx\")))",
        "count": 1
      }
    ]
  },
  "Tests/test_momentum_comparison_deck.mjs": {
    "baselineRaw": "e7ea2bc5ced58860057a87c37b62756b4f018dcd4d703d0efaf1ae3c2a5ef5d9",
    "baselineLF": "e7ea2bc5ced58860057a87c37b62756b4f018dcd4d703d0efaf1ae3c2a5ef5d9",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const bytes = readFileSync(resolve(root, path)); assert.equal(sha(bytes), raw, path + \" RAW\");",
        "after": "    const bytes = deskPreservation(path, readFileSync(resolve(root, path))); assert.equal(sha(bytes), raw, path + \" RAW\");",
        "count": 1
      }
    ]
  },
  "Tests/test_overview_operations_deck.mjs": {
    "baselineRaw": "4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9",
    "baselineLF": "4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const original = read(`Tests/${name}`); ending(original);",
        "after": "    const original = deskPreservation(`Tests/${name}`, read(`Tests/${name}`)); ending(original);",
        "count": 1
      }
    ]
  },
  "Tests/test_personal_records_showcase.mjs": {
    "baselineRaw": "7c02d2daffa142b1a38722a18ff6067ac7739af2325237df5eaf28fbe070d537",
    "baselineLF": "7c02d2daffa142b1a38722a18ff6067ac7739af2325237df5eaf28fbe070d537",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const bytes = readFileSync(resolve(root, path)); assert.equal(sha(bytes), raw, path + \" RAW\");",
        "after": "    const bytes = deskPreservation(path, readFileSync(resolve(root, path))); assert.equal(sha(bytes), raw, path + \" RAW\");",
        "count": 1
      }
    ]
  },
  "Tests/test_provenance_evidence_desk.mjs": {
    "baselineRaw": "67a772a9db45416cdca44e68c66c50c36bb13484566e351e3c56a0325ebe82c2",
    "baselineLF": "67a772a9db45416cdca44e68c66c50c36bb13484566e351e3c56a0325ebe82c2",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const value = read(name); assert.equal(sha(value), raw, name + \" RAW\"); assert.equal(sha(lf(value)), normalized, name + \" LF\");",
        "after": "    const value = deskPreservation(name, read(name)); assert.equal(sha(value), raw, name + \" RAW\"); assert.equal(sha(lf(value)), normalized, name + \" LF\");",
        "count": 1
      }
    ]
  },
  "Tests/test_repository_profile.mjs": {
    "baselineRaw": "4759cac6ca1d8e3a6881cc29bcb4d8a9f6f466704967da51e3eb19bcf32dec3e",
    "baselineLF": "4759cac6ca1d8e3a6881cc29bcb4d8a9f6f466704967da51e3eb19bcf32dec3e",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const bytes = readFileSync(resolve(root, name));",
        "after": "    const bytes = deskPreservation(name, readFileSync(resolve(root, name)));",
        "count": 1
      }
    ]
  },
  "Tests/test_repository_scope_picker.mjs": {
    "baselineRaw": "e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d",
    "baselineLF": "e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const current = read(path); ending(current); assert.equal(sha(current), rawPin, path); assert.equal(sha(lf(current)), lfPin, path);",
        "after": "    const current = deskPreservation(path, read(path)); ending(current); assert.equal(sha(current), rawPin, path); assert.equal(sha(lf(current)), lfPin, path);",
        "count": 1
      }
    ]
  },
  "Tests/test_system_snapshot_panels.mjs": {
    "baselineRaw": "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65",
    "baselineLF": "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const text = read(name); ending(text);",
        "after": "    const text = deskPreservation(name, read(name)); ending(text);",
        "count": 1
      }
    ]
  },
  "Tests/test_warning_timestamp_order.mjs": {
    "baselineRaw": "5431fea22e69707c5f64323b931311bdf7e38a06d5ea5f7aade014a12a743c5c",
    "baselineLF": "5431fea22e69707c5f64323b931311bdf7e38a06d5ea5f7aade014a12a743c5c",
    "nativeEol": "\n",
    "calls": 5,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "restoreChangesWorkbench(source)",
        "after": "restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", source))",
        "count": 3
      },
      {
        "name": "project only reviewed preservation input",
        "before": "restoreChangesWorkbenchOracleAdapters(name, readFileSync(resolve(root, \"Tests\", name), \"utf8\"))",
        "after": "restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, readFileSync(resolve(root, \"Tests\", name), \"utf8\")))",
        "count": 2
      }
    ]
  },
  "Tests/test_workbench_2_0.mjs": {
    "baselineRaw": "8dc66c7913ecdfac540696f82c7c8cda115445d4148547c0b2afe356d105b41b",
    "baselineLF": "8dc66c7913ecdfac540696f82c7c8cda115445d4148547c0b2afe356d105b41b",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const current = read(name); ending(current); assert.equal(sha(current), rawPin, name); assert.equal(sha(lf(current)), lfPin, name);",
        "after": "    const current = deskPreservation(name, read(name)); ending(current); assert.equal(sha(current), rawPin, name); assert.equal(sha(lf(current)), lfPin, name);",
        "count": 1
      }
    ]
  },
  "Tests/test_workspace_command_frame.mjs": {
    "baselineRaw": "c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247",
    "baselineLF": "c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247",
    "nativeEol": "\n",
    "calls": 1,
    "windows": [
      {
        "name": "import strict presentation-only preservation projection",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "project only reviewed preservation input",
        "before": "    const text = read(name); ending(text); assert.equal(sha(text), rawPin, name); assert.equal(sha(lf(text)), lfPin, name);",
        "after": "    const text = deskPreservation(name, read(name)); ending(text); assert.equal(sha(text), rawPin, name); assert.equal(sha(lf(text)), lfPin, name);",
        "count": 1
      }
    ]
  },
  "Tests/test_release_identity.mjs": {
    "baselineRaw": "60cf57a80045e6c7a77ec9ec9c8c10ce0ffde38d2acb77819f7a626925f8dfa2",
    "baselineLF": "60cf57a80045e6c7a77ec9ec9c8c10ce0ffde38d2acb77819f7a626925f8dfa2",
    "nativeEol": "\n",
    "calls": 4,
    "windows": [
      {
        "name": "bounded first import",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "positive pre-render preservation only",
        "before": "baselineHash(text)",
        "after": "baselineHash(deskPreservation(\"Frontend/src/App.tsx\", text))",
        "count": 1
      },
      {
        "name": "captured pre-presence preservation only",
        "before": "restorePresenceEffects(appText)",
        "after": "restorePresenceEffects(deskPreservation(\"Frontend/src/App.tsx\", appText))",
        "count": 1
      },
      {
        "name": "original negative fixtures project before mutation",
        "before": "baselineHash(appText.replace(",
        "after": "baselineHash(deskPreservation(\"Frontend/src/App.tsx\", appText).replace(",
        "count": 2
      }
    ]
  }
};

// This strict presentation inverse is never a runtime or general source reader.
const positiveCache = new Map();
function pathKey (path) {
  assert.equal(typeof path, "string", "relative preservation path");
  assert.match(path, /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/, "relative ASCII repository components");
  assert.ok(!path.split("/").some(component => component === "." || component === ".."), "no traversal");
  return path;
}
function inputText (value) {
  assert.ok(typeof value === "string" || Buffer.isBuffer(value), "string or Buffer preservation input");
  const text = Buffer.isBuffer(value) ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value) : value;
  assert.equal(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.from(text)), text, "lossless UTF-8");
  assert.ok(!text.includes("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  assert.ok(!lf.includes("\r"), "no bare CR");
  assert.equal(text, lf.replace(/\n/g, eol), "one uniform native EOL");
  assert.ok(lf.endsWith("\n") && !lf.endsWith("\n\n"), "single EOF newline");
  assert.doesNotMatch(lf, /[ \t]+$/m, "no trailing whitespace");
  return { text, lf, eol, buffer: Buffer.isBuffer(value) };
}
function syntax (path, text) {
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, "valid current preservation syntax " + path);
  return ast;
}
function nodes (root) {
  const output = [];
  const visit = node => { output.push(node); ts.forEachChild(node, visit); };
  visit(root); return output;
}
function one (all, test, label) {
  const found = all.filter(test); assert.equal(found.length, 1, label); return found[0];
}
function sourceSites (path, ast) {
  const all = nodes(ast);
  if (path === "Frontend/src/App.tsx") {
    const callback = one(all, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.name.text === "cancelMissionRouteFocus", "one actual cancellation callback");
    const init = callback.initializer;
    assert.ok(ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "useCallback");
    assert.equal(init.arguments.length, 2); assert.ok(ts.isArrayLiteralExpression(init.arguments[1]));
    assert.equal(init.arguments[1].elements.length, 0, "stable empty dependency callback");
    const fn = init.arguments[0];
    assert.ok(ts.isArrowFunction(fn) && ts.isBlock(fn.body)); assert.equal(fn.body.statements.length, 1);
    assert.equal(fn.body.statements[0].getText(ast), "flushSync(() => setRouteFocusRequest(null));");
    let owner = callback.parent;
    while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
    assert.equal(owner?.name?.text, "App", "callback belongs to actual App");
    const caller = one(all, node => ts.isJsxSelfClosingElement(node)
      && node.tagName.getText(ast) === "LazyMissionView", "one actual lazy caller");
    const prop = one([...caller.attributes.properties], node => ts.isJsxAttribute(node)
      && node.name.getText(ast) === "onSectionNavigation", "one actual cancellation prop");
    assert.ok(ts.isJsxExpression(prop.initializer));
    assert.equal(prop.initializer.expression?.getText(ast), "cancelMissionRouteFocus");
  } else {
    const imported = one([...ast.statements], node => ts.isImportDeclaration(node)
      && node.moduleSpecifier.text === "./missionCommandDesk", "one actual desk import");
    assert.ok(ts.isNamedImports(imported.importClause?.namedBindings));
    assert.equal(imported.importClause.namedBindings.elements.length, 1);
    assert.equal(imported.importClause.namedBindings.elements[0].name.text, "MissionCommandDesk");
    const view = one([...ast.statements], node => ts.isFunctionDeclaration(node)
      && node.name?.text === "MissionView", "one actual MissionView");
    const desk = one(nodes(view), node => ts.isJsxElement(node)
      && node.openingElement.tagName.getText(ast) === "MissionCommandDesk", "one actual desk wrapper");
    assert.equal(desk.closingElement.tagName.getText(ast), "MissionCommandDesk");
    const ids = all.filter(node => ts.isJsxAttribute(node) && node.name.getText(ast) === "headingId"
      && ts.isStringLiteral(node.initializer)).map(node => node.initializer.text);
    assert.deepEqual(ids.filter(id => id.startsWith("mission-")).sort(),
      ["mission-now-heading", "mission-now-heading", "mission-plans-heading", "mission-forecast-heading",
        "mission-verification-heading", "mission-evidence-heading", "mission-flight-heading"].sort(),
      "seven actual H3 focus sites, exactly two mutually exclusive Now callers");
  }
}
function suiteSites (path, ast, spec) {
  const imported = one([...ast.statements], node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === "./helpers/missionCommandDesk.mjs", "one actual preservation import");
  assert.equal(ast.statements[0], imported, "bounded first import site");
  assert.equal(imported.getText(ast), 'import { deskPreservation } from "./helpers/missionCommandDesk.mjs";');
  const calls = nodes(ast).filter(node => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === "deskPreservation");
  assert.equal(calls.length, spec.calls, "only explicit actual preservation inputs " + path);
  for (const call of calls) assert.equal(call.arguments.length, 2, "path plus current input");
}
function reverse (path, value, spec, source) {
  const input = inputText(value), key = path + ":" + sha(input.lf);
  let restored = positiveCache.get(key);
  if (restored === undefined) {
    if (spec.reviewedLF) assert.equal(sha(input.lf), spec.reviewedLF, "complete approved current source " + path);
    const ast = syntax(path, input.lf);
    if (source) sourceSites(path, ast); else suiteSites(path, ast, spec);
    restored = input.lf;
    for (const window of [...spec.windows].reverse()) {
      assert.equal(restored.split(window.after).length - 1, window.count, "exact inverse window " + window.name + " in " + path);
      restored = restored.split(window.after).join(window.before);
    }
    syntax(path, restored);
    assert.equal(sha(restored), spec.baselineLF, "complete baseline LF after all bounded inverses " + path);
    assert.equal(sha(restored.replace(/\n/g, spec.nativeEol)), spec.baselineRaw, "complete baseline native RAW " + path);
    let replay = restored;
    for (const window of spec.windows) {
      assert.equal(replay.split(window.before).length - 1, window.count, "exact forward window " + window.name + " in " + path);
      replay = replay.split(window.before).join(window.after);
    }
    assert.equal(replay, input.lf, "full current-byte forward replay");
    positiveCache.set(key, restored);
  }
  const physical = restored.replace(/\n/g, input.eol);
  return input.buffer ? Buffer.from(physical, "utf8") : physical;
}
export function restoreMissionCommandDeskSource (path, value) {
  const name = pathKey(path); assert.ok(Object.hasOwn(SOURCES, name), "approved App or Mission source path");
  return reverse(name, value, SOURCES[name], true);
}
export function restoreMissionCommandDeskSuite (path, value) {
  const name = pathKey(path); assert.ok(Object.hasOwn(SUITES, name), "approved coupled suite path");
  return reverse(name, value, SUITES[name], false);
}
export function deskPreservation (path, value) {
  const name = pathKey(path);
  if (Object.hasOwn(SOURCES, name)) return restoreMissionCommandDeskSource(name, value);
  if (Object.hasOwn(SUITES, name)) return restoreMissionCommandDeskSuite(name, value);
  assert.ok(typeof value === "string" || Buffer.isBuffer(value), "string or Buffer preservation input");
  return value;
}
