import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript");
const read = name => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const emit = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
} }).outputText;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const app = ts.createSourceFile("App.tsx", read("App.tsx"), ts.ScriptTarget.Latest, true);
const body = app.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "App").body;
const declares = (node, name) => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(item => item.name.getText(app) === name);
const start = body.statements.findIndex(node => declares(node, "syncGenerationRef"));
const end = body.statements.findIndex(node => declares(node, "sync"));
assert.ok(start >= 0 && end > start, "actual sync and reconciliation refs exist");
const syncSource = body.statements.slice(start, end + 1).map(node => node.getText(app)).join("\n");
let statusHandler;
const findHandler = node => {
  if (ts.isIfStatement(node) && node.expression.getText(app) === 'msg.type === "repo_status_changed"') {
    assert.equal(statusHandler, undefined, "one actual status handler");
    statusHandler = node.getText(app);
  }
  ts.forEachChild(node, findHandler);
};
findHandler(body);
assert.ok(statusHandler);
const wsEffects=body.statements.filter(node=>ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression) && node.expression.expression.getText(app)==="useEffect"
  && node.expression.arguments[0]?.getText(app).includes("const close = connectWs("));
assert.equal(wsEffects.length,1,"one actual WS ownership effect");
const wsBody=wsEffects[0].expression.arguments[0].body;
const wsCleanup=wsBody.statements.filter(ts.isReturnStatement);
assert.equal(wsCleanup.length,1,"one actual WS effect cleanup");
const cleanupSource=wsCleanup[0].expression.getText(app);
const { createSubject } = await import(dataUrl(emit(`
export function createSubject(env) {
  const useRef=value=>({current:value}), useCallback=value=>value;
  const api=env.api, PAGE=500;
  const membershipReadyRef={current:false}, repairMembershipRef={current:env.repair};
  const {setRepos,setTasks,setEvents,setWorkspaceReady,setStatsNonce,setError,setMembershipReady,
    announceStatus,notifyStatusChange,replaceStatusBaseline,setToasts,setBurst,playChime}=env;
  const navigateToRepo=(...args)=>env.navigate.push(args);
  const prefersReducedMotion=()=>env.reducedMotion;
  const celebrationN={current:0};
  const document=env.document, window=env.window;
  ${syncSource}
  return {sync, message(data) { const msg={type:"repo_status_changed",data}; ${statusHandler} },
    cleanup() { const timer=11, missionTimer=12, clearTimeout=env.clearTimeout, close=env.close;
      (${cleanupSource})(); },
    patches:()=>statusPatchesRef.current, epoch:()=>statusEpochRef.current};
}
`)));

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve=yes; reject=no; });
  return {promise,resolve,reject};
};
const flush = async () => { for (let turn=0; turn<8; turn++) await Promise.resolve(); };
const status = (extra={}) => ({repo:"A",clean:false,count:3,offline:false,branch:"develop",
  status_valid:true,paths_complete:true,observed_at:"2026-10-01T01:00:00Z",...extra});
const repository = (extra={}) => ({id:"A",path:"safe-fixture",...status(),...extra});
function subject(initial=[repository()], notify, replaceBaseline) {
  const state={repos:initial,tasks:[],events:[],workspaceReady:false,statsNonce:0,error:"",membershipReady:false,
    toasts:[],burst:null};
  const requests=[], announcements=[], notificationInputs=[], baselineInputs=[], timers=[], repairs=[], cleared=[];
  const env={api:{
    repos(){const round={repos:deferred(),tasks:deferred(),events:deferred()}; requests.push(round); return round.repos.promise;},
    tasks(){return requests.at(-1).tasks.promise;},
    events(options){assert.deepEqual(options,{uncommitted:true,limit:500}); return requests.at(-1).events.promise;},
  }, repair:ids=>repairs.push([...ids]), announceStatus:value=>announcements.push(value),
  navigate:[], reducedMotion:false, document:{hidden:false}, chimes:0, closeCalls:0,
  clearTimeout:timer=>cleared.push(timer), close(){env.closeCalls++;},
  window:{setTimeout(callback,delay){timers.push({callback,delay}); return timers.length;}},
  notifyStatusChange(...args){notificationInputs.push(args.slice(0,2)); return notify?.(...args) ?? false;},
  replaceStatusBaseline(rows){baselineInputs.push(rows); replaceBaseline?.(rows);},
  playChime(){env.chimes++;}};
  for(const key of Object.keys(state)) {
    env["set"+key[0].toUpperCase()+key.slice(1)]=value=>{
      state[key]=typeof value==="function"?value(state[key]):value;
    };
  }
  const actual=createSubject(env);
  return {...actual,state,env,requests,announcements,notificationInputs,baselineInputs,timers,repairs,cleared,
    settle(round,repos,tasks=[],events=[]){round.repos.resolve(repos); round.tasks.resolve(tasks); round.events.resolve(events);}};
}

