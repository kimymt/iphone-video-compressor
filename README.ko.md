# 동영상 압축 — iPhone Video Compressor

[日本語](./README.md) | [English](./README.en.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | **한국어**

iPhone에서 촬영한 동영상을 서버에 업로드하지 않고 iPhone 안에서만 압축하는 앱입니다.

🔗 **https://ivc.mymt.casa**

---

## 지원 기기

- **iOS 26 이상 iPhone** (Safari)
- iOS 25 이하는 기술적으로 동작하지 않습니다 (실행 시 전용 화면으로 안내됩니다)

> 왜 iOS 26 한정인가요?
> iPhone에서 동영상의 오디오를 재인코딩하는 데 필요한 `AudioEncoder` API가 iOS 26부터 사용 가능하기 때문입니다.

## 지원 언어

- 日本語 / English / 简体中文 / 繁體中文 / 한국어 5개 언어
- iPhone 언어 설정에 따라 자동 전환됩니다 (설정 → 일반 → 언어 및 지역)
- 앱 내 설정 화면(우측 상단 톱니바퀴 아이콘)에서 수동 선택도 가능합니다

---

## 사용 방법

### 1. 홈 화면에 추가 (최초 1회만)

1. iPhone **Safari**에서 https://ivc.mymt.casa 열기
2. 화면 하단의 공유 버튼 (□↑) 탭
3. 메뉴에서 **「홈 화면에 추가」** 선택
4. 홈 화면 아이콘에서 실행

> Safari 탭에서 바로 사용할 수도 있지만, 홈 화면에서 실행하면 전체 화면으로 동작하며 처리 중 동작이 더 안정적입니다.

### 2. 동영상 압축하기

1. **「동영상 선택」** 버튼을 탭하여 사진 라이브러리에서 동영상 선택
   - 여러 개 선택도 가능합니다. 모두 큐에 들어가 순서대로 처리됩니다.
2. 자동으로 압축이 시작됩니다
   - 진행률 바와 예상 남은 시간이 표시됩니다.
3. 완료되면 **「공유」** 탭
   - 사진 라이브러리 저장, AirDrop, 메시지 / 메일 전송, 파일 앱 저장 등을 선택할 수 있습니다.

### 3. 프리셋 (화질과 압축률 균형)

헤더 우측 상단 **톱니바퀴 아이콘**에서 설정 시트를 열어 프리셋을 변경할 수 있습니다. 기본값은 **「표준 (HEVC)」** 입니다.

| 프리셋 | 이런 때 사용 |
|---|---|
| 최고 화질 (HEVC) | 편집 원본 소재로 보관하고 싶을 때 |
| 고화질 (HEVC) | TV나 PC에서 제대로 보고 싶을 때 |
| **표준 (HEVC)** ★ 기본 | 일상 사용, 저장 공간 절약 |
| 경량 (HEVC) | LINE / Slack에 첨부 |
| 호환 우선 (H.264) | Android나 구형 PC에 전달 |
| 최소 (H.264) | 메일에 첨부 |

> HEVC 인코딩을 지원하지 않는 기기에서는 H.264 프리셋만 표시됩니다.

---

## 자주 발생하는 문제

### 완료음(차임)이 울리지 않음

iPhone 본체 측면 스위치와 음량을 확인해 주세요.

1. **Ring/Silent 스위치를 「Ring」 쪽으로** (오렌지색이 보이지 않는 상태)
2. 음량 올리기
3. **「동영상 선택」 버튼을 한 번 탭한 후 처리 시작**

> iOS 사양상 Silent 모드일 때는 웹 앱에서 소리를 낼 수 없습니다 (앱 측에서 우회 불가). 또한 오디오 재생을 위해서는 사용자가 화면을 한 번 탭해 둘 필요가 있습니다 (첫 탭이 "소리 재생 허가"가 됩니다).

### 처리 중 화면이 어두워짐

헤더 우측 상단 배지를 확인해 주세요.

- **「화면 ON」** (태양 아이콘, 오렌지색) → 화면 잠금 방지가 활성화되어 있습니다. 문제 없음.
- **「화면 ON 실패」** (경고 아이콘, 빨간색) → 화면 잠금 방지 획득에 실패. 에러 이름이 표시되므로 스크린샷을 보내 주시면 개선에 도움이 됩니다.

> 3~5분 길이의 동영상도 「화면 ON」 배지가 사라지지 않으면 끝까지 처리됩니다.

### 「저장 공간이 부족합니다」라고 표시됨

압축 처리에는 **입력 동영상 크기의 2.5배 이상**의 여유 저장 공간이 필요합니다.

- **설정 → 일반 → iPhone 저장 공간**에서 불필요한 앱·사진·동영상을 삭제해 주세요.
- 앱 내에서 완료된 동영상은 「공유」로 사진 라이브러리에 저장한 후 「삭제」 버튼으로 내부 저장 공간에서 제거할 수 있습니다.

### 「이 동영상은 처리할 수 없습니다」라고 표시됨

동영상 파일이 손상되었거나 지원되지 않는 코덱일 가능성이 있습니다.

- **iPhone 설정 → 카메라 → 포맷을 「고효율」** 로 설정하여 촬영한 동영상이 가장 원활하게 처리됩니다.
- 「호환성 우선」 설정으로 촬영한 동영상도 처리할 수 있지만 파일 크기가 커지기 쉽습니다.

---

## 개인정보 보호

- **동영상은 iPhone 밖으로 나가지 않습니다.**
- 모든 처리는 iPhone의 Safari 안에서 완결됩니다.
- 서버 업로드, 로그 기록, 인증, 사용자 추적은 일절 없습니다.
- 출력 동영상에는 EXIF나 **위치 정보도 포함되지 않습니다** (개인정보 보호를 위해 자동 삭제).

서비스 자체는 정적 파일(HTML / JavaScript)이 Cloudflare Pages에서 배포될 뿐이며, 동영상 데이터를 받는 API는 존재하지 않습니다.

---

## 업데이트

홈 화면에서 실행하면 최신 버전이 있을 때 자동으로 업데이트됩니다.

새 기능이 반영되지 않을 경우, 홈 화면 아이콘을 길게 눌러 「삭제」 → Safari에서 다시 열어 홈 화면에 재추가해 주세요 (오래된 캐시가 남은 경우의 확실한 해결책).

---

## 알려진 제한 사항

- **iPad 가로 화면 / 큰 화면 레이아웃**: 현재 미지원
- **1GB 초과 출력**: iOS 공유 메뉴에서 실패하기 쉬워 자동으로 다운로드 형식으로 전환
- **편집 기능 / ComparePreview**: 없음 (압축에 특화)
- **중단 지점부터 재개**: 처리 중 앱이 종료되면 처음부터 다시 시작됩니다

---

## 피드백

버그 보고나 기능 요청은 GitHub Issues로:

🐛 https://github.com/kimymt/iphone-video-compressor/issues

실기기에서의 문제 보고에는 에러 화면 스크린샷과 iOS 버전(설정 → 일반 → 정보)을 함께 보내 주시면 도움이 됩니다.

---

<details>
<summary>개발자용 정보</summary>

소스 코드: https://github.com/kimymt/iphone-video-compressor

기술 사양 및 구현 단계 상세는 [CLAUDE.md](./CLAUDE.md), 미착수 항목은 [TODOS.md](./TODOS.md)를 참조해 주세요.

### 기술 스택

Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS + Zustand + WebCodecs API + mediabunny + OPFS + IndexedDB + vite-plugin-pwa.

### 로컬 개발

```bash
npm install
npm run dev           # http://localhost:5173 (dev에서도 Service Worker 활성)
npm run build         # tsc -b + vite build
npm run preview       # vite preview → http://localhost:4173
```

### 테스트

```bash
npm test                    # Vitest (unit)
npm run test:e2e            # Playwright (dev 서버 사용)
npm run test:e2e:offline    # build + preview로 오프라인 검증
```

### iPhone 실기기 동작 확인

Cloudflare Tunnel로 HTTPS URL을 발급받아 iPhone Safari에서 엽니다.

```bash
# Terminal A
npm run dev
# Terminal B
cloudflared tunnel --url http://localhost:5173
# → 출력된 xxx.trycloudflare.com을 iPhone Safari에서 열기
```

Vite 5.4.12+의 호스트 제한에 따라 `vite.config.ts`의 `server.allowedHosts`에 `.trycloudflare.com`이 포함되어 있습니다.

### 배포

`main`으로 push하면 Cloudflare Pages가 자동으로 빌드·배포합니다.

- 프로덕션: https://ivc.mymt.casa
- 대체 URL (동일 빌드): https://iphone-video-compressor.pages.dev
- Build command: `npm run build` / Build output: `dist` / Framework preset: None
- Pull Request마다 Preview Deployment가 자동 생성됩니다

### 테스트 픽스처 재생성

`tests/fixtures/`의 동영상은 commit되어 있습니다. 재생성이 필요한 경우 ffmpeg과 소재를 준비하여 아래 명령으로 작성할 수 있습니다 (자세한 사항은 `tests/fixtures/README.md`).

```bash
ffmpeg -i source-portrait.mov -t 1 -b:v 500k -c:v hevc_videotoolbox -tag:v hvc1 \
  tests/fixtures/portrait-rotation-1s.mov

ffmpeg -i source.mov -t 1 -vf scale=1920:1080 -c:v libx264 -profile:v baseline \
  -b:v 800k tests/fixtures/landscape-1080p-baseline-h264-1s.mp4

ffmpeg -i source-hdr.mov -t 1 -c:v hevc_videotoolbox -tag:v hvc1 \
  -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc \
  tests/fixtures/landscape-hevc-hdr-1s.mov

head -c 30000 tests/fixtures/landscape-1080p-baseline-h264-1s.mp4 \
  > tests/fixtures/corrupt-truncated.mp4
```

### 아이콘

`public/icons/`의 4개 PNG (192 / 512 / maskable / apple-touch-icon 180)는 현재 ffmpeg으로 생성한 더미 (`#0a0a0a` 배경 + `#0a84ff` 중앙 블록)입니다. 릴리즈 전에 디자이너가 작성한 소재로 교체해 주세요.

</details>

---

## 라이선스

[MIT License](./LICENSE) — Copyright (c) 2026 kimymt
