# 《콜드슬립 거짓말 대회》 — Cloudflare Workers 배포본

2026-10-08 · Flask → Cloudflare Workers 변환, 기존 문구와 디자인 유지.

## 0. 폴더 구조

```
wrangler.jsonc                Workers 설정 · 저장소 최상위
package.json                 Wrangler 버전 및 테스트
src/index.js                 비공개 Google Apps Script 중계 API
public/index.html            세 개의 탭, 공고문, 입력폼, 완료 화면
public/static/app.js         탭 이동, 제출, 랜덤 거짓말, 선택적 추천 링크
public/static/style.css      기존 흑백·좌우 반전·폰트 디자인
public/static/fonts/         글꼴 파일은 별도 복사(아래 1절)
google_apps_script.gs         Google Apps Script 편집기에 복사할 서버 코드
.env.example                 값이 없는 예시(실제 .env 파일 업로드 금지)
tests/                       네트워크 없이 실행하는 테스트
```

**업로드 주의**: 이 ZIP을 통째로 GitHub에 업로드하는 것이 아니라, 압축을 풀고 그 안의 `wrangler.jsonc`, `package.json`, `src`, `public` 등의 **내용물 전체**를 저장소 최상위에 업로드합니다. 기존 Flask 파일인 `app.py`, `templates/`, `requirements.txt`, `Dockerfile`은 이 배포판에 필요하지 않습니다.

## 1. 글꼴 파일 준비 — 디자인 보존

글꼴 파일은 배포 ZIP에 재수록하지 않았습니다. 보유한 원본 7종을 `public/static/fonts/` 폴더에 그대로 복사한 후 그 폴더를 GitHub에 업로드하세요.

- Pretendard-Regular.otf
- Galmuri11-Regular.ttf
- SongMyung-Regular.ttf
- GowunBatang-Regular.ttf
- NanumMyeongjo-Regular.ttf
- VT323-Regular.ttf
- OldStandard-Regular.ttf

각 글꼴의 라이선스 문서는 이 ZIP에 `public/static/fonts/*-LICENSE.txt` 및 `docs/` 형태로 포함되어 있습니다. 원본 바이너리가 없으면 화면의 글꼴이 대체 폰트로 표시됩니다. 글꼴 이름을 바꾸지 마세요.

## 2. Apps Script와 Google Sheets

Google 스프레드시트:
`https://docs.google.com/spreadsheets/d/1izgX_9XH6rqjHddJQQacnQCM-eljI6fKRSGKxQEOgBU/edit`

앱 스크립트 프로젝트:
`https://script.google.com/u/1/home/projects/1D3L_ifotUCQeev0FjGt3Xmtl4__u9cgyyeu-3lRxqkRycOLWlruT_FFA/edit`

1. 운영 시트를 먼저 **사본으로 백업**합니다.
2. Apps Script에서 코드 전체를 이 ZIP의 `google_apps_script.gs`로 교체합니다.
3. `프로젝트 설정 → 스크립트 속성`에 `SPREADSHEET_ID`(위 시트 ID)와 `SECRET`(서버와 동일한 새로운 무작위 값)을 등록합니다. GitHub에는 비밀 값을 저장하지 않습니다.
4. `setupSheet()`를 **한 번 실행**해 열 구성을 확인합니다. 구 7열이면 F/G에 `phone`, `email`이 삽입되고 기존 동의와 공개 여부는 H/I로 이동합니다. 새 행에는 A~I가 저장됩니다. 기존 연락처는 가능한 항목만 채워집니다.
5. `배포 → 배포 관리 → 기존 웹 앱 → 수정 → 새 버전 → 배포`로 갱신합니다. 웹 앱 URL은 `/exec`로 끝나야 합니다.

최종 시트 열: `id | created_at | lie_text | liar_name | contact | phone | email | consent | public`.

**중요**: GitHub에 업로드하는 `.gs` 파일만 바꿔서는 Apps Script가 자동 수정되지 않습니다. Apps Script 프로젝트에도 직접 반영하고 새 버전으로 배포해야 합니다.

## 3. GitHub에 업로드

저장소: `https://github.com/koldsleep-site/koldsleep-lying-contest`

1. 기존 Flask 소스와 혼동하지 않도록 새 배포본 파일들을 업로드합니다.
2. `.env`, `.dev.vars`, 실제 비밀 값, 개인 연락처가 담긴 파일은 **올리지 않습니다**.
3. `wrangler.jsonc`, `package.json`, `public/index.html`, `src/index.js`가 GitHub 저장소의 지정 경로에 있는지 확인하고 Commit합니다.
4. 예전에 공개 GitHub 저장소에 `.env`를 올렸다면 파일을 지워도 커밋 기록에 남을 수 있습니다. `SECRET`/`GOOGLE_SCRIPT_SECRET`을 **새 값으로 교체**하고 기록 정리를 검토해야 합니다.

