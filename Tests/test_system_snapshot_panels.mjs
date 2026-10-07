import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, name), "utf8");
const lf = text => text.replace(/\r\n/g, "\n");
const sha = text => createHash("sha256").update(text).digest("hex");
const ORIGINAL_RAW = "b5a3fc38436973c6731f25a061ac4aa8696b4241bf1f5b8a25be0bf94e142416";
const ORIGINAL_LF = "84ec82cb389d5900afc8801279eeec1b92432867d741f9ac7784ee1c743f7ab5";
const REVIEWED_RAW = "6cc894aa760ed66eada96511a3494f64f4b317cf15d74ad0a03ae7631d802173";
const REVIEWED_LF = "10a230292425ab64fc1fc378771026727138565f708b0b637345edaab870dbd5";
const OLD_WIDTH = 'panelClassName="max-w-md"';
const NEW_WIDTH = 'panelClassName="max-w-2xl"';

// Independent approved windows. Old decoded fixtures are preservation data only:
// no restored module or old return is compiled, imported or executed.
const OLD_ROW = Buffer.from([
  "cmV0dXJuICgKICAgIDxkaXYgY2xhc3NOYW1lPSJncmlkIG1pbi13LTAgZ3JpZC1jb2xzLVttaW5tYXgoN3JlbSwxMHJlbSlfbWlubWF4KDAsMWZyKV0gZ2Fw",
  "LTIgcHktMSI+CiAgICAgIDxzcGFuIGNsYXNzTmFtZT0idGV4dC11aS1tdXRlZCI+e2xhYmVsfTwvc3Bhbj4KICAgICAgPHNwYW4gY2xhc3NOYW1lPSJtaW4t",
  "dy0wIGJyZWFrLXdvcmRzIHRleHQtdWktdGV4dCI+e2NoaWxkcmVufTwvc3Bhbj4KICAgIDwvZGl2PgogICk7",
].join(""), "base64").toString("utf8");

const NEW_ROW = Buffer.from([
  "cmV0dXJuICgKICAgIDxkaXYgY2xhc3NOYW1lPSJncmlkIG1pbi13LTAgZ3JpZC1jb2xzLTEgZ2FwLTEgcHktMiBzbTpncmlkLWNvbHMtW21pbm1heCg3cmVt",
  "LDEwcmVtKV9taW5tYXgoMCwxZnIpXSBzbTpnYXAtMyI+CiAgICAgIDxzcGFuIGNsYXNzTmFtZT0ibWluLXctMCB0ZXh0LXhzIHRleHQtdWktbXV0ZWQgW292",
  "ZXJmbG93LXdyYXA6YW55d2hlcmVdIj57bGFiZWx9PC9zcGFuPgogICAgICA8c3BhbiBjbGFzc05hbWU9Im1pbi13LTAgdGV4dC1iYXNlIGxlYWRpbmctNiB0",
  "YWJ1bGFyLW51bXMgdGV4dC11aS10ZXh0IFtvdmVyZmxvdy13cmFwOmFueXdoZXJlXSI+e2NoaWxkcmVufTwvc3Bhbj4KICAgIDwvZGl2PgogICk7",
].join(""), "base64").toString("utf8");

