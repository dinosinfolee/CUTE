/**
 * CUTE JupyterLite 화면별 브라우저 저장소 분리
 *
 * JupyterLite는 같은 배포 주소의 모든 화면이 기본적으로 하나의 IndexedDB를
 * 공유합니다. 교사 미리보기와 기본 템플릿 편집기를 동시에 띄우면 서로의
 * 파일 목록과 열린 탭이 섞일 수 있으므로, 교사용 화면만 용도별 저장소로
 * 분리합니다. 학생 저장소는 기존 로컬 작업을 보존하기 위해 변경하지 않습니다.
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

  if (surface === "teacher-template") scope = "teacher-template-v1";
  else if (surface === "teacher-design") scope = "teacher-design-v1";
  else if (surface === "teacher-review") {
    var code = (query.get("code") || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
    var kind = query.get("kind") === "auto" ? "auto" : "manual";
    scope = "teacher-review-" + code + "-" + kind;
  }

  // 학생·독립 실행 화면은 기존 브라우저 작업을 잃지 않도록 기존 저장소를 씁니다.
  if (!scope) return;

  var config = {};
  try { config = JSON.parse(configNode.textContent || "{}"); } catch (e) {}
  config.contentsStorageName = "CUTE Contents - " + scope;
  config.workspacesStorageName = "CUTE Workspaces - " + scope;
  configNode.textContent = JSON.stringify(config);
})();