## 4. Cloudflare 설정

현재 Workers 프로젝트명 `koldsleep-lying-contest`를 그대로 사용합니다.

`Cloudflare → Workers & Pages → koldsleep-lying-contest → Settings → Build`

- Git repository: `koldsleep-site/koldsleep-lying-contest`
- Production branch: `main`
- Root directory: 저장소 최상위 (`/`)
- Build command: 비워 둠
- Deploy command: `npx wrangler deploy`

이번에는 `wrangler.jsonc`에 정적 폴더 `./public`과 Worker 진입점 `src/index.js`가 명시돼 있으므로 `--assets` 명령을 별도로 추가할 필요가 없습니다.

`Settings → Variables and Secrets`에서 **런타임** 설정으로 등록하세요(빌드 전용 변수와 혼동하지 마세요).

| 이름 | 값 | 유형 |
| --- | --- | --- |
| `GOOGLE_SCRIPT_URL` | Apps Script의 실제 `/exec` URL | Text |
| `GOOGLE_SCRIPT_SECRET` | Apps Script `SECRET`과 **완전히 같은 새 값** | Secret |
| `RECOMMENDATION_FORM_URL` | 심의 추천 Google Form HTTPS 주소(선택) | Text |

`SPREADSHEET_ID`는 Workers에 등록할 필요가 없습니다. Apps Script의 스크립트 속성입니다.

설정 저장 후 새 Commit을 배포하거나 Cloudflare에서 재배포합니다.

## 5. 테스트

터미널에서 프로젝트 폴더로 이동해 실행:

```
node --test tests/*.test.js
```

11개 모의 테스트가 통과하도록 작성했습니다. Workers ↔ 실제 Google Sheets 연결은 인증 정보를 설정한 후 **실제 제출 테스트가 별도로 필요합니다**.

공개 전 확인:

1. `workers.dev` 사이트에서 첫 번째 info 탭, will lie 폼, lies 탭 확인.
2. `contact`에 `010-1234-5678, test@example.com`을 입력해 테스트 제출.
3. Google Sheets에 원문 연락처 E열, 전화 F열, 이메일 G열이 저장되는지 확인.
4. H열 동의 `TRUE`, I열 공개 `FALSE`인지 확인.
5. 테스트 행의 I열 체크박스를 활성화한 후 lies 탭에 거짓말 내용만 노출되는지 확인. 이름과 연락처는 공개 API에서 반환하지 않습니다.
6. 테스트 데이터 삭제 또는 테스트용임을 구분.
7. 설정 완료 후 `lying.koldsleep.com`을 Custom domains에 연결.

**마감:** 2026-10-26 00:00 KST. 서버와 Apps Script 양쪽에서 검사합니다.

## 6. 무엇이 변경되었나

- Flask `app.py`의 `/api/submit`·`/api/random`을 `src/index.js`로 이식.
- 연락처: 전화·메일 어느 하나 또는 동시 입력, 순서 무관, 다양한 구분자 지원. 원본을 E에 보존하고 F/G에 분리 저장.
- 원래 작성된 공고문과 CSS, 텍스트 좌우 반전, 서체 랜덤 효과, 완료 후 다시 제출을 그대로 사용.
- Flask/Jinja의 심의 추천 링크 처리만 `GET /api/config`와 클라이언트 DOM 교체 방식으로 변환. 추천 폼이 설정되지 않으면 기존 안내 문구를 그대로 보여 줍니다.
- 비밀키는 브라우저에 전달하지 않고 Workers 서버에서만 Apps Script에 포함해 요청.
- 제출 시도 중 오류가 나면 기존 입력값과 제출 ID를 유지하여 다시 누르면 중복 저장되지 않도록 설계(기존 Apps Script의 동일 ID 중복 방지 전제).

## 7. 유의 사항

Cloudflare 배포 성공 및 실제 Google Sheets 정상 수신은 아직 확인되지 않았습니다. 모의 테스트가 실제 Google 권한·배포 URL의 정확성을 보장하지는 않습니다.

폰트 바이너리 외에 별도의 이미지/라이브러리 CDN을 사용하지 않습니다. 접속 화면은 원본 HTML의 문구와 구조를 유지합니다.