const OLD_BODY = Buffer.from([
  "cmV0dXJuICgKICAgIDxkaXYgY2xhc3NOYW1lPSJtaW4tdy0wIHRleHQteHMiPgogICAgICA8aDMgY2xhc3NOYW1lPSJtYi0xIGZvbnQtc2VtaWJvbGQgdGV4",
  "dC1zbGF0ZS0zMDAiPlNlcnZlcjwvaDM+CiAgICAgIDxSb3cgbGFiZWw9InNlcnZlciB2ZXJzaW9uIj57c2VydmVyVmVyc2lvbiA/PyAiVW5rbm93biJ9PC9S",
  "b3c+CiAgICAgIHtzZXJ2ZXJWZXJzaW9uICE9PSBudWxsICYmIHNlcnZlclZlcnNpb24gIT09IFVJX0JVSUxEX1ZFUlNJT04gJiYgKAogICAgICAgIDxwIGNs",
  "YXNzTmFtZT0ibXktMyByb3VuZGVkLWNvbnRyb2wgYm9yZGVyIGJvcmRlci11aS1ib3JkZXIgYmctdWktcmFpc2VkIHAtMyB0ZXh0LXNreS0yMDAiPgogICAg",
  "ICAgICAgVUkgYnVpbGQgYW5kIHNlcnZlciB2ZXJzaW9ucyBkaWZmZXIuIFRoaXMgZG9lcyBub3QgaW5kaWNhdGUgd2hpY2ggaXMgbmV3ZXIKICAgICAgICAg",
  "IG9yIGhlYWx0aHkueyFtaXNzaW5nRXh0ZW5zaW9ucyAmJiA8PiB7VVBHUkFERV9HVUlEQU5DRX08Lz59CiAgICAgICAgPC9wPgogICAgICApfQogICAgICA8",
  "Um93IGxhYmVsPSJ1cHRpbWUiPntmbXRNaW51dGVzKHVwdGltZU1pbil9PC9Sb3c+CiAgICAgIDxSb3cgbGFiZWw9ImRhdGFiYXNlIj4KICAgICAgICB7c2Vy",
  "dmVyLmRiX2J5dGVzID09PSBudWxsID8gIuKAlCIgOiBmbXRCeXRlcyhzZXJ2ZXIuZGJfYnl0ZXMpfQogICAgICA8L1Jvdz4KICAgICAgPFJvdyBsYWJlbD0i",
  "d2F0Y2hlcnMiPgogICAgICAgIDxzcGFuIGNsYXNzTmFtZT17d2F0Y2hlcnNPayA/ICJ0ZXh0LXRlYWwtMzAwIiA6ICJ0ZXh0LXJvc2UtMzAwIn0+CiAgICAg",
  "ICAgICB7c2VydmVyLndhdGNoZXJzX2FsaXZlfS97c2VydmVyLndhdGNoZXJzX3RvdGFsfSBhbGl2ZQogICAgICAgIDwvc3Bhbj4KICAgICAgPC9Sb3c+CiAg",
  "ICAgIDxSb3cgbGFiZWw9IkNocm9uaWNsZSI+CiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtjaHJvbmljbGVDb2xvcn0+e2Nocm9uaWNsZVRleHR9PC9zcGFu",
  "PgogICAgICA8L1Jvdz4KICAgICAgPFJvdyBsYWJlbD0iaG9vayI+CiAgICAgICAgPHNwYW4KICAgICAgICAgIHRpdGxlPXtzZXJ2ZXIuaG9va19zZXR0aW5n",
  "c19wYXRofQogICAgICAgICAgY2xhc3NOYW1lPXtzZXJ2ZXIuaG9va19yZWdpc3RlcmVkID8gInRleHQtdGVhbC0zMDAiIDogInRleHQtcm9zZS0zMDAifQog",
  "ICAgICAgID4KICAgICAgICAgIHtob29rUmVnaXN0cmF0aW9uTGFiZWwoc2VydmVyLmhvb2tfcmVnaXN0ZXJlZCl9CiAgICAgICAgPC9zcGFuPgogICAgICA8",
  "L1Jvdz4KCiAgICAgIHttaXNzaW5nRXh0ZW5zaW9ucyAmJiAoCiAgICAgICAgPGRpdiBjbGFzc05hbWU9Im10LTMgcm91bmRlZC1jb250cm9sIGJvcmRlciBi",
  "b3JkZXItYW1iZXItNzAwIGJnLWFtYmVyLTk1MC8zMCBwLTMgdGV4dC1hbWJlci0yMDAiPgogICAgICAgICAgPHAgY2xhc3NOYW1lPSJmb250LXNlbWlib2xk",
  "Ij5BZGRpdGlvbmFsIGhlYWx0aCBkYXRhIHVuYXZhaWxhYmxlPC9wPgogICAgICAgICAgPHAgY2xhc3NOYW1lPSJtdC0xIj4KICAgICAgICAgICAgU2VydmVy",
  "IHZlcnNpb24ge3NlcnZlclZlcnNpb24gPz8gIlVua25vd24ifSBkaWQgbm90IHByb3ZpZGUge21pc3NpbmdFeHRlbnNpb25zfS4KICAgICAgICAgICAgeyIg",
  "In1NaXNzaW5nIGZpZWxkcyBkbyBub3QgZXN0YWJsaXNoIGEgdmVyc2lvbiBtaXNtYXRjaC4ge1VQR1JBREVfR1VJREFOQ0V9CiAgICAgICAgICA8L3A+CiAg",
  "ICAgICAgPC9kaXY+CiAgICAgICl9CgogICAgICB7Y2hyb25pY2xlLmtpbmQgPT09ICJpbnZhbGlkIiAmJiAoCiAgICAgICAgPGRpdiBjbGFzc05hbWU9Im10",
  "LTMgcm91bmRlZC1jb250cm9sIGJvcmRlciBib3JkZXItYW1iZXItNzAwIGJnLWFtYmVyLTk1MC8zMCBwLTMgdGV4dC1hbWJlci0yMDAiPgogICAgICAgICAg",
  "Q2hyb25pY2xlIGhlYWx0aCBkYXRhIGhhcyBhbiB1bmV4cGVjdGVkIHNoYXBlOyB3b3JrZXIgc3RhdGUgY2Fubm90IGJlIGNvbmZpcm1lZC4KICAgICAgICA8",
  "L2Rpdj4KICAgICAgKX0KCiAgICAgIHthY3Rpdml0eUF2YWlsYWJsZSAmJiAoCiAgICAgICAgPD4KICAgICAgICAgIDxoMyBjbGFzc05hbWU9Im1iLTEgbXQt",
  "MyBmb250LXNlbWlib2xkIHRleHQtc2xhdGUtMzAwIj5BY3Rpdml0eSBpbmJveDwvaDM+CiAgICAgICAgICA8Um93IGxhYmVsPSJwZW5kaW5nIj57YWN0aXZp",
  "dHkucGVuZGluZ308L1Jvdz4KICAgICAgICAgIDxSb3cgbGFiZWw9InJlamVjdGVkIj57YWN0aXZpdHkucmVqZWN0ZWR9PC9Sb3c+CiAgICAgICAgICA8Um93",
  "IGxhYmVsPSJ1bnNjb3BlZCI+e2FjdGl2aXR5Lmlnbm9yZWRfdW5zY29wZWR9IGlnbm9yZWQ8L1Jvdz4KICAgICAgICAgIDxSb3cgbGFiZWw9InJlZ2lzdHJ5",
  "IG1pc21hdGNoIj4KICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXthY3Rpdml0eS5yZWdpc3RyeV9yZXZpc2lvbl9taXNtYXRjaCA+IDAKICAgICAgICAg",
  "ICAgICA/ICJ0ZXh0LWFtYmVyLTMwMCIgOiAidGV4dC11aS10ZXh0In0+CiAgICAgICAgICAgICAge2FjdGl2aXR5LnJlZ2lzdHJ5X3JldmlzaW9uX21pc21h",
  "dGNofQogICAgICAgICAgICA8L3NwYW4+CiAgICAgICAgICA8L1Jvdz4KICAgICAgICA8Lz4KICAgICAgKX0KCiAgICAgIHtwcm92aWRlcnNBdmFpbGFibGUg",
  "JiYgKAogICAgICAgIDw+CiAgICAgICAgICA8aDMgY2xhc3NOYW1lPSJtYi0xIG10LTMgZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTMwMCI+UHJvdmlkZXJz",
  "PC9oMz4KICAgICAgICAgIHtwcm92aWRlcnMubGVuZ3RoID09PSAwID8gKAogICAgICAgICAgICA8cCBjbGFzc05hbWU9InRleHQtdWktbXV0ZWQiPk5vIHBy",
  "b3ZpZGVyIGhlYWx0aCByZWNvcmRzLjwvcD4KICAgICAgICAgICkgOiBwcm92aWRlcnMubWFwKChwcm92aWRlcikgPT4gKAogICAgICAgICAgICA8ZGl2IGtl",
  "eT17cHJvdmlkZXIucHJvdmlkZXJ9CiAgICAgICAgICAgICAgY2xhc3NOYW1lPSJtYi0yIHJvdW5kZWQtY29udHJvbCBib3JkZXIgYm9yZGVyLXVpLWJvcmRl",
  "ci82MCBweC0yIHB5LTEgbGFzdDptYi0wIj4KICAgICAgICAgICAgICA8Um93IGxhYmVsPSJwcm92aWRlciI+e3Byb3ZpZGVyLnByb3ZpZGVyfTwvUm93Pgog",
  "ICAgICAgICAgICAgIDxSb3cgbGFiZWw9ImFkYXB0ZXIiPgogICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtwcm92aWRlci5hZGFwdGVyX3ByZXNl",
  "bnQgPyAidGV4dC10ZWFsLTMwMCIgOiAidGV4dC1yb3NlLTMwMCJ9PgogICAgICAgICAgICAgICAgICB7cHJvdmlkZXIuYWRhcHRlcl9wcmVzZW50ID8gInBy",
  "ZXNlbnQiIDogIm1pc3NpbmcifQogICAgICAgICAgICAgICAgPC9zcGFuPgogICAgICAgICAgICAgIDwvUm93PgogICAgICAgICAgICAgIDxSb3cgbGFiZWw9",
  "ImNvbmZpZ3VyYXRpb24iPgogICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtwcm92aWRlci5jb25maWd1cmF0aW9uX3ZhbGlkID8gInRleHQtdGVh",
  "bC0zMDAiIDogInRleHQtYW1iZXItMzAwIn0+CiAgICAgICAgICAgICAgICAgIHtwcm92aWRlci5jb25maWd1cmF0aW9uX3N0YXRlLnJlcGxhY2VBbGwoIl8i",
  "LCAiICIpfQogICAgICAgICAgICAgICAgPC9zcGFuPgogICAgICAgICAgICAgIDwvUm93PgogICAgICAgICAgICAgIDxSb3cgbGFiZWw9Im9ic2VydmVkIj4K",
  "ICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT17cHJvdmlkZXIucmVjZW50bHlfb2JzZXJ2ZWQgPyAidGV4dC10ZWFsLTMwMCIgOiAidGV4dC11aS1t",
  "dXRlZCJ9PgogICAgICAgICAgICAgICAgICB7cHJvdmlkZXIubGFzdF9vYnNlcnZlZF9hdCA/IGZtdFJlbChwcm92aWRlci5sYXN0X29ic2VydmVkX2F0KSA6",
  "ICJuZXZlciJ9CiAgICAgICAgICAgICAgICAgIHtwcm92aWRlci5yZWNlbnRseV9vYnNlcnZlZCA/ICIgwrcgcmVjZW50IiA6ICIifQogICAgICAgICAgICAg",
  "ICAgPC9zcGFuPgogICAgICAgICAgICAgIDwvUm93PgogICAgICAgICAgICA8L2Rpdj4KICAgICAgICAgICkpfQogICAgICAgIDwvPgogICAgICApfQoKICAg",
  "ICAgPGgzIGNsYXNzTmFtZT0ibWItMSBtdC0zIGZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS0zMDAiPlJlcG9zaXRvcmllczwvaDM+CiAgICAgIDxkaXYgaWQ9",
  "ImhlYWx0aC1yZXBvcyI+CiAgICAgICAge3Zpc2libGVSZXBvcy5tYXAoKHJlcG8pID0+ICgKICAgICAgICAgIDxkaXYKICAgICAgICAgICAga2V5PXtyZXBv",
  "LmlkfQogICAgICAgICAgICBjbGFzc05hbWU9ImdyaWQgbWluLXctMCBncmlkLWNvbHMtW21pbm1heCg3cmVtLDFmcilfYXV0b10gZ2FwLXgtMiBib3JkZXIt",
  "YiBib3JkZXItdWktYm9yZGVyLzUwIHB5LTEuNSBsYXN0OmJvcmRlci0wIgogICAgICAgICAgPgogICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9Im1pbi13",
  "LTAgYnJlYWstYWxsIHRleHQtdWktbXV0ZWQiPgogICAgICAgICAgICAgIHtyZXBvLmlkfQogICAgICAgICAgICAgIHtyZXBvLm9mZmxpbmUgJiYgKAogICAg",
  "ICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPSJtbC0xIHJvdW5kZWQgYmctdWktcmFpc2VkIHB4LTEgdGV4dC14cyB0ZXh0LWFtYmVyLTMwMCI+CiAgICAg",
  "ICAgICAgICAgICAgIG9mZmxpbmUKICAgICAgICAgICAgICAgIDwvc3Bhbj4KICAgICAgICAgICAgICApfQogICAgICAgICAgICA8L3NwYW4+CiAgICAgICAg",
  "ICAgIDxzcGFuIGNsYXNzTmFtZT0idGV4dC11aS10ZXh0Ij4KICAgICAgICAgICAgICB7cmVwby5sYXN0X2V2ZW50X3RzID8gZm10UmVsKHJlcG8ubGFzdF9l",
  "dmVudF90cykgOiAibmV2ZXIifQogICAgICAgICAgICA8L3NwYW4+CiAgICAgICAgICAgIDxzcGFuCiAgICAgICAgICAgICAgY2xhc3NOYW1lPSJ0ZXh0LXVp",
  "LW11dGVkIgogICAgICAgICAgICAgIHsuLi4ocmVwby5ldmVudHNfanNvbmxfbXRpbWUKICAgICAgICAgICAgICAgID8geyB0aXRsZTogImxhc3QgbG9nIHdy",
  "aXRlOiAiICsgZm10VHMocmVwby5ldmVudHNfanNvbmxfbXRpbWUpIH0KICAgICAgICAgICAgICAgIDoge30pfQogICAgICAgICAgICA+CiAgICAgICAgICAg",
  "ICAge3JlcG8uZXZlbnRzX2pzb25sX2J5dGVzID09PSBudWxsID8gIuKAlCIgOiBmbXRCeXRlcyhyZXBvLmV2ZW50c19qc29ubF9ieXRlcyl9CiAgICAgICAg",
  "ICAgIDwvc3Bhbj4KICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtyZXBvLndhcm5pbmdfY291bnQgPiAwID8gInRleHQtYW1iZXItMzAwIiA6ICJ0ZXh0",
  "LXNsYXRlLTQwMCJ9PgogICAgICAgICAgICAgIHtyZXBvLndhcm5pbmdfY291bnR9IHdhcm5pbmd7cmVwby53YXJuaW5nX2NvdW50ID09PSAxID8gIiIgOiAi",
  "cyJ9CiAgICAgICAgICAgIDwvc3Bhbj4KICAgICAgICAgIDwvZGl2PgogICAgICAgICkpfQogICAgICA8L2Rpdj4KICAgICAge3JlcG9zLmxlbmd0aCA+IDUw",
  "ICYmICgKICAgICAgICA8Q29sbGVjdGlvblBhZ2VyCiAgICAgICAgICBjb2xsZWN0aW9uTGFiZWw9IkhlYWx0aCByZXBvc2l0b3JpZXMiCiAgICAgICAgICBj",
  "b250cm9sc0lkPSJoZWFsdGgtcmVwb3MiCiAgICAgICAgICBwYWdlPXtwYWdlcn0KICAgICAgICAgIG9uUGFnZUNoYW5nZT17cGFnZXIuc2V0UGFnZX0KICAg",
  "ICAgICAgIGNsYXNzTmFtZT0ibXQtMyBib3JkZXItdCBib3JkZXItdWktYm9yZGVyIHB0LTMiCiAgICAgICAgLz4KICAgICAgKX0KICAgIDwvZGl2PgogICk7",
].join(""), "base64").toString("utf8");

