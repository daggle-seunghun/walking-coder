# 📱 Claude Mobile Interface - Test Guide

## 🧪 Issue #3: Real-Time Command Execution 테스트 가이드

### 접속 방법
1. 브라우저에서 http://localhost:8080 접속
2. 개발자 도구(F12) > Network 탭에서 WebSocket 연결 확인
3. 모바일 뷰로 전환 (Chrome: Ctrl+Shift+M)

---

## ✅ 테스트 항목

### 1. 기본 명령 실행 테스트

#### 1.1 간단한 명령
```
테스트 입력: Hello, Claude!
예상 결과: Claude의 응답이 실시간으로 스트리밍되며 표시
확인 사항: 
- 타이핑 인디케이터 표시 여부
- 스트리밍 커서(▊) 애니메이션
- 전송 버튼 비활성화/활성화
```

#### 1.2 코드 생성 요청
```
테스트 입력: Write a Python function to calculate fibonacci numbers
예상 결과: 
- 코드 블록이 구문 강조와 함께 표시
- Prism.js 하이라이팅 적용 확인
```

#### 1.3 긴 응답 테스트
```
테스트 입력: Explain quantum computing in detail with examples
예상 결과:
- 긴 텍스트가 실시간으로 스트리밍
- 스크롤이 자동으로 하단 유지
- 스트리밍 중단 없이 완료
```

---

### 2. 파일 첨부 기능 테스트

#### 2.1 텍스트 파일 첨부
1. 📎 버튼 클릭
2. 텍스트 파일(.txt, .py, .js 등) 선택
3. 메시지와 함께 전송: "Analyze this file"
```
예상 결과:
- "File uploaded: [filename]" 시스템 메시지
- 파일 내용이 컨텍스트에 포함되어 분석
- 첨부 인디케이터 표시 (📎 1 file(s) attached)
```

#### 2.2 다중 파일 첨부
1. 여러 파일 동시 선택 (Ctrl/Cmd + 클릭)
2. "Compare these files" 메시지 전송
```
예상 결과:
- 모든 파일 업로드 확인 메시지
- 다중 파일 컨텍스트 처리
```

#### 2.3 대용량 파일 테스트
```
16MB 이상 파일 첨부 시도
예상 결과: 파일 크기 제한 에러 메시지
```

---

### 3. 명령 제어 기능

#### 3.1 명령 취소
1. 긴 작업 요청: "Count to 100 slowly"
2. 실행 중 Cancel 버튼 클릭
```
예상 결과:
- "Command cancelled" 시스템 메시지
- 전송 버튼 재활성화
- 스트리밍 중단
```

#### 3.2 히스토리 관리
1. 여러 명령 실행
2. History 버튼 클릭 또는 왼쪽 가장자리에서 스와이프
```
테스트 항목:
- 히스토리 패널 열기/닫기
- 이전 명령 클릭하여 재사용
- 타임스탬프 표시 확인
```

#### 3.3 Clear 기능
1. Clear 버튼 클릭
```
예상 결과:
- 화면의 모든 메시지 삭제
- "Chat cleared" 시스템 메시지
- 히스토리는 세션별로 관리
```

---

### 4. 세션 관리 테스트

#### 4.1 다중 탭/브라우저
1. 새 탭에서 http://localhost:8080 열기
2. 각 탭에서 다른 명령 실행
```
확인 사항:
- 각 세션이 독립적으로 작동
- 세션별 히스토리 분리
- 동시 실행 가능
```

#### 4.2 재연결 테스트
1. 네트워크 연결 끊기 (개발자 도구 > Network > Offline)
2. 다시 연결
```
예상 결과:
- 연결 상태 인디케이터 변경 (빨강 → 초록)
- "Disconnected" → "Connected" 상태 텍스트
```

---

### 5. Quick Commands 테스트

