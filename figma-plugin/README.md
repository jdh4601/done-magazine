# D.one Figma 가져오기

1. ZIP을 풀고 Figma 데스크톱 앱에서 디자인 파일을 연다.
2. Plugins → Development → Import plugin from manifest…에서 이 폴더의 manifest.json을 선택한다.
3. Development → D.one Magazine Import를 실행한다.
4. 웹 앱에서 받은 D.one-magazine.done.json을 선택한다.

인터넷이나 API 키 없이 동작한다. 기존 프레임을 수정하지 않고 빈 위치에 새 프레임을 생성한다. 제목과 본문은 편집 가능한 텍스트이며 사진, 피사체 PNG, 도형, 그라데이션, 질감은 별도 레이어다. 누끼 외곽은 PNG 알파 마스크로 유지되며 벡터 경로는 아니다.

Pretendard Regular·Bold·ExtraBold와 Playfair Display가 필요하다. Figma에서 글꼴을 사용할 수 없으면 public/fonts에 포함된 글꼴을 설치한다. 표지 제목은 ExtraBold 90px, 본문 제목은 Bold 55px, 본문은 Regular 30px이다. 본문 제목과 본문 사이의 레이어 간격은 64px이다. 마지막 페이지는 #7.jpg 템플릿을 그대로 담은 이미지 레이어다. 글꼴이 없으면 오류를 표시하며 생성 중인 프레임을 정리한다.
