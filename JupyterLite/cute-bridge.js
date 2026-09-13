/**
 * CUTE 수동 저장 v20 (CSV 5개·합계 5MiB 제한 및 삭제 동기화)
 *  - v20: CSV 저장 전 개수·용량을 검사하고 로컬에서 지운 CSV를 클라우드에서도 정리함
 *  - v19: 빈 콘텐츠로 JupyterLite를 빌드해 배포 원본이 파일 목록에
 *         자동 주입되는 경로를 제거함
 *  - v18: JupyterLite 기본 설정을 불러온 직후 화면별 저장소 설정을 주입함
 *  - v17: JupyterLite 기본 파일 목록을 비우고 템플릿을 전용 자산에서만 읽어
 *         학생·교사 화면에 작업용 노트북 하나만 표시함
 *  - v16: 학생 화면도 접속 코드별 저장소로 분리하고, 작업 파일 생성 뒤
 *         배포용 CUTE_template.ipynb를 파일 목록에서 제거함
 *  - v15: 교사 템플릿/미리보기/학생 검토 화면의 브라우저 저장소를 분리하고
 *         구버전 template.ipynb 제거 결과를 대시보드에 알림
 *  - v14: 배포 원본에서 빠진 template.ipynb를 재시도하며 완전히 정리
 *  - v12: 현재 노트북·CSV 저장 API 형식과 배포 코드를 일치시킴
 *  - v11: 각 화면이 시작될 때 그 화면에 복원된 이전 탭만 닫고 전용 파일만 표시함
 *  - v10: 같은 브라우저의 학생 화면, 교사 미리보기, 교사 상세 보기와
 *         템플릿 편집이 서로 다른 로컬 노트북 파일을 사용함
 *  - v9: 이전 브라우저 세션의 template.ipynb와 저장 확인창까지 자동 정리
 *  - v8: 템플릿 편집 모드에서 이전 template.ipynb를 제거하고
 *        CUTE_template.ipynb 하나만 열고 저장함
 *  - v6.2: 저장본을 불러오면 노트북을 자동으로 다시 열어 바로 보이게 함
 *  - v5: 템플릿 편집 모드(?cute-template=1)
 *  - v6: 사용자가 바뀌면(다른 접속 코드·편집 모드 전환) 작업 공간을 비우고
 *        새 사용자의 서버 저장본으로 다시 채움. 제출한 데이터 파일도 자동 복원.
 *  - v3: [제출] 신호로 현재 노트북을 제출본으로 올림
 *  - v4: mywork.ipynb 고정이 아니라, 학생이 실제로 열어 둔 노트북을 따라감.
 *        저장·제출 전에 주피터 문서를 먼저 저장시켜 최신 실행 결과까지 포함.
 * ---------------------------------------------------------------------------
 * 주피터라이트 화면(lab/index.html)에 빌드 단계에서 끼워 넣는 스크립트입니다.
 *
 * v1은 브라우저 저장소(IndexedDB)를 직접 만졌다가 부팅을 방해했습니다.
 * v2는 앱이 다 켜진 뒤, 주피터랩의 정식 파일 API(serviceManager.contents)만 씁니다.
 * 그래서 부팅에 끼어들 일이 없습니다.
 *
 *  1. 앱이 켜지면 mywork.ipynb 가 없을 때 만들어 둡니다.
 *     서버 저장본이 있으면 그것을, 없으면 CUTE_template.ipynb 를 바탕으로.
 *  2. 학생이 [클라우드에 저장]을 누르면 노트북과 CSV를 함께 서버로 보냅니다.
 *  3. 기록지의 [불러오기] 신호(postMessage)를 받아 저장본으로 되돌립니다.
 *
 * 개인 코드와 서버 주소는 기록지가 iframe 주소 뒤에 붙여 줍니다.
 *   lab/index.html?cute=개인코드&api=배포주소
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var FILE = "preview.ipynb";
  var TEMPLATE_FILE = "CUTE_template.ipynb";
  var 상태 = { 해시: null, contents: null, app: null, 최근: null };

  /* 이전 브랜드에서 저장한 작업 소유자 표식을 새 키로 한 번만 옮깁니다. */
  try {
    var 예전키 = ["own", "think"].join("") + "_ws_owner";
    if (localStorage.getItem("cute_ws_owner") === null && localStorage.getItem(예전키) !== null) {
      localStorage.setItem("cute_ws_owner", localStorage.getItem(예전키));
    }
    localStorage.removeItem(예전키);
  } catch (e) {}

  /* ---------- 개인 코드와 서버 주소 ---------- */
  var q = new URLSearchParams(location.search);
  /* 템플릿 편집 모드 — 교사 대시보드가 ?cute-template=1 로 엽니다.
     학생용 자동 저장은 전부 쉬고, [저장] 신호에만 응답합니다. */
  var TPL = q.get("cute-template") === "1";
  /* 교사 보기 모드 — 교사 대시보드가 ?cute-view=1&code=..&kind=.. 로 엽니다.
     학생의 저장본과 데이터 파일을 그대로 열어 보되, 저장·제출은 하지 않습니다. */
  var VIEW = q.get("cute-view") === "1";
  var PREVIEW = q.get("cute-preview") === "1";
  var VCODE = q.get("code") || "";
  var VKIND = q.get("kind") === "auto" ? "auto" : "manual";
  var CODE = q.get("cute") || "";
  var API  = q.get("api") || "";
  var DEMO_SESSION = q.get("cute-session") || "";
  function 서버요청(path, options) {
    if (!DEMO_SESSION) return fetch(API + path, options);
    var headers = new Headers(options && options.headers);
    headers.set("X-CUTE-Test-Session", DEMO_SESSION);
    return fetch(API + path, Object.assign({}, options, { headers: headers }));
  }
  var CONNECTED = !TPL && !VIEW && !PREVIEW && !!CODE && !!API;
  function 안전이름(value) { return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48); }
  if (TPL) FILE = TEMPLATE_FILE;
  else if (VIEW) FILE = "teacher-review-" + 안전이름(VCODE) + "-" + VKIND + ".ipynb";
  else if (CONNECTED) FILE = "student-" + 안전이름(CODE) + ".ipynb";
  else if (PREVIEW) FILE = "teacher-design-preview.ipynb";
  if (VIEW && !API) { console.log("[CUTE] 서버 주소가 없어 교사 보기 모드를 시작할 수 없습니다."); return; }
  if (TPL && !API) console.log("[CUTE] 로컬 템플릿 편집 모드로 시작합니다.");
  else if (!CONNECTED) { console.log("[CUTE] 독립 실행 모드로 기본 템플릿을 엽니다."); }

  /* ---------- 서버와 주고받기 ---------- */
  function 서버에서(kind) {
    return 서버요청("/api/workspace?code=" + encodeURIComponent(CODE) + "&kind=" + kind)
      .then(function (r) { return r.json(); });
  }

  /* ---------- 파일 읽고 쓰기 (주피터랩 정식 API) ---------- */
  function 파일읽기(경로) {
    return 상태.contents.get(경로 || FILE, { content: true });
  }
  function 파일쓰기(내용객체) {
    return 상태.contents.save(FILE, { type: "notebook", format: "json", content: 내용객체 });
  }

  /* 학생이 실제로 열어 둔 노트북을 따라갑니다.
     화면 맨 앞의 문서가 .ipynb 면 그 파일을, 아니면 마지막으로 봤던 노트북을,
     그것도 없으면 mywork.ipynb 를 씁니다. */
  function 대상경로() {
    try {
      var w = 상태.app.shell.currentWidget;
      if (w && w.context && /\.ipynb$/i.test(w.context.path || "")) 상태.최근 = w.context.path;
    } catch (e) {}
    return 상태.최근 || FILE;
  }
  /* 서버로 보내기 전에 주피터 문서를 먼저 저장시켜, 방금 실행한 출력까지 파일에 담습니다. */
  async function 문서먼저저장() {
    try {
      var w = 상태.app.shell.currentWidget;
      if (w && w.context && w.context.save && /\.ipynb$/i.test(w.context.path || "")
          && w.context.model && w.context.model.dirty) await w.context.save();
    } catch (e) { console.warn("[CUTE] 문서 저장 실패(계속 진행):", e); }
  }

  /* ---------- 이전 버전 학생 파일 마이그레이션 ----------
     v10부터는 화면마다 파일명이 다르므로 다른 화면의 파일을 지우지 않습니다.
     같은 브라우저에서 학생과 교사 화면을 동시에 열어도 서로 덮어쓰지 않습니다. */
  var 식별 = TPL ? "__TPL__" : (VIEW ? "__VIEW__" + VCODE + "__" + VKIND : CODE);
  async function 작업공간확인() {
    if (!CONNECTED) return;
    try { await 상태.contents.get(FILE, { content: false }); return; } catch (e) {}
    var 이전 = localStorage.getItem("cute_ws_owner");
    if (이전 !== 식별) { try { localStorage.setItem("cute_ws_owner", 식별); } catch (e) {} return; }
    try {
      var 이전파일 = await 상태.contents.get("mywork.ipynb", { content: true });
      await 상태.contents.save(FILE, { type: "notebook", format: "json", content: 이전파일.content });
      console.log("[CUTE] 이전 학생 파일을 분리된 파일로 옮겼습니다:", FILE);
    } catch (e) {}
    try { localStorage.setItem("cute_ws_owner", 식별); } catch (e) {}
  }

  /* ---------- 제출한 데이터 파일 복원 ----------
     서버에 제출된 파일 중 파일 목록에 없는 것을 전부 내려받아 둡니다. */
  async function 데이터복원(누구) {
    var 코드 = 누구 || CODE;
    try {
      var r = await 서버요청("/api/workspace?code=" + encodeURIComponent(코드))
        .then(function (x) { return x.json(); });
      if (!r || !r.ok || !r.files || !r.files.length) return;
      var 자료 = r.files.filter(function (file) { return file.kind === "data"; });
      for (var i = 0; i < 자료.length; i++) {
        var 이름 = 자료[i].name;
        try { await 상태.contents.get(이름); continue; } catch (e) { /* 없음 → 복원 */ }
        try {
          var res = await 서버요청("/api/workspace?code=" + encodeURIComponent(코드)
            + "&name=" + encodeURIComponent(이름));
          if (!res.ok) continue;
          var buf = new Uint8Array(await res.arrayBuffer());
          var 글 = "", 토막 = 0x8000;
          for (var j = 0; j < buf.length; j += 토막)
            글 += String.fromCharCode.apply(null, buf.subarray(j, j + 토막));
          await 상태.contents.save(이름, { type: "file", format: "base64", content: btoa(글) });
          console.log("[CUTE] 데이터 파일 복원:", 이름);
        } catch (e) { console.warn("[CUTE] 복원 실패:", 이름, e); }
      }
    } catch (e) { console.warn("[CUTE] 데이터 목록 확인 실패:", e); }
  }

  /* ---------- 교사 보기 모드 ---------- */
  async function 목록새로고침() {
    try { await 상태.app.commands.execute("filebrowser:refresh"); } catch (e) {}
  }
  function 보기알림(단계, ok, 상세) {
    try { parent.postMessage({ cute: "view-status", step: 단계, ok: !!ok, error: 상세 ? String(상세).slice(0, 300) : "" }, "*"); } catch (e) {}
  }
  /* 세션 복원이 열어 둔 옛 문서를 정리하고, 새 파일을 연 뒤 디스크 기준으로 갱신합니다.
     복원된 편집기는 메모리의 옛 내용을 계속 보여 주므로, 닫고 다시 열어야 합니다. */
  /* 열린 문서를 확인창 없이 전부 닫습니다.
     복원된 문서에 '수정됨' 표시가 붙어 있으면 닫을 때 저장 확인창이 떠서
     모든 진행을 막으므로, 표시를 지운 뒤 닫습니다. */
  async function 모두닫기() {
    /* 이전 세션에서 이미 떠 있던 저장 확인창을 먼저 닫습니다. */
    확인창치우기();
    await new Promise(function (resolve) { setTimeout(resolve, 80); });
    try {
      var 것들 = 상태.app.shell.widgets ? Array.from(상태.app.shell.widgets("main")) : [];
      for (var i = 0; i < 것들.length; i++) {
        try { if (것들[i].context && 것들[i].context.model) 것들[i].context.model.dirty = false; } catch (e) {}
        /* close-all은 수정됨 표시가 남아 있으면 저장 확인창을 띄워 멈춥니다.
           dispose는 확인 없이 바로 정리되므로 이쪽을 씁니다. */
        try { 것들[i].dispose(); } catch (e) {}
      }
    } catch (e) {}
    /* dispose 뒤 비동기로 뜨는 확인창까지 정리한 후 다음 파일 작업을 진행합니다. */
    await new Promise(function (resolve) { setTimeout(resolve, 80); });
    확인창치우기();
    await new Promise(function (resolve) { setTimeout(resolve, 80); });
  }
  /* 혹시라도 "Save your work" 확인창이 뜨면 Discard를 눌러 치웁니다 (보기 모드 전용 안전망) */
  function 확인창치우기() {
    try {
      var 창 = document.querySelector(".jp-Dialog");
      if (!창) return;
      var 글 = 창.textContent || "";
      var 단추들 = 창.querySelectorAll("button");
      if (/before closing/i.test(글)) {                       /* 저장 확인창 → 버리고 닫기 */
        for (var i = 0; i < 단추들.length; i++)
          if (/discard/i.test(단추들[i].textContent || "")) { 단추들[i].click(); return; }
      }
      if (/select kernel/i.test(글)) {                        /* 커널 선택창 → 커널 없이 */
        for (var j = 0; j < 단추들.length; j++)
          if (/no kernel/i.test(단추들[j].textContent || "")) { 단추들[j].click(); return; }
      }
    } catch (e) {}
  }
  async function 새로열기(경로) {
    await 모두닫기();
    await 상태.app.commands.execute("docmanager:open", { path: 경로,
      kernel: { shouldStart: false, canStart: false } });   /* 보기 전용 — 커널 선택창을 띄우지 않음 */
  }

  /* 파일만 덮어써도 화면에 열려 있는 편집기는 메모리의 옛 내용을 계속 보여 줍니다.
     학생이 직접 닫았다 여는 수고를 없애려고, 그 문서만 닫고 다시 엽니다.
     보기 전용인 새로열기()와 달리 커널을 함께 켜서 바로 실행할 수 있게 합니다. */
  async function 다시열기(경로) {
    var 열자 = 경로 || FILE;
    try {
      var 것들 = 상태.app.shell.widgets ? Array.from(상태.app.shell.widgets("main")) : [];
      for (var i = 0; i < 것들.length; i++) {
        var w = 것들[i];
        try {
          if (w.context && w.context.path === 열자) {
            if (w.context.model) w.context.model.dirty = false;   /* 저장 확인창 방지 */
            w.dispose();
          }
        } catch (e) {}
      }
    } catch (e) {}
    await 상태.app.commands.execute("docmanager:open",
      { path: 열자, kernel: { name: 기본커널() } });
    await 목록새로고침();
  }
  /* 커널 이름은 설정값을 따르되, 없으면 파이오다이드 기본값을 씁니다. */
  function 기본커널() {
    try {
      var c = (window.jupyterConfigData || {});
      return c.defaultKernelName || "python";
    } catch (e) { return "python"; }
  }

  /* ---------- 학생 파일을 내 컴퓨터에 내려받기 ---------- */
  async function 노트북내려받기() {
    await 문서먼저저장();
    var 경로 = 대상경로();
    await 상태.app.commands.execute("docmanager:download", { path: 경로 });
    return { path: 경로, count: 1 };
  }

  async function 데이터내려받기() {
    var dir = await 상태.contents.get("", { content: true });
    var items = ((dir && dir.content) || []).filter(function (item) {
      return item && item.type === "file" && !/\.ipynb$/i.test(item.path || item.name || "");
    });
    if (!items.length) throw new Error("저장할 데이터 파일이 없습니다.");
    for (var i = 0; i < items.length; i++) {
      await 상태.app.commands.execute("docmanager:download", { path: items[i].path });
    }
    return { count: items.length };
  }

  async function 보기준비() {
    /* 복원 기능이 옛 학생의 문서를 먼저 열어 둘 수 있어, 시작하자마자 전부 닫습니다 */
    await 모두닫기();
    /* 데이터 파일을 먼저 되살립니다 — 노트북이 잘못돼도 파일은 보이게 */
    try { await 데이터복원(VCODE); } catch (e) { console.warn("[CUTE] 데이터 복원 실패:", e); }
    try {
      var res = await 서버요청("/api/workspace?code=" + encodeURIComponent(VCODE) + "&kind=" + VKIND);
      var r = null;
      try { r = await res.json(); }
      catch (e) { 보기알림("응답 해석", false, "HTTP " + res.status); return; }
      if (!r || !r.ok) { 보기알림("저장본 조회", false, (r && r.error) || "응답 없음"); return; }
      if (!r.exists || !r.notebook || !r.notebook.content) {
        /* 저장본이 없는 학생 — 빈 노트북에 안내 한 줄을 담아 보여 줍니다.
           앞 학생 화면이 남은 것으로 오해하지 않도록 명시적으로 비웁니다. */
        var 빈 = { cells: [{ cell_type: "markdown", metadata: {},
          source: ["**이 학생은 저장된 노트북이 없습니다.**\n\n학생이 아직 클라우드에 저장하지 않았습니다."] }],
          metadata: {}, nbformat: 4, nbformat_minor: 5 };
        try {
          await 상태.contents.save(FILE, { type: "notebook", format: "json", content: 빈 });
          await 새로열기(FILE);
          await 목록새로고침();
        } catch (e) {}
        보기알림("저장본 없음", true, "");
        return;
      }
      var 객체 = r.notebook.content;
      for (var k = 0; k < 2 && typeof 객체 === "string"; k++) {   // 겹으로 감싸인 JSON도 풉니다
        try { 객체 = JSON.parse(객체); } catch (e) { break; }
      }
      if (!객체 || typeof 객체 !== "object" || !객체.cells) {
        보기알림("형식 검사", false, "저장본이 노트북 형식이 아님 · 앞부분: " + String(r.notebook.content).slice(0, 80)); return;
      }
      try { await 상태.contents.save(FILE, { type: "notebook", format: "json", content: 객체 }); }
      catch (e) { 보기알림("파일 쓰기", false, e); return; }
      try { await 새로열기(FILE); }
      catch (e) { 보기알림("파일 열기", false, e); return; }
      await 목록새로고침();
      보기알림("완료", true, "");
      console.log("[CUTE] 교사 보기 준비 완료:", VCODE, VKIND);
    } catch (e) { 보기알림("준비", false, e); console.warn("[CUTE] 교사 보기 준비 실패:", e); }
  }

  /* ---------- 템플릿 편집 모드 ---------- */
  async function 파일완전삭제(경로) {
    var 마지막오류 = null;
    for (var 시도 = 0; 시도 < 4; 시도++) {
      try {
        var 체크포인트들 = await 상태.contents.listCheckpoints(경로);
        for (var 번호 = 0; 번호 < 체크포인트들.length; 번호++)
          await 상태.contents.deleteCheckpoint(경로, 체크포인트들[번호].id);
      } catch (e) {}
      try { await 상태.contents.delete(경로); } catch (e) { 마지막오류 = e; }
      await new Promise(function (resolve) { setTimeout(resolve, 120 * (시도 + 1)); });
      try {
        var 루트 = await 상태.contents.get("", { content: true });
        var 남음 = ((루트 && 루트.content) || []).some(function (item) {
          return item && String(item.path || item.name || "").replace(/^\/+/, "") === 경로;
        });
        if (!남음) return true;
      } catch (e) {
        try { await 상태.contents.get(경로, { content: false }); }
        catch (e2) { return true; }
      }
    }
    console.warn("[CUTE] 구버전 파일을 제거하지 못했습니다:", 경로, 마지막오류);
    return false;
  }

  async function 구버전템플릿정리() {
    try {
      var 것들 = 상태.app.shell.widgets ? Array.from(상태.app.shell.widgets("main")) : [];
      for (var i = 0; i < 것들.length; i++) {
        var w = 것들[i];
        var 경로 = "";
        try { 경로 = (w.context && w.context.path) || ""; } catch (e) {}
        if (경로 !== "template.ipynb") continue;
        try { if (w.context && w.context.model) w.context.model.dirty = false; } catch (e) {}
        try { w.dispose(); } catch (e) {}
      }
    } catch (e) {}
    await new Promise(function (resolve) { setTimeout(resolve, 80); });
    확인창치우기();
    var 제거됨 = await 파일완전삭제("template.ipynb");
    await 목록새로고침();
    return 제거됨;
  }

  async function 템플릿문서정리() {
    /* 세션 복원으로 열린 구버전/현재 템플릿 탭을 먼저 닫습니다.
       템플릿 모드에선 서버 저장본이 원본이므로 저장 확인 없이 닫아도 안전합니다. */
    try {
      var 것들 = 상태.app.shell.widgets ? Array.from(상태.app.shell.widgets("main")) : [];
      for (var i = 0; i < 것들.length; i++) {
        var w = 것들[i];
        var 경로 = "";
        try { 경로 = (w.context && w.context.path) || ""; } catch (e) {}
        if (경로 !== "template.ipynb" && 경로 !== TEMPLATE_FILE) continue;
        try { if (w.context && w.context.model) w.context.model.dirty = false; } catch (e) {}
        try { w.dispose(); } catch (e) {}
      }
    } catch (e) {}
    await 구버전템플릿정리();
  }

  async function 배포템플릿숨기기() {
    if (TPL) return;
    try {
      var 것들 = 상태.app.shell.widgets ? Array.from(상태.app.shell.widgets("main")) : [];
      for (var i = 0; i < 것들.length; i++) {
        var w = 것들[i];
        var 경로 = "";
        try { 경로 = (w.context && w.context.path) || ""; } catch (e) {}
        if (경로 !== TEMPLATE_FILE) continue;
        try { if (w.context && w.context.model) w.context.model.dirty = false; } catch (e) {}
        try { w.dispose(); } catch (e) {}
      }
    } catch (e) {}
    await 파일완전삭제(TEMPLATE_FILE);
    await 목록새로고침();
  }

  async function 템플릿준비() {
    try {
      await 모두닫기();
      await 템플릿문서정리();
      if (API) {
        var res = await 서버요청("/api/template", { cache: "no-store" });
        if (!res.ok) throw new Error("기본 템플릿 조회 실패: HTTP " + res.status);
        var t = await res.json();
        await 상태.contents.save(TEMPLATE_FILE, { type: "notebook", format: "json", content: t });
      } else {
        var local = await fetch(new URL("../cute-assets/CUTE_template.ipynb", location.href));
        if (!local.ok) throw new Error("배포 템플릿 조회 실패: HTTP " + local.status);
        await 상태.contents.save(TEMPLATE_FILE, { type: "notebook", format: "json", content: await local.json() });
      }
      상태.최근 = TEMPLATE_FILE;
      await 다시열기(TEMPLATE_FILE);
      try { parent.postMessage({ cute: "tpl-ready", ok: true, path: TEMPLATE_FILE }, "*"); } catch (e) {}
      console.log("[CUTE] 템플릿 편집 준비 완료");
    } catch (e) {
      try { parent.postMessage({ cute: "tpl-ready", ok: false, error: String(e) }, "*"); } catch (e2) {}
      console.warn("[CUTE] 템플릿 준비 실패:", e);
    }
  }
  window.addEventListener("message", async function (ev) {
    var m = ev.data;
    if (!TPL || !m || m.cute !== "tpl-pull" || !상태.contents) return;
    try {
      await 문서먼저저장();
      /* 편집 화면에서 다른 탭이 선택되어도 기본 템플릿 하나만 저장합니다. */
      var p = TEMPLATE_FILE;
      var f = await 상태.contents.get(p, { content: true });
      var s = typeof f.content === "string" ? f.content : JSON.stringify(f.content);
      ev.source && ev.source.postMessage({ cute: "tpl-content", ok: true, content: s, path: p }, "*");
    } catch (e) {
      ev.source && ev.source.postMessage({ cute: "tpl-content", ok: false, error: String(e) }, "*");
    }
  });

  /* ---------- 1. 처음 준비 ---------- */
  async function 준비() {
    try {
      await 파일읽기();
      console.log("[CUTE] mywork.ipynb 가 이미 있습니다. 어느 저장본을 쓸지는 학생이 첫 화면에서 고릅니다.");
      return;
    } catch (e) { /* 없음 → 만든다 */ }

    try {
      var r = await 서버에서("auto");
      if (r && r.ok && r.exists && r.notebook && r.notebook.content) {
        await 파일쓰기(JSON.parse(r.notebook.content));
        console.log("[CUTE] 서버 저장본으로 mywork.ipynb 를 만들었습니다.");
        return;
      }
    } catch (e) { console.warn("[CUTE] 서버 확인 실패:", e); }

    try {
      var t = await 서버요청("/api/template");                 // CUTE에 등록된 템플릿
      if (!t.ok) t = await fetch(new URL("../cute-assets/CUTE_template.ipynb", location.href)); // 예비
      await 파일쓰기(await t.json());
      console.log("[CUTE] 템플릿으로 mywork.ipynb 를 만들었습니다.");
    } catch (e) { console.warn("[CUTE] 템플릿을 가져오지 못했습니다:", e); }
  }

  async function 기본템플릿열기() {
    try {
      try { await 상태.contents.get(TEMPLATE_FILE, { content: false }); }
      catch (e) {
        var source = await fetch(new URL("../cute-assets/CUTE_template.ipynb", location.href));
        if (!source.ok) throw new Error("배포 템플릿을 불러오지 못했습니다.");
        await 상태.contents.save(TEMPLATE_FILE, { type: "notebook", format: "json", content: await source.json() });
      }
      await 다시열기(TEMPLATE_FILE);
      console.log("[CUTE] 기본 템플릿을 열었습니다.");
    } catch (e) { console.warn("[CUTE] 기본 템플릿 열기 실패:", e); }
  }

  async function 미리보기준비() {
    try {
      await 모두닫기();
      var res = API
        ? await 서버요청("/api/template", { cache: "no-store" })
        : await fetch(new URL("../cute-assets/CUTE_template.ipynb", location.href));
      if (!res.ok) throw new Error("저장된 기본 템플릿을 불러오지 못했습니다: HTTP " + res.status);
      await 상태.contents.save(FILE, { type: "notebook", format: "json", content: await res.json() });
      상태.최근 = FILE;
      await 새로열기(FILE);
      /* 수업 설계는 노트북의 원래 UI를 보여 주지만, 편집과 실행은 하지 않습니다. */
      var 노트북 = 상태.app.shell.currentWidget;
      if (노트북 && 노트북.content && 노트북.content.model)
        노트북.content.model.readOnly = true;
      if (노트북 && 노트북.context && 노트북.context.model)
        노트북.context.model.readOnly = true;
      document.body.classList.add("cute-design-preview");
      try { parent.postMessage({ cute: "preview-status", ok: true }, "*"); } catch (e) {}
      console.log("[CUTE] 교사 수업 설계 미리보기 준비 완료");
    } catch (e) {
      try { parent.postMessage({ cute: "preview-status", ok: false, error: String(e) }, "*"); } catch (e2) {}
      console.warn("[CUTE] 미리보기 준비 실패:", e);
    }
  }

  /* ---------- 2. 노트북과 CSV를 사용자가 요청할 때만 클라우드에 저장 ---------- */
  var CSV_MAX_FILES = 5;
  var CSV_MAX_BYTES = 5 * 1024 * 1024;
  async function 클라우드저장() {
    if (!CONNECTED) throw new Error("학생 접속 코드 또는 서버 주소가 없습니다.");
    await 문서먼저저장();
    var 경로 = 대상경로();
    var 노트북 = await 파일읽기(경로);
    var 파일들 = [{
      name: 경로.split("/").pop(), kind: "notebook", encoding: "utf8",
      contentType: "application/x-ipynb+json",
      content: typeof 노트북.content === "string" ? 노트북.content : JSON.stringify(노트북.content)
    }];
    var dir = await 상태.contents.get("", { content: true });
    var csv들 = ((dir && dir.content) || []).filter(function (item) {
      return item && item.type === "file" && /\.csv$/i.test(item.path || item.name || "");
    });
    if (csv들.length > CSV_MAX_FILES)
      throw new Error("CSV 파일은 학생 1인당 최대 5개까지 저장할 수 있습니다.");
    var csv총바이트 = 0;
    for (var i = 0; i < csv들.length; i++) {
      var csv = await 상태.contents.get(csv들[i].path, { content: true });
      var 내용 = typeof csv.content === "string" ? csv.content : JSON.stringify(csv.content);
      csv총바이트 += csv.format === "base64" ? atob(내용).length : new TextEncoder().encode(내용).byteLength;
      if (csv총바이트 > CSV_MAX_BYTES)
        throw new Error("CSV 파일의 총 크기는 학생 1인당 5MB(5,242,880바이트)까지입니다.");
      파일들.push({ name: csv들[i].name || csv들[i].path, kind: "data",
        encoding: csv.format === "base64" ? "base64" : "utf8", contentType: csv.mimetype || "text/csv",
        content: 내용 });
    }
    return 서버요청("/api/workspace", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: CODE, classId: "2-3", lessonId: "data-science-project", syncCsv: true, files: 파일들 })
    }).then(function (response) { return response.json(); });
  }

  /* ---------- 3. 기록지의 [불러오기]·[제출] 신호 (학생 모드 전용) ---------- */
  window.addEventListener("message", async function (ev) {
    var m = ev.data;
    if (!m || !상태.contents) return;

    if (m.cute === "download-notebook" || m.cute === "download-data") {
      try {
        var 내려받기결과 = m.cute === "download-notebook" ? await 노트북내려받기() : await 데이터내려받기();
        ev.source && ev.source.postMessage({ cute: "download-result", ok: true, count: 내려받기결과.count, path: 내려받기결과.path || "" }, "*");
      } catch (e) {
        ev.source && ev.source.postMessage({ cute: "download-result", ok: false, error: String(e) }, "*");
      }
      return;
    }

    if (TPL) return;

    // [클라우드 저장] — 버튼을 누른 시점의 노트북과 CSV만 서버에 올립니다.
    if (m.cute === "push") {
      try {
        var r2 = await 클라우드저장();
        console.log("[CUTE] 수동 저장", r2 && r2.time);
        ev.source && ev.source.postMessage(
          { cute: "push-result", ok: !!(r2 && r2.ok), time: r2 && r2.time, count: r2 && r2.count, error: r2 && r2.error }, "*");
      } catch (e) {
        ev.source && ev.source.postMessage({ cute: "push-result", ok: false, error: String(e) }, "*");
      }
      return;
    }

    if (m.cute !== "load") return;
    try {
      var r = await 서버에서(m.kind === "manual" ? "manual" : "auto");
      if (!r.ok || !r.exists || !r.notebook || !r.notebook.content) {
        ev.source && ev.source.postMessage({ cute: "load-result", ok: false, error: r.error || "저장본 없음" }, "*");
        return;
      }
      await 파일쓰기(JSON.parse(r.notebook.content));
      상태.해시 = null;
      /* 불러온 내용이 화면에 바로 보이도록 노트북을 다시 엽니다.
         실패해도 파일은 이미 바뀌었으므로, 학생에게 직접 열라고 안내합니다. */
      var 열림 = true;
      try { await 다시열기(FILE); }
      catch (e) { 열림 = false; console.warn("[CUTE] 다시 열기 실패:", e); }
      ev.source && ev.source.postMessage(
        { cute: "load-result", ok: true, kind: m.kind, time: r.time, 다시열림: 열림 }, "*");
    } catch (e) {
      ev.source && ev.source.postMessage({ cute: "load-result", ok: false, error: String(e) }, "*");
    }
  });

  /* ---------- 앱이 켜질 때까지 기다렸다가 시작 ---------- */
  var 기다림 = setInterval(function () {
    var app = window.jupyterapp || window.jupyterlab;
    if (!app || !app.serviceManager) return;
    clearInterval(기다림);
    app.started.then(async function () {
      상태.app = app;
      상태.contents = app.serviceManager.contents;
      /* 세션 복원이 옛 문서를 늦게 되살리므로, 복원이 끝나기를 기다렸다가 정리합니다 */
      try { await app.restored; } catch (e) {}
      /* 예전 버전이 만든 template.ipynb는 어떤 모드로 열어도 남기지 않습니다. */
      await 구버전템플릿정리();
      await 작업공간확인();
      if (TPL)  { 템플릿준비(); return; }         // 편집 모드는 교사 저장 신호에만 응답합니다
      if (VIEW) { setInterval(확인창치우기, 1500); 보기준비(); return; }   // 교사 보기도 저장하지 않습니다
      if (PREVIEW) { 미리보기준비(); return; }     // 수업 설계 미리보기는 학생 파일과 분리합니다
      if (!CONNECTED) { await 기본템플릿열기(); return; }
      await 모두닫기();
      await 준비();
      await 데이터복원();
      await 배포템플릿숨기기();
      목록새로고침();
      await 다시열기(FILE);
      console.log("[CUTE] 수동 저장 준비 완료");
    });
  }, 400);
  // 2분이 지나도 앱을 못 찾으면 포기하고 로그만 남깁니다.
  setTimeout(function () { clearInterval(기다림); }, 120000);
})();