#### 5.1 각 버튼 기능 확인
- **Help**: /help 명령 자동 실행
- **Clear**: 채팅 화면 초기화
- **History**: 히스토리 패널 열기
- **Cancel**: 실행 중인 명령 취소
- **Explain**: 입력창에 "explain " 자동 입력
- **Fix**: 입력창에 "fix " 자동 입력
- **Test**: 입력창에 "test " 자동 입력
- **Refactor**: 입력창에 "refactor " 자동 입력

---

### 6. 스트리밍 출력 테스트

#### 6.1 실시간 스트리밍 확인
```
테스트 입력: List 10 programming languages with descriptions
예상 동작:
1. 타이핑 인디케이터 표시 (••• 애니메이션)
2. 첫 출력 시 인디케이터 숨김
3. 텍스트가 한 줄씩 실시간 추가
4. 스트림 커서(▊) 깜빡임
5. 완료 시 커서 제거
```

---

### 7. 에러 처리 테스트

#### 7.1 Claude CLI 없을 때
```
Claude CLI가 설치되지 않은 환경에서 테스트
예상 결과: "Claude CLI not found. Please ensure Claude is installed and in PATH."
```

#### 7.2 타임아웃 테스트
```
60초 이상 걸리는 작업 요청
예상 결과: "Command timed out after 60 seconds"
```

#### 7.3 네트워크 에러
```
서버 중지 후 명령 전송
예상 결과: WebSocket 연결 끊김 표시
```

---

## 🔍 개발자 도구 확인 사항

### Console 탭
- WebSocket 연결 로그: "Connected to server"
- 세션 ID 확인
- 에러 메시지 없음

### Network 탭
- WebSocket (WS) 연결 확인
- socket.io 프레임 확인
- 메시지 타입:
  - `42["command",{...}]` - 명령 전송
  - `42["stream_output",{...}]` - 스트리밍 데이터
  - `42["response",{...}]` - 최종 응답

### Application 탭
- Session Storage 확인
- 임시 파일 업로드 디렉토리

---

## 📊 성능 테스트

### 응답 시간 측정
1. 간단한 명령: < 1초
2. 복잡한 쿼리: < 3초
3. 파일 첨부: 파일 크기에 비례

### 메모리 사용량
- 개발자 도구 > Performance > Memory
- 장시간 사용 시 메모리 누수 확인

---

## 🐛 알려진 이슈 및 제한사항

1. **파일 크기 제한**: 16MB
2. **타임아웃**: 60초
3. **동시 명령**: 세션당 1개 (큐 시스템)
4. **브라우저 호환성**: 
   - Chrome/Edge: 완벽 지원
   - Safari: WebSocket 일부 제한
   - Firefox: 음성 입력 제한

---

## 💡 테스트 팁

1. **모바일 시뮬레이션**
   - Chrome DevTools > Device Mode
   - iPhone 12 Pro 선택 권장
   - 터치 시뮬레이션 활성화

2. **네트워크 조절**
   - DevTools > Network > Throttling
   - Slow 3G로 테스트

3. **로그 확인**
   ```bash
   # Flask 서버 로그
   tail -f flask.log
   
   # 실시간 로그 보기
   uv run python app.py
   ```

---

## ✅ 체크리스트

- [ ] 기본 메시지 전송/수신
- [ ] 실시간 스트리밍 출력
- [ ] 파일 첨부 (단일/다중)
- [ ] 명령 취소 기능
- [ ] 히스토리 관리
- [ ] Quick Commands 모든 버튼
- [ ] 세션 독립성
- [ ] 재연결 처리
- [ ] 에러 메시지 표시
- [ ] 모바일 반응형 UI
- [ ] 스와이프 제스처
- [ ] 코드 구문 강조

---

## 📝 버그 리포트 템플릿

```markdown
### 문제 설명
[간단한 설명]

### 재현 단계
1. 
2. 
3. 

### 예상 동작
[예상했던 결과]

### 실제 동작
[실제 발생한 결과]

### 환경
- 브라우저: 
- OS: 
- Claude CLI 버전: 

### 스크린샷/로그
[있다면 첨부]
```