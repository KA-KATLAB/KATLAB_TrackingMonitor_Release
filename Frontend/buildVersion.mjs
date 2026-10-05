import { readFileSync } from "node:fs";

const DEFAULT_VERSION_FILE = new URL("../Backend/app/version.py", import.meta.url);

// Parse a narrow data declaration without executing Python or querying Git.
export function parseBuildVersion (source) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const invalid = () => new Error("Expected a data-only Backend/app/version.py: optional plain docstring/comments and one quoted four-part __version__ declaration.");
  if (source.includes("\0")) throw invalid();
  let docstring = null;
  let docstringSeen = false;
  let version = null;
  for (const line of lines) {
    let content = line;
    if (docstring === null) {
      if (/^[ \t]*(?:#.*)?$/.test(line)) continue;
      const delimiter = line.startsWith('"""') ? '"""' : line.startsWith("'''") ? "'''" : null;
      if (delimiter && !docstringSeen && version === null) {
        docstringSeen = true;
        docstring = delimiter;
        content = line.slice(3);
      } else {
        const match = /^__version__[ \t]*=[ \t]*(["'])(\d+\.\d+\.\d+\.\d+)\1[ \t]*(?:#.*)?$/.exec(line);
        if (!match || version !== null) throw invalid();
        version = match[2];
        continue;
      }
    }
    // Escaped delimiters require Python lexical interpretation; fail closed.
    if (content.includes("\\")) throw invalid();
    const end = content.indexOf(docstring);
    if (end !== -1) {
      if (!/^[ \t]*(?:#.*)?$/.test(content.slice(end + 3))) throw invalid();
      docstring = null;
    }
  }
  if (docstring !== null || version === null) throw invalid();
  return version;
}

export function readBuildVersion (file = DEFAULT_VERSION_FILE) {
  try {
    return parseBuildVersion(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error("Cannot load canonical KATLAB UI build version: check Backend/app/version.py.", { cause: error });
  }
}