test("actual status handler publishes complete valid, unavailable and recovered observations", () => {
  const h=subject([repository({clean:true,count:0})]);
  const unavailable=status({clean:true,count:0,status_valid:false,paths_complete:false,
    observed_at:"2026-10-01T01:01:00Z"});
  h.message(unavailable);
  for(const key of ["clean","count","offline","branch","status_valid","paths_complete","observed_at"]) {
    assert.equal(h.state.repos[0][key],unavailable[key],key);
    assert.equal(h.patches().get("A").value[key],unavailable[key],`patch ${key}`);
  }
  assert.deepEqual(h.notificationInputs.at(-1),["A",null]);
  h.message(status({branch:"recovered",observed_at:"2026-10-01T01:02:00Z"}));
  assert.equal(h.state.repos[0].status_valid,true);
  assert.equal(h.state.repos[0].paths_complete,true);
  assert.equal(h.state.repos[0].branch,"recovered");
  assert.equal(h.requests.length,0,"status changes do not add REST requests");
});

test("legacy and malformed trust metadata cannot reuse a trusted snapshot or announce clean", () => {
  for(const invalid of [undefined,null,"true",1,{},false]) {
    const h=subject();
    h.message(status({clean:true,count:0,status_valid:invalid,paths_complete:invalid,observed_at:{private:"no"}}));
    assert.equal(h.state.repos[0].status_valid,false);
    assert.equal(h.state.repos[0].paths_complete,false);
    assert.equal(h.state.repos[0].observed_at,null);
    assert.deepEqual(h.notificationInputs,[ ["A",null] ]);
  }
  const offline=subject();
  offline.message(status({clean:true,count:0,offline:true}));
  assert.deepEqual(offline.notificationInputs,[ ["A",null] ]);
});

test("request-start epoch protects newer pushes before or after repository response fulfillment", async () => {
  for(const responseFirst of [false,true]) {
    const h=subject();
    const work=h.sync(), request=h.requests[0];
    const old=Object.freeze(repository({clean:true,count:0}));
    if(responseFirst){request.repos.resolve([old]); await flush();}
    const fresh=status({status_valid:false,paths_complete:false,branch:"new-observation",
      observed_at:"2026-10-01T01:03:00Z"});
    h.message(fresh);
    h.settle(request,[old]); await work;
    for(const key of ["clean","count","offline","branch","status_valid","paths_complete","observed_at"]) {
      assert.equal(h.state.repos[0][key],fresh[key],`${key}; responseFirst=${responseFirst}`);
    }
    assert.equal(h.state.workspaceReady,true);
    assert.equal(h.state.membershipReady,true);
    assert.deepEqual(h.repairs,[ ["A"] ]);
    assert.equal(old.status_valid,true,"REST input remains immutable");
  }
});

test("a request started after a push accepts its newer snapshot and retires consumed patches", async () => {
  const h=subject();
  h.message(status({status_valid:false,paths_complete:false}));
  const work=h.sync(), request=h.requests[0];
  h.settle(request,[repository({clean:true,count:0,branch:"snapshot-after-push",
    observed_at:"2026-10-01T01:04:00Z"})]);
  await work;
  assert.equal(h.state.repos[0].status_valid,true);
  assert.equal(h.state.repos[0].branch,"snapshot-after-push");
  assert.equal(h.patches().size,0);
});

test("overlapping sync generations preserve current patches, removals and failed-refresh state", async () => {
  for(const obsoleteFailure of [false,true]) {
    const h=subject();
    const oldWork=h.sync(), old=h.requests[0];
    const newWork=h.sync(), current=h.requests[1];
    h.message(status({count:7,branch:"latest"}));
    h.settle(current,[repository(),repository({id:"B",repo:"B"})],[{marker:"current"}]);
    await newWork;
    if(obsoleteFailure){old.repos.reject(new Error("obsolete")); old.tasks.resolve([]); old.events.resolve([]);}
    else h.settle(old,[]);
    await oldWork;
    assert.deepEqual(h.state.repos.map(row=>row.id),["A","B"]);
    assert.equal(h.state.repos[0].count,7);
    assert.deepEqual(h.state.tasks,[{marker:"current"}]);
    assert.equal(h.state.error,"");
    assert.equal(h.state.statsNonce,1);
    assert.equal(h.repairs.length,1);
    const failed=h.sync(), failure=h.requests[2];
    failure.repos.reject(new Error("current refresh failed"));
    failure.tasks.resolve([]); failure.events.resolve([]); await failed;
    assert.equal(h.state.repos[0].count,7);
    assert.match(h.state.error,/current refresh failed/);
    const removed=h.sync(), removal=h.requests[3];
    h.message(status({count:8}));
    h.settle(removal,[repository({id:"B",repo:"B"})]); await removed;
    assert.deepEqual(h.state.repos.map(row=>row.id),["B"],"a patch must not resurrect removed membership");
  }
});