const NEW_BODY = Buffer.from([
  "cmV0dXJuICgKICAgIDxkaXYgY2xhc3NOYW1lPSJtaW4tdy0wIHNwYWNlLXktNCB0ZXh0LWJhc2UgbGVhZGluZy02Ij4KICAgICAgPHNlY3Rpb24gYXJpYS1s",
  "YWJlbGxlZGJ5PSJoZWFsdGgtc2VydmVyLWhlYWRpbmciIGNsYXNzTmFtZT0ibWluLXctMCByb3VuZGVkLXBhbmVsIGJvcmRlciBib3JkZXItdWktYm9yZGVy",
  "IGJnLXVpLXN1cmZhY2UgcC00Ij4KICAgICAgICA8aDMgaWQ9ImhlYWx0aC1zZXJ2ZXItaGVhZGluZyIgY2xhc3NOYW1lPSJtYi0zIHRleHQtYmFzZSBmb250",
  "LXNlbWlib2xkIHRleHQtdWktdGV4dCI+U2VydmVyPC9oMz4KICAgICAgICA8Um93IGxhYmVsPSJzZXJ2ZXIgdmVyc2lvbiI+e3NlcnZlclZlcnNpb24gPz8g",
  "IlVua25vd24ifTwvUm93PgogICAgICAgIHtzZXJ2ZXJWZXJzaW9uICE9PSBudWxsICYmIHNlcnZlclZlcnNpb24gIT09IFVJX0JVSUxEX1ZFUlNJT04gJiYg",
  "KAogICAgICAgICAgPHAgY2xhc3NOYW1lPSJteS0zIHJvdW5kZWQtY29udHJvbCBib3JkZXIgYm9yZGVyLXVpLWJvcmRlciBiZy11aS1yYWlzZWQgcC0zIHRl",
  "eHQtc2t5LTIwMCI+CiAgICAgICAgICAgIFVJIGJ1aWxkIGFuZCBzZXJ2ZXIgdmVyc2lvbnMgZGlmZmVyLiBUaGlzIGRvZXMgbm90IGluZGljYXRlIHdoaWNo",
  "IGlzIG5ld2VyCiAgICAgICAgICAgIG9yIGhlYWx0aHkueyFtaXNzaW5nRXh0ZW5zaW9ucyAmJiA8PiB7VVBHUkFERV9HVUlEQU5DRX08Lz59CiAgICAgICAg",
  "ICA8L3A+CiAgICAgICAgKX0KICAgICAgICA8Um93IGxhYmVsPSJ1cHRpbWUiPntmbXRNaW51dGVzKHVwdGltZU1pbil9PC9Sb3c+CiAgICAgICAgPFJvdyBs",
  "YWJlbD0iZGF0YWJhc2UiPgogICAgICAgICAge3NlcnZlci5kYl9ieXRlcyA9PT0gbnVsbCA/ICLigJQiIDogZm10Qnl0ZXMoc2VydmVyLmRiX2J5dGVzKX0K",
  "ICAgICAgICA8L1Jvdz4KICAgICAgICA8Um93IGxhYmVsPSJ3YXRjaGVycyI+CiAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9e3dhdGNoZXJzT2sgPyAidGV4",
  "dC10ZWFsLTMwMCIgOiAidGV4dC1yb3NlLTMwMCJ9PgogICAgICAgICAgICB7c2VydmVyLndhdGNoZXJzX2FsaXZlfS97c2VydmVyLndhdGNoZXJzX3RvdGFs",
  "fSBhbGl2ZQogICAgICAgICAgPC9zcGFuPgogICAgICAgIDwvUm93PgogICAgICAgIDxSb3cgbGFiZWw9IkNocm9uaWNsZSI+CiAgICAgICAgICA8c3BhbiBj",
  "bGFzc05hbWU9e2Nocm9uaWNsZUNvbG9yfT57Y2hyb25pY2xlVGV4dH08L3NwYW4+CiAgICAgICAgPC9Sb3c+CiAgICAgICAgPFJvdyBsYWJlbD0iaG9vayI+",
  "CiAgICAgICAgICA8c3BhbgogICAgICAgICAgICB0aXRsZT17c2VydmVyLmhvb2tfc2V0dGluZ3NfcGF0aH0KICAgICAgICAgICAgY2xhc3NOYW1lPXtzZXJ2",
  "ZXIuaG9va19yZWdpc3RlcmVkID8gInRleHQtdGVhbC0zMDAiIDogInRleHQtcm9zZS0zMDAifQogICAgICAgICAgPgogICAgICAgICAgICB7aG9va1JlZ2lz",
  "dHJhdGlvbkxhYmVsKHNlcnZlci5ob29rX3JlZ2lzdGVyZWQpfQogICAgICAgICAgPC9zcGFuPgogICAgICAgIDwvUm93PgoKICAgICAgICB7bWlzc2luZ0V4",
  "dGVuc2lvbnMgJiYgKAogICAgICAgICAgPGRpdiBjbGFzc05hbWU9Im10LTMgcm91bmRlZC1jb250cm9sIGJvcmRlciBib3JkZXItYW1iZXItNzAwIGJnLWFt",
  "YmVyLTk1MC8zMCBwLTMgdGV4dC1hbWJlci0yMDAiPgogICAgICAgICAgICA8cCBjbGFzc05hbWU9ImZvbnQtc2VtaWJvbGQiPkFkZGl0aW9uYWwgaGVhbHRo",
  "IGRhdGEgdW5hdmFpbGFibGU8L3A+CiAgICAgICAgICAgIDxwIGNsYXNzTmFtZT0ibXQtMSI+CiAgICAgICAgICAgICAgU2VydmVyIHZlcnNpb24ge3NlcnZl",
  "clZlcnNpb24gPz8gIlVua25vd24ifSBkaWQgbm90IHByb3ZpZGUge21pc3NpbmdFeHRlbnNpb25zfS4KICAgICAgICAgICAgICB7IiAifU1pc3NpbmcgZmll",
  "bGRzIGRvIG5vdCBlc3RhYmxpc2ggYSB2ZXJzaW9uIG1pc21hdGNoLiB7VVBHUkFERV9HVUlEQU5DRX0KICAgICAgICAgICAgPC9wPgogICAgICAgICAgPC9k",
  "aXY+CiAgICAgICAgKX0KCiAgICAgICAge2Nocm9uaWNsZS5raW5kID09PSAiaW52YWxpZCIgJiYgKAogICAgICAgICAgPGRpdiBjbGFzc05hbWU9Im10LTMg",
  "cm91bmRlZC1jb250cm9sIGJvcmRlciBib3JkZXItYW1iZXItNzAwIGJnLWFtYmVyLTk1MC8zMCBwLTMgdGV4dC1hbWJlci0yMDAiPgogICAgICAgICAgICBD",
  "aHJvbmljbGUgaGVhbHRoIGRhdGEgaGFzIGFuIHVuZXhwZWN0ZWQgc2hhcGU7IHdvcmtlciBzdGF0ZSBjYW5ub3QgYmUgY29uZmlybWVkLgogICAgICAgICAg",
  "PC9kaXY+CiAgICAgICAgKX0KICAgICAgPC9zZWN0aW9uPgoKICAgICAge2FjdGl2aXR5QXZhaWxhYmxlICYmICgKICAgICAgICA8c2VjdGlvbiBhcmlhLWxh",
  "YmVsbGVkYnk9ImhlYWx0aC1hY3Rpdml0eS1oZWFkaW5nIiBjbGFzc05hbWU9Im1pbi13LTAgcm91bmRlZC1wYW5lbCBib3JkZXIgYm9yZGVyLXVpLWJvcmRl",
  "ciBiZy11aS1zdXJmYWNlIHAtNCI+CiAgICAgICAgICA8aDMgaWQ9ImhlYWx0aC1hY3Rpdml0eS1oZWFkaW5nIiBjbGFzc05hbWU9Im1iLTMgdGV4dC1iYXNl",
  "IGZvbnQtc2VtaWJvbGQgdGV4dC11aS10ZXh0Ij5BY3Rpdml0eSBpbmJveDwvaDM+CiAgICAgICAgICA8Um93IGxhYmVsPSJwZW5kaW5nIj57YWN0aXZpdHku",
  "cGVuZGluZ308L1Jvdz4KICAgICAgICAgIDxSb3cgbGFiZWw9InJlamVjdGVkIj57YWN0aXZpdHkucmVqZWN0ZWR9PC9Sb3c+CiAgICAgICAgICA8Um93IGxh",
  "YmVsPSJ1bnNjb3BlZCI+e2FjdGl2aXR5Lmlnbm9yZWRfdW5zY29wZWR9IGlnbm9yZWQ8L1Jvdz4KICAgICAgICAgIDxSb3cgbGFiZWw9InJlZ2lzdHJ5IG1p",
  "c21hdGNoIj4KICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXthY3Rpdml0eS5yZWdpc3RyeV9yZXZpc2lvbl9taXNtYXRjaCA+IDAKICAgICAgICAgICAg",
  "ICA/ICJ0ZXh0LWFtYmVyLTMwMCIgOiAidGV4dC11aS10ZXh0In0+CiAgICAgICAgICAgICAge2FjdGl2aXR5LnJlZ2lzdHJ5X3JldmlzaW9uX21pc21hdGNo",
  "fQogICAgICAgICAgICA8L3NwYW4+CiAgICAgICAgICA8L1Jvdz4KICAgICAgICA8L3NlY3Rpb24+CiAgICAgICl9CgogICAgICB7cHJvdmlkZXJzQXZhaWxh",
  "YmxlICYmICgKICAgICAgICA8c2VjdGlvbiBhcmlhLWxhYmVsbGVkYnk9ImhlYWx0aC1wcm92aWRlcnMtaGVhZGluZyIgY2xhc3NOYW1lPSJtaW4tdy0wIHJv",
  "dW5kZWQtcGFuZWwgYm9yZGVyIGJvcmRlci11aS1ib3JkZXIgYmctdWktc3VyZmFjZSBwLTQiPgogICAgICAgICAgPGgzIGlkPSJoZWFsdGgtcHJvdmlkZXJz",
  "LWhlYWRpbmciIGNsYXNzTmFtZT0ibWItMyB0ZXh0LWJhc2UgZm9udC1zZW1pYm9sZCB0ZXh0LXVpLXRleHQiPlByb3ZpZGVyczwvaDM+CiAgICAgICAgICB7",
  "cHJvdmlkZXJzLmxlbmd0aCA9PT0gMCA/ICgKICAgICAgICAgICAgPHAgY2xhc3NOYW1lPSJ0ZXh0LXVpLW11dGVkIj5ObyBwcm92aWRlciBoZWFsdGggcmVj",
  "b3Jkcy48L3A+CiAgICAgICAgICApIDogcHJvdmlkZXJzLm1hcCgocHJvdmlkZXIpID0+ICgKICAgICAgICAgICAgPGRpdiBrZXk9e3Byb3ZpZGVyLnByb3Zp",
  "ZGVyfQogICAgICAgICAgICAgIGNsYXNzTmFtZT0ibWItMyBtaW4tdy0wIHJvdW5kZWQtcGFuZWwgYm9yZGVyIGJvcmRlci11aS1ib3JkZXIvNjAgYmctdWkt",
  "Y2FudmFzIHB4LTMgcHktMiBsYXN0Om1iLTAiPgogICAgICAgICAgICAgIDxSb3cgbGFiZWw9InByb3ZpZGVyIj57cHJvdmlkZXIucHJvdmlkZXJ9PC9Sb3c+",
  "CiAgICAgICAgICAgICAgPFJvdyBsYWJlbD0iYWRhcHRlciI+CiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9e3Byb3ZpZGVyLmFkYXB0ZXJfcHJl",
  "c2VudCA/ICJ0ZXh0LXRlYWwtMzAwIiA6ICJ0ZXh0LXJvc2UtMzAwIn0+CiAgICAgICAgICAgICAgICAgIHtwcm92aWRlci5hZGFwdGVyX3ByZXNlbnQgPyAi",
  "cHJlc2VudCIgOiAibWlzc2luZyJ9CiAgICAgICAgICAgICAgICA8L3NwYW4+CiAgICAgICAgICAgICAgPC9Sb3c+CiAgICAgICAgICAgICAgPFJvdyBsYWJl",
  "bD0iY29uZmlndXJhdGlvbiI+CiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9e3Byb3ZpZGVyLmNvbmZpZ3VyYXRpb25fdmFsaWQgPyAidGV4dC10",
  "ZWFsLTMwMCIgOiAidGV4dC1hbWJlci0zMDAifT4KICAgICAgICAgICAgICAgICAge3Byb3ZpZGVyLmNvbmZpZ3VyYXRpb25fc3RhdGUucmVwbGFjZUFsbCgi",
  "XyIsICIgIil9CiAgICAgICAgICAgICAgICA8L3NwYW4+CiAgICAgICAgICAgICAgPC9Sb3c+CiAgICAgICAgICAgICAgPFJvdyBsYWJlbD0ib2JzZXJ2ZWQi",
  "PgogICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtwcm92aWRlci5yZWNlbnRseV9vYnNlcnZlZCA/ICJ0ZXh0LXRlYWwtMzAwIiA6ICJ0ZXh0LXVp",
  "LW11dGVkIn0+CiAgICAgICAgICAgICAgICAgIHtwcm92aWRlci5sYXN0X29ic2VydmVkX2F0ID8gZm10UmVsKHByb3ZpZGVyLmxhc3Rfb2JzZXJ2ZWRfYXQp",
  "IDogIm5ldmVyIn0KICAgICAgICAgICAgICAgICAge3Byb3ZpZGVyLnJlY2VudGx5X29ic2VydmVkID8gIiDCtyByZWNlbnQiIDogIiJ9CiAgICAgICAgICAg",
  "ICAgICA8L3NwYW4+CiAgICAgICAgICAgICAgPC9Sb3c+CiAgICAgICAgICAgIDwvZGl2PgogICAgICAgICAgKSl9CiAgICAgICAgPC9zZWN0aW9uPgogICAg",
  "ICApfQoKICAgICAgPHNlY3Rpb24gYXJpYS1sYWJlbGxlZGJ5PSJoZWFsdGgtcmVwb3NpdG9yaWVzLWhlYWRpbmciIGNsYXNzTmFtZT0ibWluLXctMCByb3Vu",
  "ZGVkLXBhbmVsIGJvcmRlciBib3JkZXItdWktYm9yZGVyIGJnLXVpLXN1cmZhY2UgcC00Ij4KICAgICAgICA8aDMgaWQ9ImhlYWx0aC1yZXBvc2l0b3JpZXMt",
  "aGVhZGluZyIgY2xhc3NOYW1lPSJtYi0zIHRleHQtYmFzZSBmb250LXNlbWlib2xkIHRleHQtdWktdGV4dCI+UmVwb3NpdG9yaWVzPC9oMz4KICAgICAgICA8",
  "ZGl2IGlkPSJoZWFsdGgtcmVwb3MiPgogICAgICAgICAge3Zpc2libGVSZXBvcy5tYXAoKHJlcG8pID0+ICgKICAgICAgICAgICAgPGRpdgogICAgICAgICAg",
  "ICAgIGtleT17cmVwby5pZH0KICAgICAgICAgICAgICBjbGFzc05hbWU9ImdyaWQgbWluLXctMCBncmlkLWNvbHMtMSBnYXAteC0zIGdhcC15LTIgYm9yZGVy",
  "LWIgYm9yZGVyLXVpLWJvcmRlci81MCBweS0zIGxhc3Q6Ym9yZGVyLTAgW292ZXJmbG93LXdyYXA6YW55d2hlcmVdIHNtOmdyaWQtY29scy1bbWlubWF4KDdy",
  "ZW0sMWZyKV9taW5tYXgoMCwxZnIpXSIKICAgICAgICAgICAgPgogICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT0ibWluLXctMCBicmVhay1hbGwgdGV4",
  "dC11aS1tdXRlZCI+CiAgICAgICAgICAgICAgICB7cmVwby5pZH0KICAgICAgICAgICAgICAgIHtyZXBvLm9mZmxpbmUgJiYgKAogICAgICAgICAgICAgICAg",
  "ICA8c3BhbiBjbGFzc05hbWU9Im1sLTEgcm91bmRlZCBiZy11aS1yYWlzZWQgcHgtMSB0ZXh0LXhzIHRleHQtYW1iZXItMzAwIj4KICAgICAgICAgICAgICAg",
  "ICAgICBvZmZsaW5lCiAgICAgICAgICAgICAgICAgIDwvc3Bhbj4KICAgICAgICAgICAgICAgICl9CiAgICAgICAgICAgICAgPC9zcGFuPgogICAgICAgICAg",
  "ICAgIDxzcGFuIGNsYXNzTmFtZT0idGV4dC11aS10ZXh0Ij4KICAgICAgICAgICAgICAgIHtyZXBvLmxhc3RfZXZlbnRfdHMgPyBmbXRSZWwocmVwby5sYXN0",
  "X2V2ZW50X3RzKSA6ICJuZXZlciJ9CiAgICAgICAgICAgICAgPC9zcGFuPgogICAgICAgICAgICAgIDxzcGFuCiAgICAgICAgICAgICAgICBjbGFzc05hbWU9",
  "InRleHQtdWktbXV0ZWQiCiAgICAgICAgICAgICAgICB7Li4uKHJlcG8uZXZlbnRzX2pzb25sX210aW1lCiAgICAgICAgICAgICAgICAgID8geyB0aXRsZTog",
  "Imxhc3QgbG9nIHdyaXRlOiAiICsgZm10VHMocmVwby5ldmVudHNfanNvbmxfbXRpbWUpIH0KICAgICAgICAgICAgICAgICAgOiB7fSl9CiAgICAgICAgICAg",
  "ICAgPgogICAgICAgICAgICAgICAge3JlcG8uZXZlbnRzX2pzb25sX2J5dGVzID09PSBudWxsID8gIuKAlCIgOiBmbXRCeXRlcyhyZXBvLmV2ZW50c19qc29u",
  "bF9ieXRlcyl9CiAgICAgICAgICAgICAgPC9zcGFuPgogICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT17cmVwby53YXJuaW5nX2NvdW50ID4gMCA/ICJ0",
  "ZXh0LWFtYmVyLTMwMCIgOiAidGV4dC1zbGF0ZS00MDAifT4KICAgICAgICAgICAgICAgIHtyZXBvLndhcm5pbmdfY291bnR9IHdhcm5pbmd7cmVwby53YXJu",
  "aW5nX2NvdW50ID09PSAxID8gIiIgOiAicyJ9CiAgICAgICAgICAgICAgPC9zcGFuPgogICAgICAgICAgICA8L2Rpdj4KICAgICAgICAgICkpfQogICAgICAg",
  "IDwvZGl2PgogICAgICAgIHtyZXBvcy5sZW5ndGggPiA1MCAmJiAoCiAgICAgICAgICA8Q29sbGVjdGlvblBhZ2VyCiAgICAgICAgICAgIGNvbGxlY3Rpb25M",
  "YWJlbD0iSGVhbHRoIHJlcG9zaXRvcmllcyIKICAgICAgICAgICAgY29udHJvbHNJZD0iaGVhbHRoLXJlcG9zIgogICAgICAgICAgICBwYWdlPXtwYWdlcn0K",
  "ICAgICAgICAgICAgb25QYWdlQ2hhbmdlPXtwYWdlci5zZXRQYWdlfQogICAgICAgICAgICBjbGFzc05hbWU9Im10LTMgYm9yZGVyLXQgYm9yZGVyLXVpLWJv",
  "cmRlciBwdC0zIgogICAgICAgICAgLz4KICAgICAgICApfQogICAgICA8L3NlY3Rpb24+CiAgICA8L2Rpdj4KICApOw==",
].join(""), "base64").toString("utf8");

