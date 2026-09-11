/**
 * CUTE JupyterLite 화면별 브라우저 저장소 분리
 *
 * JupyterLite는 같은 배포 주소의 모든 화면이 기본적으로 하나의 IndexedDB를
 * 공유합니다. 교사 미리보기와 기본 템플릿 편집기를 동시에 띄우면 서로의
 * 파일 목록과 열린 탭이 섞일 수 있으므로, 교사용 화면만 용도별 저장소로
 * 분리합니다. 학생 화면도 접속 코드별 저장소를 사용하므로 같은 브라우저에서
 * 교사·여러 학생 화면을 동시에 열어도 파일과 열린 탭이 섞이지 않습니다.
 *
 * 이 파일은 config-utils.js보다 먼저 실행되어야 합니다.
 */
(function () {
  "use strict";

  var configNode = document.getElementById("jupyter-config-data");
  if (!configNode) return;

  var query = new URLSearchParams(location.search);
  var surface = query.get("cute-surface") || "";
  var scope = "";

  if (surface === "teacher-template") scope = "teacher-template-v2";
  else if (surface === "teacher-design") scope = "teacher-design-v2";
  else if (surface === "teacher-review") {
    var code = (query.get("code") || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
    var kind = query.get("kind") === "auto" ? "auto" : "manual";
    scope = "teacher-review-" + code + "-" + kind + "-v2";
  }
  else if (surface === "student") {
    var studentCode = (query.get("cute") || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
    scope = "student-" + studentCode + "-v2";
  }

  // 쿼리가 없는 독립 실행 화면만 기존 저장소를 씁니다.
  if (!scope) return;

  var config = {};
  try { config = JSON.parse(configNode.textContent || "{}"); } catch (e) {}
  config.contentsStorageName = "CUTE Contents - " + scope;
  config.workspacesStorageName = "CUTE Workspaces - " + scope;
  configNode.textContent = JSON.stringify(config);
})();
