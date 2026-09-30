import { DialogStatus } from "./dialogStatus";

const pendingMessage = "Waiting for assignment confirmation. Closing may not cancel a submitted change. Refresh Mission to verify before retrying.";

export function AssignmentFeedback ({ busy, error }: {
  busy: boolean;
  error: string;
}): JSX.Element {
  const message = busy ? pendingMessage : error;
  return (
    <>
      <DialogStatus>{message}</DialogStatus>
      {message && (
        <p className={`mt-3 break-words text-sm [overflow-wrap:anywhere] ${busy ? "text-ui-muted" : "text-ui-warning"}`}>
          {message}
        </p>
      )}
    </>
  );
}