const IMMUTABLE_PINS = [
  [
    "Frontend/src/healthModel.ts",
    "bf3f6425b5920677ca854692af3712af9a099492bec9a5433845b44bff68a824",
    "7927c2898c6e1cf4dedb71a48de92fbd04d9e9cfd5a8e5253e34925bf0b746a2"
  ],
  [
    "Frontend/src/healthRequest.ts",
    "98ca3e30bd5725789060df12a9e49d3e1aaf03aaba243351e5a54e6c3ae24baa",
    "63d6d8bd41c52ff86f973b5d8c5f46da061ce335b5dd97521217d82644166f98"
  ],
  [
    "Frontend/src/dialog.tsx",
    "aaeda6eec7080c96b4992d6944444d21ab518ba5987e8a5abd8100423dd136b0",
    "86f96a3c1454baf8337409995abb81f11ad57ce74d8f4288cbe5ac350991715a"
  ],
  [
    "Frontend/src/dialogStatus.tsx",
    "b508e129c131925e3fcdf42162c82db1290d19dd5d8cf715f2f4aca8c05e000e",
    "b8bd287f0aa948278a86e211dbc945ed555a17d62c377c85667efcd5c5c7a13d"
  ],
  [
    "Frontend/src/format.ts",
    "4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f",
    "4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f"
  ],
  [
    "Frontend/src/App.tsx",
    "945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e",
    "c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"
  ],
  [
    "Frontend/src/main.tsx",
    "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588",
    "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588"
  ],
  [
    "Frontend/src/index.css",
    "9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81",
    "788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"
  ],
  [
    "Frontend/src/missionPlanGallery.css",
    "4b125b0e8dd6d9004838d366ed3b19166b642d62437c44fec8d7153a74cd919f",
    "4b125b0e8dd6d9004838d366ed3b19166b642d62437c44fec8d7153a74cd919f"
  ],
  [
    "Tests/test_health_ui.mjs",
    "20a5e4cf3b3f7edb5d326dd3c02e4772caca16b37ec7a77d056f34e619b24f54",
    "3263357417db04ceabdc8b42bad9aa644419a414fcb595feed8b9958a2eb1bb2"
  ],
  [
    "Tests/test_health_request.mjs",
    "17f2e2c75ca4e96940ca5fdb5528d9bfb577d63c9d989c51fa1e028bb95e1523",
    "0c7baecab76765eb99ae65c73aed0ca051e2a4cbc9ba55d017ad5bb6a13e08eb"
  ],
  [
    "Tests/test_app_version.mjs",
    "d86fa77843bdf4f552fc7e97bec8f5ecea839f98080451325bef4cd81674d6c3",
    "c5cc037e582d0ff5066d959b76ccb804e58c452cfcb1f92c23a0fba8786b15f5"
  ],
  [
    "Tests/test_nonfinite_duration.mjs",
    "d795d6d33bbd05a17c99e31242663922eec61c3767f2a9506bbcc2ee0eefc611",
    "d795d6d33bbd05a17c99e31242663922eec61c3767f2a9506bbcc2ee0eefc611"
  ],
  [
    "Tests/test_mission_plan_gallery.mjs",
    "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138",
    "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138"
  ]
];

