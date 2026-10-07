import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import type { HistoryEntry } from "./api";
import { BoundedChoiceDialog } from "./dialog";
import { ControlButton } from "./ui";

export interface HistoryReviewStationProps {
  entries: readonly HistoryEntry[];
  scopeKeyValue: string;
  repoId: string;
  pageStart: number;
  fetchedCount: number;
  hydrating: boolean;
  onSelectionIntent?: () => void;
  onStatus: (message: string) => void;
  renderInspected: (entry: HistoryEntry, occurrenceKey: string) => ReactNode;
}

// App keys this station by scope, repository and outer page start.
export function HistoryReviewStation ({
  entries,
  scopeKeyValue,
  repoId,
  pageStart,
  fetchedCount,
  hydrating,
  onSelectionIntent,
  onStatus,
  renderInspected,
}: HistoryReviewStationProps): JSX.Element {
  const [selectedKey, setSelectedKey] = useState("");
  const contextKey = JSON.stringify(["history-review-page", scopeKeyValue, repoId, pageStart]);
  const choices = entries.map((entry, index) => ({
    id: JSON.stringify([
      "history-review-commit", scopeKeyValue, repoId, pageStart + index, entry.commit.hash,
    ]),
    label: `Commit ${index + 1}: ${entry.commit.hash.slice(0, 10) || "(empty ID)"}`,
    description: `Message: ${entry.commit.message || "(empty captured message)"} | Full ID: ${entry.commit.hash || "(empty captured ID)"} | Captured: ${entry.commit.ts}`,
  }));
  const rememberedIndex = choices.findIndex((choice) => choice.id === selectedKey);
  const selectedIndex = rememberedIndex >= 0 ? rememberedIndex : entries.length > 0 ? 0 : -1;
  const selectedEntry = selectedIndex >= 0 ? entries[selectedIndex] : null;
  const selectedChoice = selectedIndex >= 0 ? choices[selectedIndex] : null;

  const selectCommit = (choiceId: string): void => {
    const index = choices.findIndex((choice) => choice.id === choiceId);
    if (index < 0) return;
    onSelectionIntent?.();
    setSelectedKey(choiceId);
    if (index !== selectedIndex) {
      onStatus(`Inspecting captured commit ${index + 1} of ${entries.length} on this History page in ${repoId}.`);
    }
  };

  const captureChooserIntent = (event: MouseEvent<HTMLDivElement>): void => {
    const wrapper = event.currentTarget;
    const view = wrapper.ownerDocument.defaultView;
    if (!view || !wrapper.isConnected || !(event.target instanceof view.Element)
        || !wrapper.contains(event.target)) return;
    const trigger = event.target.closest("button[aria-haspopup='dialog']");
    if (!(trigger instanceof view.HTMLButtonElement) || !wrapper.contains(trigger)
        || trigger.disabled || trigger.getAttribute("aria-expanded") !== "false"
        || trigger.closest("[inert], [hidden]")) return;
    onSelectionIntent?.();
  };

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-control border border-ui-border bg-ui-surface p-4">
        <div className="min-w-0">
          <p className="text-base font-semibold text-ui-text">Review captured commits</p>
          <p className="text-sm text-ui-muted">
            {selectedEntry ? (
              <>Commit <span className="font-mono tabular-nums">{selectedIndex + 1}</span> of{" "}
                <span className="font-mono tabular-nums">{entries.length}</span> on this page.{" "}</>
            ) : (
              <>No fetched commit is available on this page{hydrating ? " yet" : ""}.{" "}</>
            )}
            <span className="font-mono tabular-nums">{fetchedCount}</span> captured commits fetched.
            {selectedEntry && (
              <> Linked captured events:{" "}
                <span className="font-mono tabular-nums">{selectedEntry.events.length}</span>.</>
            )}
          </p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <div className="min-w-0 max-w-full" onClickCapture={captureChooserIntent}>
            <BoundedChoiceDialog
              title="Choose a commit on this History page"
              description="Search only this page's fetched commits by captured message, full ID or timestamp."
              fieldLabel="Search commits on this page"
              collectionLabel="Commits on this History page"
              choices={choices}
              value={selectedChoice?.id ?? ""}
              onChange={selectCommit}
              contextKey={contextKey}
              placeholder="Choose a commit on this page"
              disabled={entries.length === 0}
              disabledReason={entries.length === 0
                ? hydrating ? "This History page is still loading." : "No fetched commits are on this page."
                : undefined}
              triggerClassName="min-h-11 text-sm"
            />
          </div>
          <ControlButton className="min-h-11" disabled={selectedIndex <= 0}
            aria-label="Previous commit on this History page"
            onClick={() => selectCommit(choices[selectedIndex - 1]?.id ?? "")}>
            Previous commit
          </ControlButton>
          <ControlButton className="min-h-11"
            disabled={selectedIndex < 0 || selectedIndex >= entries.length - 1}
            aria-label="Next commit on this History page"
            onClick={() => selectCommit(choices[selectedIndex + 1]?.id ?? "")}>
            Next commit
          </ControlButton>
        </div>
      </div>
      {hydrating && (
        <p className="text-sm text-ui-muted">
          {entries.length === 0
            ? "This History page is still loading. Its fetched commits will appear here."
            : "History is still loading. You can inspect the fetched commits on this page."}
        </p>
      )}
      {selectedEntry && selectedChoice && renderInspected(selectedEntry, selectedChoice.id)}
    </>
  );
}