let serial=0;
async function freshNotify() {
  let code=emit(read("notify.ts"));
  for(const dependency of ["preferences","api","preferenceFailure"]) {
    const importPattern=new RegExp(`from ["']\\./${dependency}["']`,"g");
    assert.equal((code.match(importPattern)??[]).length,1);
    code=code.replace(importPattern,`from "${dataUrl(emit(read(dependency+".ts")))}"`);
  }
  return import(dataUrl(code)+`#live-status-${++serial}`);
}
async function withNotification(run) {
  const originals=new Map(), notifications=[];
  const state={hidden:true,focusCalls:0};
  class FakeNotification {
    static permission="granted";
    constructor(title,options){this.title=title;this.options=options;notifications.push(this);}
  }
  const values={Notification:FakeNotification,document:state,
    window:{focus(){state.focusCalls++;}},localStorage:{getItem(){return "on";},setItem(){}}};
  for(const [key,value] of Object.entries(values)) {
    originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,value});
  }
  try{return await run({notifications,state});}
  finally{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test("real notification map breaks unknown baselines while preserving valid transitions and click routing", async () => {
  await withNotification(async ({notifications,state})=>{
    const {notifyStatusChange}=await freshNotify();
    let clicks=0;
    const navigate=()=>clicks++;
    assert.equal(notifyStatusChange("A",false,navigate),false);
    assert.equal(notifyStatusChange("A",null,navigate),false);
    assert.equal(notifyStatusChange("A",true,navigate),false);
    assert.equal(notifyStatusChange("A",false,navigate),false);
    assert.equal(notifyStatusChange("A",true,navigate),true);
    assert.equal(notifyStatusChange("A",true,navigate),false);
    assert.equal(notifications.length,1);
    notifications[0].onclick();
    assert.equal(clicks,1); assert.equal(state.focusCalls,1);
    assert.equal(notifyStatusChange("B",true,navigate),false,"new repo is baseline only");
    state.hidden=false;
    notifyStatusChange("A",false,navigate);
    assert.equal(notifyStatusChange("A",true,navigate),true,"in-app cue remains available while visible");
    assert.equal(notifications.length,1,"OS delivery remains hidden-only");
  });
});

test("actual App and real notify suppress unknown/offline recovery cues without losing valid celebrations", async () => {
  for(const invalid of [{status_valid:false},{status_valid:undefined},{offline:true}]) {
    await withNotification(async ({notifications})=>{
      const {notifyStatusChange}=await freshNotify();
      const h=subject(undefined,notifyStatusChange);
      h.message(status());
      h.message(status({clean:true,count:0,...invalid}));
      h.message(status({clean:true,count:0}));
      assert.equal(h.env.chimes,0);
      assert.equal(h.state.toasts.length,0);
      assert.equal(h.state.burst,null);
      assert.equal(notifications.length,0);
      h.message(status());
      h.message(status({clean:true,count:0}));
      assert.equal(h.env.chimes,1);
      assert.equal(h.state.toasts.length,1);
      assert.equal(notifications.length,1);
      assert.deepEqual(h.timers.map(timer=>timer.delay),[900]);
      h.timers[0].callback();
      assert.equal(h.state.burst,null);
      assert.equal(h.requests.length,0);
    });
  }
});

test("accepted REST unavailable, offline and removed snapshots silently break dirty notification baselines", async () => {
  for(const rows of [[repository({status_valid:false})],[repository({status_valid:undefined})],
    [repository({status_valid:"true"})],[repository({offline:true})],[]]) {
    await withNotification(async ({notifications})=>{
      const notify=await freshNotify();
      const h=subject(undefined,notify.notifyStatusChange,notify.replaceStatusBaseline);
      h.message(status());
      const work=h.sync(); h.settle(h.requests[0],rows); await work;
      assert.equal(notifications.length,0,"REST never delivers a notification");
      h.message(status({clean:true,count:0}));
      assert.equal(h.env.chimes,0);
      assert.equal(h.state.toasts.length,0);
      assert.equal(h.state.burst,null);
      assert.equal(notifications.length,0);
    });
  }
});

test("accepted REST seeds known dirty and clean baselines silently for subsequent valid pushes", async () => {
  for(const clean of [false,true]) {
    await withNotification(async ({notifications})=>{
      const notify=await freshNotify();
      const h=subject(undefined,notify.notifyStatusChange,notify.replaceStatusBaseline);
      // A reconnect may have missed the dirty-to-clean push entirely.
      if(clean) h.message(status());
      const work=h.sync(); h.settle(h.requests[0],[repository({clean,count:clean?0:3})]); await work;
      assert.equal(h.env.chimes,0);
      assert.equal(notifications.length,0);
      h.message(status({clean:true,count:0}));
      assert.equal(h.env.chimes,clean?0:1);
      assert.equal(notifications.length,clean?0:1);
      h.message(status({clean:true,count:0,branch:"next-branch"}));
      assert.equal(h.env.chimes,clean?0:1,"duplicate clean or branch-only push stays silent");
    });
  }
});

test("REST notification baseline uses the WS-reconciled snapshot, not its stale response", async () => {
  for(const clean of [false,true]) {
    await withNotification(async ({notifications})=>{
      const notify=await freshNotify();
      const h=subject(undefined,notify.notifyStatusChange,notify.replaceStatusBaseline);
      const work=h.sync();
      h.message(status({clean,count:clean?0:3}));
      h.settle(h.requests[0],[repository({clean:!clean,count:clean?3:0})]); await work;
      assert.equal(h.state.repos[0].clean,clean);
      assert.equal(h.env.chimes,0);
      h.message(status({clean:true,count:0}));
      assert.equal(h.env.chimes,clean?0:1);
      assert.equal(notifications.length,clean?0:1);
    });
  }
});

test("obsolete successes and failed REST generations cannot replace the accepted notification baseline", async () => {
  await withNotification(async ({notifications})=>{
    const notify=await freshNotify();
    const h=subject(undefined,notify.notifyStatusChange,notify.replaceStatusBaseline);
    const oldWork=h.sync(), old=h.requests[0];
    const currentWork=h.sync();
    h.settle(h.requests[1],[repository()]); await currentWork;
    h.settle(old,[]); await oldWork;
    const failureWork=h.sync(), failure=h.requests[2];
    failure.repos.reject(new Error("failed snapshot")); failure.tasks.resolve([]); failure.events.resolve([]);
    await failureWork;
    h.message(status({clean:true,count:0}));
    assert.equal(h.env.chimes,1);
    assert.equal(notifications.length,1);
  });
});

test("actual WS cleanup retires pending REST successes before baseline, membership or state publication", async () => {
  const h=subject();
  const before=structuredClone(h.state);
  const work=h.sync();
  h.cleanup();
  assert.deepEqual(h.cleared,[11,12]);
  assert.equal(h.env.closeCalls,1);
  h.settle(h.requests[0],[repository({clean:true,count:0})]); await work;
  assert.equal(h.baselineInputs.length,0,"an unmounted owner cannot reseed the shared baseline");
  assert.equal(h.repairs.length,0);
  assert.deepEqual(h.state,before);
  assert.equal(h.announcements.length,0);
});

test("actual WS cleanup prevents late REST failures from publishing errors or announcements", async () => {
  const h=subject();
  const work=h.sync(), request=h.requests[0];
  h.cleanup();
  request.repos.reject(new Error("teardown failure"));
  request.tasks.resolve([]); request.events.resolve([]); await work;
  assert.equal(h.state.error,"");
  assert.equal(h.announcements.length,0);
  assert.equal(h.baselineInputs.length,0);
});

test("StrictMode cleanup invalidates its pending round while a replayed owner can still sync", async () => {
  const h=subject();
  const oldWork=h.sync();
  h.cleanup();
  // A replacement socket can still be connecting when the old HTTP response arrives.
  h.settle(h.requests[0],[repository({branch:"obsolete"})]); await oldWork;
  assert.equal(h.state.workspaceReady,false);
  const newWork=h.sync();
  h.settle(h.requests[1],[repository({branch:"current"})]); await newWork;
  assert.equal(h.state.workspaceReady,true);
  assert.equal(h.state.repos[0].branch,"current");
  assert.equal(h.baselineInputs.length,1);
});

test("an old App teardown cannot reseed the notification baseline owned by its replacement", async () => {
  await withNotification(async ({notifications})=>{
    const notify=await freshNotify();
    const old=subject(undefined,notify.notifyStatusChange,notify.replaceStatusBaseline);
    const oldWork=old.sync(); old.cleanup();
    const current=subject(undefined,notify.notifyStatusChange,notify.replaceStatusBaseline);
    const currentWork=current.sync();
    current.settle(current.requests[0],[repository({clean:true,count:0})]); await currentWork;
    old.settle(old.requests[0],[repository()]); await oldWork;
    current.message(status({clean:true,count:0}));
    assert.equal(current.env.chimes,0,"late old dirty state must not create a false new clean transition");
    assert.equal(notifications.length,0);
  });
});