const source = read("Frontend/src/healthPanel.tsx");
const one = (items, predicate, label) => {
  const found = items.filter(predicate);
  assert.equal(found.length, 1, label);
  return found[0];
};
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length - 1, 1, "one physical fixture window");
  return text.replace(before, after);
};
function ending (text) {
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  const bare = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!bare.includes("\r"), "no bare CR");
  if (eol === "\r\n") assert.ok(!bare.includes("\n"), "uniform EOL");
  return eol;
}
function parse (text) {
  const ast = ts.createSourceFile("healthPanel.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid complete actual TSX");
  return ast;
}
function owner (ast, name) {
  return one(ast.statements, node => ts.isFunctionDeclaration(node) && node.name?.text === name,
    "one top-level actual owner: " + name);
}
function finalReturn (ast, name) {
  const fn = owner(ast, name), statements = fn.body.statements;
  const returned = one(statements, ts.isReturnStatement, "one direct return: " + name);
  assert.equal(statements.at(-1), returned, "return is the actual final owner statement");
  return returned;
}
function descendants (node, predicate) {
  const found = [];
  const visit = current => {
    if (predicate(current)) found.push(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

// Narrow three-window inverse. Every untouched byte passes through unchanged.
function restorePanels (text) {
  const eol = ending(text), ast = parse(text), edits = [];
  for (const [name, next, previous] of [["Row", NEW_ROW, OLD_ROW], ["HealthBody", NEW_BODY, OLD_BODY]]) {
    const current = next.replace(/\n/g, eol), returned = finalReturn(ast, name);
    assert.equal(returned.getText(ast), current, "complete actual reviewed return: " + name);
    assert.equal(text.split(current).length - 1, 1, "one unique physical complete return");
    assert.equal(text.slice(returned.getStart(ast) - eol.length - 2, returned.getStart(ast)),
      eol + "  ", "exact physical top-level return indentation");
    edits.push({ start: returned.getStart(ast), end: returned.end, text: previous.replace(/\n/g, eol) });
  }
  const modalReturn = finalReturn(ast, "HealthModal");
  const shell = one(descendants(modalReturn, ts.isJsxOpeningElement),
    node => node.tagName.getText(ast) === "DialogShell", "one actual modal shell");
  const width = one([...shell.attributes.properties], node => ts.isJsxAttribute(node)
    && node.name.getText(ast) === "panelClassName", "one actual modal width attribute");
  assert.ok(width.initializer && ts.isStringLiteral(width.initializer));
  assert.equal(width.initializer.text, "max-w-2xl");
  assert.equal(width.getText(ast), NEW_WIDTH);
  assert.equal(text.split(NEW_WIDTH).length - 1, 1, "one unique physical reviewed width");
  edits.push({ start: width.getStart(ast), end: width.end, text: OLD_WIDTH });
  edits.sort((a, b) => b.start - a.start);
  let restored = text, previousStart = text.length;
  for (const edit of edits) {
    assert.ok(edit.start >= 0 && edit.end <= previousStart, "non-overlapping narrow windows");
    restored = restored.slice(0, edit.start) + edit.text + restored.slice(edit.end);
    previousStart = edit.start;
  }
  parse(restored);
  return restored;
}

test("actual complete three-window inverse preserves all original RAW and LF bytes and untouched owners", () => {
  assert.equal(ending(source), "\r\n", "physical health source retains CRLF");
  assert.equal(sha(source), REVIEWED_RAW); assert.equal(sha(lf(source)), REVIEWED_LF);
  assert.ok(source.endsWith("\r\n") && !source.endsWith("\r\n\r\n"));
  assert.doesNotMatch(source, /[ \t]+\r?$/m);
  const restored = restorePanels(source);
  assert.equal(sha(restored), ORIGINAL_RAW); assert.equal(sha(lf(restored)), ORIGINAL_LF);
  for (const eol of ["\n", "\r\n"]) {
    const current = lf(source).replace(/\n/g, eol), original = restorePanels(current);
    assert.equal(sha(lf(original)), ORIGINAL_LF);
    assert.equal(ending(original), eol);
    const currentAst = parse(current), originalAst = parse(original);
    for (const name of ["HealthButton", "HealthSnapshotContent"]) {
      assert.equal(owner(currentAst, name).getText(currentAst), owner(originalAst, name).getText(originalAst));
    }
    for (const name of ["Row", "HealthBody", "HealthModal"]) {
      const prefix = (text, ast) => text.slice(owner(ast, name).getStart(ast), finalReturn(ast, name).getStart(ast));
      assert.equal(prefix(current, currentAst), prefix(original, originalAst), "all pre-render owner bytes: " + name);
    }
  }
});

test("strict owner/site inverse refuses missing, duplicate, nested, comment, relocated, altered and partial windows", () => {
  const current = lf(source), ast = parse(current), rowFunction = owner(ast, "Row").getText(ast);
  const variants = [
    replaceOnce(current, NEW_ROW, "return null;"),
    replaceOnce(current, NEW_BODY, "return null;"),
    current + "\n" + rowFunction + "\n",
    current + "\n/* " + NEW_ROW + " */\n",
    replaceOnce(current, rowFunction, "function NestedFixture () {\n" + rowFunction + "\n}"),
    replaceOnce(current, NEW_ROW, "if (true) {\n" + NEW_ROW + "\n}"),
    replaceOnce(current, NEW_ROW, NEW_ROW.replace("return (\n", "return (\n    /* altered window */\n")),
    replaceOnce(current, NEW_ROW, "/* " + NEW_ROW + " */\n  return null;"),
    replaceOnce(current, "function Row (", "function OtherRow ("),
    replaceOnce(current, NEW_ROW, NEW_ROW.replace("{label}", "{children}")),
    replaceOnce(current, NEW_BODY, NEW_BODY.replace("activityAvailable &&", "!activityAvailable &&")),
    replaceOnce(current, NEW_BODY, NEW_BODY.replace('id="health-server-heading"', 'id="other-server-heading"')),
    replaceOnce(current, NEW_ROW, NEW_ROW.replace("sm:gap-3", "sm:gap-4")),
    replaceOnce(current, NEW_WIDTH, ""),
    replaceOnce(current, NEW_WIDTH, NEW_WIDTH + " " + NEW_WIDTH),
    replaceOnce(current, NEW_WIDTH, OLD_WIDTH),
    replaceOnce(current, NEW_WIDTH, 'panelClassName={"max-w-2xl"}'),
    replaceOnce(current, NEW_WIDTH, 'panelClassName={/* altered attribute */ "max-w-2xl"}'),
    replaceOnce(current, NEW_WIDTH, 'title="max-w-2xl"'),
    replaceOnce(current, NEW_WIDTH, "") + "\n/* " + NEW_WIDTH + " */\n",
  ];
  for (const value of variants) {
    parse(value);
    for (const eol of ["\n", "\r\n"]) {
      assert.throws(() => restorePanels(value.replace(/\n/g, eol)), assert.AssertionError);
    }
  }
  for (const value of ["\uFEFF" + current, current + "\0", current.replace("\n", "\r"),
    current.replace("\n", "\r\n"), current + "const broken = <div>;\n",
    current.replace(NEW_BODY, NEW_BODY.slice(0, -5))]) assert.throws(() => restorePanels(value));
});

test("valid outside and pre-render mutations remain visible rather than swallowed by the inverse", () => {
  const current = lf(source);
  for (const [beforeText, afterText] of [
    ['from "./format"', 'from "./otherFormat"'],
    ["const watchersOk = server.watchers_alive === server.watchers_total;",
      "const watchersOk = server.watchers_alive !== server.watchers_total;"],
    ["    pageSize: 50,", "    pageSize: 49,"],
    ["const retry = (): void => {", "const retry = (): void => {\n    // Outside reviewed renders."],
    ['title="System health"\n      description=', 'title="Different snapshot"\n      description='],
    ['<Row label="UI build">', '<Row label="Loaded UI build">'],
    ["const UPGRADE_GUIDANCE = ", "// Unrelated valid comment.\nconst UPGRADE_GUIDANCE = "],
  ]) for (const eol of ["\n", "\r\n"]) {
    const originalCurrent = current.replace(/\n/g, eol);
    const beforeWindow = beforeText.replace(/\n/g, eol), afterWindow = afterText.replace(/\n/g, eol);
    const changed = replaceOnce(originalCurrent, beforeWindow, afterWindow);
    parse(changed);
    const restored = restorePanels(changed);
    assert.equal(restored, replaceOnce(restorePanels(originalCurrent), beforeWindow, afterWindow));
    assert.notEqual(sha(lf(restored)), ORIGINAL_LF, "complete original hash exposes outside mutation");
  }
});

test("complete original dependencies and five old suites retain distinct immutable RAW and LF pins", () => {
  for (const [name, rawPin, lfPin] of IMMUTABLE_PINS) {
    const text = deskPreservation(name, read(name)); ending(text);
    assert.equal(sha(text), rawPin, "whole physical original bytes: " + name);
    assert.equal(sha(lf(text)), lfPin, "whole original LF bytes: " + name);
    for (const eol of ["\n", "\r\n"]) assert.equal(sha(lf(lf(text).replace(/\n/g, eol))), lfPin);
  }
});

let vite, health, model, format, ui, buildVersion;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  [health, model, format, ui, { UI_BUILD_VERSION: buildVersion }] = await Promise.all([
    vite.ssrLoadModule("/src/healthPanel.tsx"), vite.ssrLoadModule("/src/healthModel.ts"),
    vite.ssrLoadModule("/src/format.ts"), vite.ssrLoadModule("/src/ui.tsx"),
    vite.ssrLoadModule("/src/appVersion.ts"),
  ]);
});
after(async () => { await vite?.close(); });

function fixture () {
  return {
    server: { version: buildVersion, started_ts: "2026-10-07T12:00:00Z", db_bytes: 1024,
      watchers_alive: 6, watchers_total: 6, hook_registered: true, hook_settings_path: "fixture/settings.json" },
    repos: [{ id: "RepoFixture", offline: false, last_event_ts: null,
      events_jsonl_bytes: null, events_jsonl_mtime: null, warning_count: 0 }],
    activity: { pending: 0, rejected: 0, ignored_unscoped: 0, registry_revision_mismatch: 0 },
    providers: [{ provider: "codex", adapter_present: true, configuration_valid: false,
      configuration_state: "settings_missing", recently_observed: false, last_observed_at: null }],
    chronicle: { state: "running" },
  };
}
function freeze (value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const RECEIVED = "2026-10-07T12:45:00Z";
function renderBody (data, receivedAt = RECEIVED) {
  const beforeData = structuredClone(data); freeze(data);
  const html = renderToStaticMarkup(React.createElement(health.HealthBody, { data, receivedAt }));
  assert.deepEqual(data, beforeData, "render never changes accepted snapshot data");
  return html;
}
const ROW_CLASS = "grid min-w-0 grid-cols-1 gap-1 py-2 sm:grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)] sm:gap-3";
const LABEL_CLASS = "min-w-0 text-xs text-ui-muted [overflow-wrap:anywhere]";
const VALUE_CLASS = "min-w-0 text-base leading-6 tabular-nums text-ui-text [overflow-wrap:anywhere]";
const SECTION_CLASS = "min-w-0 rounded-panel border border-ui-border bg-ui-surface p-4";
const SECTION_PAIRS = [
  ["health-server-heading", "Server"], ["health-activity-heading", "Activity inbox"],
  ["health-providers-heading", "Providers"], ["health-repositories-heading", "Repositories"],
];
function assertSections (html, expected = SECTION_PAIRS) {
  const sections = [...html.matchAll(/<section aria-labelledby="([^"]+)" class="([^"]+)">/g)];
  assert.deepEqual(sections.map(match => match[1]), expected.map(([id]) => id));
  sections.forEach(match => assert.equal(match[2], SECTION_CLASS));
  for (const [id, label] of expected) {
    const heading = '<h3 id="' + id + '" class="mb-3 text-base font-semibold text-ui-text">' + label + "</h3>";
    assert.ok(html.includes(heading)); assert.equal(html.split('id="' + id + '"').length - 1, 1);
  }
}
function nodes (element) {
  const found = [];
  const visit = current => {
    if (Array.isArray(current)) current.forEach(visit);
    else if (React.isValidElement(current)) { found.push(current); visit(current.props.children); }
  };
  visit(element);
  return found;
}

test("raw-current module renders four named sections in order and actual adjacent reflow rows", () => {
  const data = fixture(); assert.equal(model.decodeHealthPayload(data), data);
  const html = renderBody(data);
  assertSections(html);
  assert.match(html, /class="min-w-0 space-y-4 text-base leading-6"/);
  const row = '<div class="' + ROW_CLASS + '"><span class="' + LABEL_CLASS
    + '">server version</span><span class="' + VALUE_CLASS + '">' + buildVersion + "</span></div>";
  assert.ok(html.includes(row), "actual Row retains adjacent label/value spans with reviewed classes");
  assert.ok(html.includes(format.fmtMinutes(45))); assert.ok(html.includes("1.0 KB"));
  assert.ok(html.includes("6/6 alive")); assert.ok(html.includes("line present \u2713"));
  assert.ok(html.includes('title="fixture/settings.json"'));
  assert.ok(html.includes("settings missing")); assert.ok(html.includes("0 warnings"));
  const ast = parse(source), rowReturn = finalReturn(ast, "Row");
  const rowRoot = one(descendants(rowReturn, ts.isJsxElement), node => node.openingElement.tagName.getText(ast) === "div", "one Row root");
  assert.deepEqual(rowRoot.children.filter(ts.isJsxElement).map(node => node.openingElement.tagName.getText(ast)), ["span", "span"]);
  const repoRows = descendants(finalReturn(ast, "HealthBody"), ts.isJsxElement).filter(node =>
    node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
      && attribute.name.getText(ast) === "className" && ts.isStringLiteral(attribute.initializer)
      && attribute.initializer.text.startsWith("grid min-w-0 grid-cols-1 gap-x-3")));
  assert.equal(repoRows.length, 1);
  assert.deepEqual(repoRows[0].children.filter(ts.isJsxElement).map(node => node.openingElement.tagName.getText(ast)), ["span", "span", "span", "span"]);
  assert.ok(repoRows[0].getText(ast).includes("sm:grid-cols-[minmax(7rem,1fr)_minmax(0,1fr)]"));
  assert.ok(repoRows[0].getText(ast).includes("[overflow-wrap:anywhere]"));
});

test("current, legacy, null, empty and Unknown snapshots preserve conditional sections and one honest upgrade sequence", () => {
  const guidance = "If updating: stop Tracker and demo, rebuild the UI, restart Tracker, then reload this tab.";
  for (const version of [buildVersion, undefined, null, {}, "not-a-version", "99.98.97.96"]) {
    for (const mode of ["complete", "missing", "null"]) {
      const data = fixture(); data.server.version = version;
      data.repos = []; data.providers = [];
      if (mode === "missing") { delete data.activity; delete data.providers; delete data.chronicle; }
      if (mode === "null") { data.activity = null; data.providers = null; delete data.chronicle; }
      assert.equal(model.decodeHealthPayload(data), data);
      const html = renderBody(data), complete = mode === "complete", mismatch = version === "99.98.97.96";
      assertSections(html, complete ? SECTION_PAIRS : [SECTION_PAIRS[0], SECTION_PAIRS[3]]);
      assert.equal(html.includes("UI build and server versions differ"), mismatch);
      assert.equal(html.split(guidance).length - 1, !complete || mismatch ? 1 : 0);
      assert.equal(html.includes("Additional health data unavailable"), !complete);
      if (version !== buildVersion && !mismatch) assert.ok(html.includes("Unknown"));
      if (complete) assert.ok(html.includes("No provider health records."));
      else {
        assert.ok(html.includes("activity inbox, provider health and Chronicle worker health"));
        assert.ok(html.includes("Missing fields do not establish a version mismatch."));
        assert.ok(html.includes("not reported"));
      }
      assert.doesNotMatch(html, /<script>/);
    }
  }
});

test("Chronicle decoder retains three exact states and separate missing/malformed worker facts", () => {
  for (const [state, text, color] of [
    ["running", "worker running", "text-teal-300"],
    ["disabled", "disabled for this mode", "text-ui-muted"],
    ["unavailable", "worker unavailable", "text-amber-300"],
  ]) {
    const data = fixture(); data.chronicle = { state, future: true };
    assert.equal(model.decodeHealthPayload(data), data);
    const html = renderBody(data);
    assert.ok(html.includes('<span class="' + color + '">' + text + "</span>"));
    assert.doesNotMatch(html, /Additional health data unavailable|unexpected shape|If updating:/);
  }
  for (const chronicle of [null, [], {}, "running", { state: "future" }]) {
    const data = fixture(); data.chronicle = chronicle;
    assert.equal(model.decodeHealthPayload(data), data);
    const html = renderBody(data);
    assert.ok(html.includes("health data invalid"));
    assert.ok(html.includes("unexpected shape; worker state cannot be confirmed."));
    assert.doesNotMatch(html, /worker running|Additional health data unavailable|If updating:/);
  }
});

test("actual decoder guards unsafe counts while zero/null values and unsupported uptime boundary stay honest", () => {
  const data = fixture();
  data.server.db_bytes = null; data.server.watchers_alive = 0; data.server.watchers_total = 0;
  data.server.hook_registered = false; data.providers = []; data.repos[0].offline = true;
  const html = renderBody(data);
  assert.ok(html.includes("0/0 alive")); assert.ok(html.includes("line not verified"));
  assert.ok(html.includes("offline")); assert.ok(html.includes("\u2014"));
  assert.ok(html.includes("0 warnings")); assert.ok(html.includes("never"));
  for (const [group, field] of [["server", "watchers_alive"], ["server", "db_bytes"],
    ["activity", "pending"], ["repo", "warning_count"]]) {
    for (const value of [NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const invalid = fixture();
      (group === "repo" ? invalid.repos[0] : invalid[group])[field] = value;
      assert.equal(model.decodeHealthPayload(invalid), null, "unsafe required value is not admitted");
    }
  }
  const unsupported = fixture(); unsupported.server.started_ts = "malformed-direct-prop";
  assert.equal(model.decodeHealthPayload(unsupported), null, "real API admission rejects this input");
  const boundaryHtml = renderBody(unsupported);
  assert.match(boundaryHtml, /uptime<\/span><span[^>]*>Unavailable<\/span>/);
  assert.doesNotMatch(boundaryHtml, /NaNh|NaNm|Infinity/);
});

test("long and special accepted values retain exact escaped text and current provider/repository metadata", () => {
  const token = '<script>Long & "scope"</script>', data = fixture();
  data.server.hook_settings_path = token.repeat(15);
  data.server.watchers_alive = Number.MAX_SAFE_INTEGER; data.server.watchers_total = Number.MAX_SAFE_INTEGER;
  data.activity.pending = Number.MAX_SAFE_INTEGER;
  data.providers[0].provider = token.repeat(12);
  data.providers[0].configuration_state = "future_state";
  data.providers[0].last_observed_at = token.repeat(9);
  data.providers[0].recently_observed = true;
  data.repos[0].id = token.repeat(18); data.repos[0].offline = true;
  data.repos[0].last_event_ts = token.repeat(10); data.repos[0].events_jsonl_mtime = token.repeat(11);
  data.repos[0].warning_count = Number.MAX_SAFE_INTEGER;
  assert.equal(model.decodeHealthPayload(data), data);
  const html = renderBody(data);
  assert.match(html, /&lt;script&gt;Long &amp; &quot;scope&quot;&lt;\/script&gt;/);
  assert.ok(html.includes("9007199254740991/9007199254740991 alive"));
  assert.ok(html.includes("9007199254740991 warnings")); assert.ok(html.includes("future state"));
  assert.ok(html.includes(" \u00b7 recent")); assert.ok(html.includes('title="last log write: &lt;script&gt;'));
  assert.doesNotMatch(html, /<script>|whitespace-nowrap|scale\(|transform:|overflow-hidden/);
  assert.ok(html.includes("px-3 py-2 last:mb-0"));
});

test("actual 50-repo rendering and real pager helpers retain bounds and unchanged callbacks", () => {
  const data = fixture(), template = data.repos[0];
  data.repos = Array.from({ length: 51 }, (_, index) => ({ ...template, id: "Repo_" + String(index).padStart(3, "0") }));
  const html = renderBody(data);
  for (let index = 0; index < 50; index++) assert.ok(html.includes("Repo_" + String(index).padStart(3, "0")));
  assert.ok(!html.includes("Repo_050")); assert.ok(html.includes("1\u201350 of 51"));
  assert.match(html, /aria-controls="health-repos"/);
  assert.match(html, /Page 1 of 2/);
  const page = ui.getBoundedPageWindow(51, 2, 50);
  assert.equal(page.start, 50); assert.equal(page.end, 51);
  const calls = [], pager = ui.CollectionPager.render({ collectionLabel: "Health repositories",
    controlsId: "health-repos", page, onPageChange: value => calls.push(value) }, null);
  const previous = one(nodes(pager), node => node.props["aria-label"] === "Health repositories: previous page", "one previous owner");
  const next = one(nodes(pager), node => node.props["aria-label"] === "Health repositories: next page", "one next owner");
  assert.equal(previous.props.disabled, false); assert.equal(next.props.disabled, true);
  assert.equal(previous.props["aria-controls"], "health-repos");
  previous.props.onClick(); assert.deepEqual(calls, [1]);
  const empty = fixture(); empty.repos = [];
  assert.ok(!renderBody(empty).includes('aria-controls="health-repos"'));
});

test("actual SnapshotContent preserves build, local receipt, retained states, status and stable Refresh/Retry callbacks", () => {
  const data = fixture(), accepted = freeze({ data, receivedAt: RECEIVED });
  const newer = freeze({ data: { ...fixture(), server: { ...fixture().server, db_bytes: 2048 } },
    receivedAt: "2026-10-07T13:05:00Z" });
  const error = "System health failed: <script>safe & retry</script>";
  const cases = [
    [null, "", true, "Loading system health.", "Loading\u2026"],
    [null, error, false, "Retry is available.", "Retry"],
    [accepted, "", false, "Received locally:", "Refresh"],
    [accepted, "", true, "Refreshing system health", "Refreshing\u2026"],
    [accepted, error, false, "Showing the last successful response.", "Retry"],
    [newer, "", false, "System health updated.", "Refresh"],
  ];
  for (const [snapshot, failure, busy, status, label] of cases) {
    let calls = 0; const onRefresh = () => calls++;
    const props = { snapshot, error: failure, busy, onRefresh };
    const tree = health.HealthSnapshotContent(props);
    const button = one(nodes(tree), node => node.type === "button", "one unchanged native refresh button");
    assert.equal(button.props.onClick, onRefresh); assert.equal(button.props.disabled, busy);
    assert.equal(button.props["aria-busy"], busy); assert.equal(button.props.children, label);
    if (!busy) { button.props.onClick(); assert.equal(calls, 1); }
    const html = renderToStaticMarkup(React.createElement(health.HealthSnapshotContent, props));
    assert.ok(html.includes(buildVersion)); assert.ok(html.includes("UI build"));
    assert.ok(html.includes("text-base leading-6 tabular-nums"));
    assert.ok(html.includes(status.replaceAll("<", "&lt;").replaceAll(">", "&gt;")));
    assert.match(html, /<p role="status" aria-live="polite" aria-atomic="true"/);
    assert.doesNotMatch(html, /<p role="status"[^>]*aria-busy|<script>/);
    if (snapshot) {
      assert.ok(html.includes('dateTime="' + snapshot.receivedAt + '"'));
      assert.ok(html.includes(format.fmtTs(snapshot.receivedAt)));
      assertSections(html);
      if (busy || failure) {
        assert.ok(html.includes("Showing the last successful response; it has not been updated."));
        assert.ok(html.includes(format.fmtMinutes(45)));
      } else assert.ok(!html.includes("Showing the last successful response"));
    } else {
      assert.ok(html.includes("No health response received yet."));
      assert.ok(!html.includes("<section"));
    }
    if (failure) assert.ok(html.includes("&lt;script&gt;safe &amp; retry&lt;/script&gt;"));
  }
});

test("modal width and unchanged hook/close owners remain source-only while the real System button forwards its action", () => {
  const ast = parse(source), modal = owner(ast, "HealthModal"), returned = finalReturn(ast, "HealthModal");
  assert.ok(returned.getText(ast).includes(NEW_WIDTH));
  assert.ok(returned.getText(ast).includes("onClose={onClose}"));
  assert.ok(returned.getText(ast).includes("backdropClose"));
  const prefix = source.slice(modal.getStart(ast), returned.getStart(ast));
  assert.ok(prefix.includes("return startHealthRequest({"));
  assert.ok(prefix.includes("if (busy || retryPendingRef.current) return;"));
  assert.ok(prefix.includes("receivedAt: new Date().toISOString()"));
  assert.ok(prefix.includes("request: api.health"));
  let calls = 0; const onClick = () => calls++, tree = health.HealthButton({ onClick });
  assert.equal(tree.type, "button"); assert.equal(tree.props.type, "button");
  assert.equal(tree.props.onClick, onClick); assert.equal(tree.props["aria-haspopup"], "dialog");
  tree.props.onClick(); assert.equal(calls, 1);
  // No HealthModal invocation: its portal/focus/close behavior needs native acceptance.
});
