# OwnThink Notebook

OwnThink 학생 화면에 임베드되는 JupyterLite 기반 Python 실습 환경입니다. Python 코드는 서버가 아니라 학생 브라우저의 Pyodide 커널에서 실행됩니다.

## 저장소 구성

```text
저장소 루트/
├─ .github/workflows/deploy.yml
├─ content/
│  ├─ template.ipynb
│  └─ OwnThink_template.ipynb
├─ jupyter-lite.json
├─ overrides.json
├─ ownthink-bridge.js
├─ ownthink-theme.css
├─ requirements.txt
└─ .gitignore
```

원본 `template.ipynb`는 보존하고, 실제 OwnThink 기본 노트북은 `OwnThink_template.ipynb`를 사용합니다. `dist/`는 GitHub Actions가 만드는 빌드 결과이므로 저장소에 올리지 않습니다.

## GitHub Pages 배포

1. GitHub에 새 공개 저장소를 만듭니다.
2. 이 폴더의 내용 전체를 저장소 루트에 올립니다. `.github` 폴더도 반드시 포함합니다.
3. 기본 브랜치는 `main`으로 둡니다.
4. **Settings → Pages → Source**에서 **GitHub Actions**를 선택합니다.
5. Actions 탭의 `Deploy OwnThink JupyterLite` 작업이 끝나면 Pages 주소를 확인합니다.

```text
https://<GitHub 계정>.github.io/<저장소 이름>/lab/index.html
```

JupyterLite를 단독으로 열면 `OwnThink_template.ipynb`가 자동으로 열립니다.

## OwnThink에 임베드

학생 식별 코드와 OwnThink API 주소를 iframe URL로 전달합니다.

```text
lab/index.html?ownthink=<학생코드>&api=https://ownthink.sanskit.com
```

연결 모드에서는 OwnThink 서버의 `/api/template`을 우선 사용하고, 서버 템플릿을 가져올 수 없으면 GitHub Pages에 포함된 `OwnThink_template.ipynb`를 사용합니다.

`ownthink-bridge.js`는 노트북 자동 저장, 불러오기, 제출과 교사 보기용 `postMessage`를 담당합니다.

## 수정 후 재배포

`main` 브랜치에 Push하면 자동으로 다시 빌드됩니다. 브리지 파일을 수정했는데 이전 파일이 캐시되면 `deploy.yml`의 `ownthink-bridge-v1.js`를 `v2`로 올리고 세 군데를 같은 번호로 맞춥니다.

## 지원 범위

- pandas, NumPy, matplotlib, scikit-learn 등 Pyodide 호환 패키지
- `.ipynb` 실행과 브라우저 내부 저장
- OwnThink와 자동 저장·불러오기·제출 메시지 연동

TensorFlow, PyTorch, GPU 및 운영체제 실행 파일이 필요한 패키지는 기본 범위에 포함하지 않습니다.
