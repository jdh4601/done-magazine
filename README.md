# D.one Magazine Studio

개인용 로컬 웹 앱. YouTube 자막을 가져와 로그인된 Codex CLI로 한국어 창업 매거진 초안을 작성한다. 업로드한 사진의 누끼·흑백 대비·파랑 톤·주황 콜라주·인쇄 질감을 적용하고, 제목과 본문을 수정한 뒤 PNG 또는 편집 가능한 Figma 레이어로 내보낸다.

## 실행

```bash
cd /Users/jayden/Developer/done-magazine
npm start
```

브라우저에서 http://localhost:4317 을 연다. 개발 중에는 `npm run dev`, 수정 후 배포용 로컬 빌드는 `npm run build`를 실행한다. 외부 서버로 배포하지 않고 127.0.0.1에만 바인딩한다.

이 컴퓨터에는 Node, Codex CLI, ChatGPT 로그인, Python 환경과 누끼 모델을 준비해 두었다. 원고 생성은 Codex 이용 한도를 사용하며 별도 AI API 키를 요구하지 않는다. Codex가 로그아웃된 경우 터미널에서 `codex login`을 실행한다. 모델을 지정하려면 `CODEX_MODEL=모델이름 npm start`로 실행할 수 있다.

## 사용

1. YouTube 영상 URL을 입력한다. 기사 관점은 선택이며 비워두면 중심 주제를 자동으로 찾는다.
2. 실제 사용할 JPG/PNG/WebP 사진을 올린다. 사진당 15MB, 최대 8개. 표지에 쓸 사진을 선택할 수 있다.
3. 매거진 초안 생성을 누른다. 카드 수는 내용에 따라 달라지며 표지와 D.one 엔딩을 함께 만든다. 긴 영상은 구간별 근거를 추출한 뒤 전체 원고를 구성한다.
4. 카드 목록에서 페이지를 선택하고 제목·본문·강조 문구를 수정한다. 원문 구절과 실제 영상 시점을 확인한다. 직접 붙여넣은 자막에 시점이 없으면 타임스탬프를 만들지 않는다.
5. 표지 후보에서 세 가지 자동 구도 중 하나를 선택한다. 후보는 같은 원고·사진의 배치 변형이다.
6. 전체 PNG ZIP 또는 Figma 편집 파일을 다운로드한다.

각 프로젝트는 `data/projects`에 자동 저장한다. ‘프로젝트’ 버튼으로 다시 연다. 현재 프로젝트의 자동 저장은 화면에 ‘저장됨’으로 표시된다. 별도 사용자 계정이나 클라우드 저장은 없다.

## YouTube 자막

- 이 Mac에 설치된 Aside CLI의 YouTube 스킬로 타임스탬프 포함 자막을 먼저 가져온다. 브라우저 탭을 열거나 변경하지 않는다.
- Aside가 없거나 실패하면 프로젝트의 최신 로컬 yt-dlp를 보조 경로로 사용한다.
- 자막 없음, 비공개 영상, 요청 차단 등으로 두 경로 모두 실패하면 ‘자막 직접 넣기’를 사용한다. TXT/SRT/VTT/JSON3 또는 붙여넣기를 지원한다.
- 영상 파일을 다운로드하지 않으며 자막 내용만 저장한다.
- 자막과 생성 원고는 로컬에 저장되지만 원고 작성에 필요한 자막은 Codex 서비스로 전달된다. 사진 누끼와 보정은 로컬에서 처리한다.

## 표지와 템플릿

참조: `/Users/jayden/.codex/skills/done-editorial-cover/SKILL.md`, 첨부 #1~#7.

- 1080×1350, 주황 #FF660F·파랑 #1712FF, 강한 흑백 대비, 분리한 피사체, 하단 그라데이션, 별도 인쇄 질감.
- Noto Sans KR와 Playfair Display. Playfair Display는 원본 Figma 템플릿의 브랜드 텍스트 속성에서 확인했다.
- 본문은 사진 위/아래 × 검정/종이색, 사진 배경형의 5가지 구성을 내용에 따라 선택한다.
- JPG 참조는 레이아웃·스타일 기준으로 사용한다. 기존 이미지에 박힌 글자를 새 원고의 텍스트로 재사용하지 않는다.
- 사진 보정은 원본 기반 누끼와 필터·도형 합성이다. Adobe Photoshop이나 생성형 배경 재작성 API를 호출하지 않는다. 인물의 얼굴·외모를 새로 생성하지 않는다.
- 여러 피사체, 복잡한 배경, 사진에 이미 들어간 글자는 누끼 품질이 떨어질 수 있다. 주 피사체가 뚜렷하고 텍스트가 없는 원본 사진을 권장한다.

## Figma 가져오기

앱의 ‘Figma 플러그인 다운로드’ ZIP을 풀고 Figma 데스크톱에서 Plugins → Development → Import plugin from manifest…를 선택한다. `figma-plugin/manifest.json`을 등록한다. 플러그인을 실행한 뒤 앱에서 내보낸 `.done.json` 파일을 선택한다.

제목과 본문은 네이티브 TextNode로, 사진·누끼 PNG·도형·그라데이션·질감은 별도 레이어로 생성한다. 기존 프레임을 덮어쓰지 않는다. 사진 자체는 래스터 이미지이고 누끼는 PNG 알파 마스크이며 벡터 누끼 경로 또는 PSD는 아니다. 웹 앱에서 사진/도형을 자유 이동하는 편집기는 제공하지 않는다.

글꼴을 Figma에서 찾지 못하면 `public/fonts/NotoSansKR.ttf`와 `PlayfairDisplay.ttf`를 설치하고 Figma를 다시 실행한다. 두 글꼴의 SIL OFL 라이선스를 같은 폴더에 포함했다.

## 다른 컴퓨터에서 설치

Node.js 22.12 이상, Codex CLI와 로그인, uv가 필요하다.

```bash
npm install
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python 'rembg[cpu]' pillow 'yt-dlp[default]' curl-cffi
.venv/bin/python -c "from rembg import new_session; new_session('u2netp', providers=['CPUExecutionProvider'])"
npm run build
npm start
```

Aside는 선택 의존성이다. 없는 환경에서는 yt-dlp를 사용한다. `CODEX_BIN`, `YTDLP_BIN`, `ASIDE_BIN`, `PORT`로 실행 경로와 포트를 설정할 수 있다. 누끼 모델은 첫 실행 시 공식 rembg 배포에서 다운로드되고 이후 로컬 캐시를 사용한다.

## 검증

`npm test`, `npm run check`, `npm run build`. 실제 YouTube 자막 추출과 Codex 생성, 사진 처리, PNG/JSON 내보내기는 로컬 통합 검증을 별도로 수행한다. `data/verification`은 검증용 자료이고 개인 기사 원본과 구분한다.
