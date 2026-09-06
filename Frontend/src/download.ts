export interface PreparedDownload {
  blob: Blob;
  filename: string;
}

/** Start a browser download synchronously inside the caller's user gesture. */
export function startBlobDownload ({ blob, filename }: PreparedDownload): void {
  let objectUrl = "";
  const anchor = document.createElement("a");
  try {
    objectUrl = URL.createObjectURL(blob);
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  } catch (error) {
    anchor.remove();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/** Request a noopener tab synchronously without exposing window.opener. */
export function requestNoopenerTab (href: string): void {
  const anchor = document.createElement("a");
  try {
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
  }
}
