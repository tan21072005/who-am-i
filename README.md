# Bông Hoa Live (Who Am I)

Hệ thống linh vật ảo tương tác thời gian thực cho TikTok LIVE / OBS / TikTok LIVE Studio, hỗ trợ AI trò chuyện, nhận diện bình luận, cử động theo ngữ cảnh và bộ đọc giọng nói tiếng Việt bằng GPU (VieNeu CUDA).

---

## Tính năng chính

- **Linh vật ảo tương tác (Bông)**: Cử động đa dạng theo cảm xúc, cử chỉ đồng bộ với lời thoại và âm thanh hiệu ứng.
- **Trí tuệ nhân tạo (LLM)**:
  - Hỗ trợ kết nối **9Router** hoặc **Google Gemini**.
  - Tự động nhận diện bình luận, phân loại ý định, trả lời thông minh bằng tiếng Việt gũi, dí dỏm.
- **Tổng hợp giọng nói tiếng Việt (TTS)**:
  - **VieNeu · GPU NVIDIA CUDA**: Tăng tốc tạo giọng tự nhiên bằng card đồ họa rời (giọng Hải Đăng siêu tốc, mượt mà).
  - **Edge TTS**: Giọng đọc trực tuyến Microsoft Edge (Hoài Mỹ, Nam Minh).
  - **eSpeak NG**: Giọng đọc ngoại tuyến dự phòng khi mất mạng hoặc không có GPU.
- **Trợ lý LIVE 30 phút (Kịch bản)**:
  - Soạn kịch bản theo phút bằng AI hoặc tự nhập.
  - Tính năng **Tạo tiếng trước (Pre-generate Audio)**: GPU tổng hợp và lưu trước toàn bộ các đoạn thoại trong vài giây, giúp buổi live diễn ra liên tục, không phụ thuộc vào độ trễ mạng hay API.
- **Kết nối TikTok LIVE**:
  - Hỗ trợ kết nối phòng live thông qua **Euler Stream (Sign API)**.
  - Tự động đọc bình luận, thả tim, tặng quà và tương tác với người xem.
- **Hỗ trợ đa kênh**: Chạy song song 2 kênh (Bông Đào, Bông Vàng) với cấu hình và cổng riêng biệt.

---

## Cấu trúc thư mục

```
who-am-i/
├── app.py                     # Máy chủ web & xử lý logic trung tâm
├── giong_noi.py               # Module tổng hợp giọng nói (VieNeu, Edge TTS, eSpeak)
├── router_api.py              # Kết nối API 9Router
├── thiet_lap.py               # Quản lý cài đặt cấu hình kênh
├── tro_ly.py                  # Quản lý kịch bản Trợ lý 30 phút & cache âm thanh
├── tuong_tac.py               # Xử lý bình luận TikTok, cử chỉ và hàng đợi
├── bang-dieu-khien.html       # Giao diện Bàn điều khiển Web
├── overlay.html               # Trang hiển thị linh vật (OBS / TikTok LIVE Studio Link)
├── profiles/                  # Cấu hình từng kênh (kenh-1.json, kenh-2.json)
├── effects/                   # Dữ liệu hiệu ứng âm thanh
├── sound-data/                # Dữ liệu âm thanh và kịch bản đã tạo (runtime)
├── 01-MO-THU.bat              # Mở thử giao diện trên trình duyệt
├── 02-CAI-CONG-CU.bat         # Cài đặt môi trường Python cơ bản
├── 03-CHAY-KENH-1.bat         # Khởi chạy Bông Kênh 1
├── 04-CHAY-HAI-KENH.bat       # Khởi chạy đồng thời 2 kênh
├── 05-KIEM-TRA-TIENG.bat      # Kiểm tra giọng đọc
├── 06-TEST-9ROUTER.bat        # Kiểm tra kết nối 9Router
└── 07-CAI-VIENEU-GPU.bat      # Cài đặt PyTorch CUDA và mô hình VieNeu GPU
```

---

## Hướng dẫn cài đặt & Khởi chạy

### 1. Chuẩn bị môi trường
- Hệ điều hành: Windows 10/11 64-bit.
- Python 3.10 trở lên.
- Card đồ họa NVIDIA có hỗ trợ CUDA (cho VieNeu TTS).

### 2. Cài đặt thư viện
- Chạy `02-CAI-CONG-CU.bat` để tạo môi trường ảo `.venv` và cài đặt các phụ thuộc cơ bản.
- Chạy `07-CAI-VIENEU-GPU.bat` để cài đặt PyTorch CUDA và mô hình giọng nói VieNeu GPU.

### 3. Cấu hình API Key
- Tạo file `.env` từ `.env.example`:
```ini
GEMINI_API_KEY=your_gemini_api_key
ROUTER_API_KEY=your_9router_api_key
SIGN_API_KEY=your_eulerstream_sign_api_key
HF_HOME=D:\hf-cache
```

### 4. Khởi chạy
- Chạy `03-CHAY-KENH-1.bat` để mở Kênh 1.
- Truy cập Bàn điều khiển tại: [http://127.0.0.1:8765/](http://127.0.0.1:8765/)
- Nguồn phát âm thanh (Edge/Cốc Cốc): `http://127.0.0.1:8765/overlay.html?setup=1`
- Nguồn hình ảnh (TikTok LIVE Studio / OBS Link): `http://127.0.0.1:8765/overlay.html?mirror=1&captions=1`
