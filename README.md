# Phần mềm chiếu LCD — Điều khiển trình chiếu 4 màn hình từ máy tính

Nền tảng giúp bạn **trình chiếu video/ảnh lên nhiều màn hình LCD và TV cùng lúc, điều khiển hoàn toàn từ máy tính** — không cần chép file bằng USB nữa.

## 🚀 Dành cho người mới — không cần biết code

Chỉ cần làm 3 bước, mỗi bước 1 lần duy nhất:

1. **Tải phần mềm này về máy**: trên trang GitHub bấm nút xanh **Code → Download ZIP**, tải về rồi **giải nén** (chuột phải → Extract All).
2. **Cài Node.js** (nền tảng để chạy phần mềm): vào [nodejs.org](https://nodejs.org), bấm nút xanh tải về, cài đặt kiểu Next → Next → Install.
3. **Nháy đúp chuột vào file `CHAY-TREN-WINDOWS.bat`** trong thư mục vừa giải nén (trên máy Mac thì mở file `chay-tren-mac.command`).

Một cửa sổ đen hiện ra và trình duyệt **tự mở trang quản trị**. Xong!

> ⚠️ Những lần sau chỉ cần làm bước 3. **Đừng đóng cửa sổ đen** khi đang trình chiếu — đóng nó là các màn hình ngừng phát. Nếu Windows hỏi về tường lửa (Firewall), bấm **Allow access / Cho phép**.

## Cách hoạt động

```
                      ┌──────────────────────────┐
                      │   MÁY TÍNH CỦA BẠN       │
                      │   (chạy server này)      │
                      │   Trang quản trị :3000   │
                      └───────────┬──────────────┘
                                  │  Wi-Fi / mạng LAN
        ┌──────────────┬──────────┴────┬───────────────┐
        ▼              ▼               ▼               ▼
   LCD 1 (dọc)    LCD 2 (ngang)      TV 1            TV 2
   1080x1920      1920x1080       1920x1080        1920x1080
   mở /screen/s1  mở /screen/s2   mở /screen/s3    mở /screen/s4
```

- Máy tính của bạn chạy **server trung tâm** kèm **trang quản trị**: tải video/ảnh lên, xếp playlist cho từng màn hình, bấm phát / dừng / chuyển nội dung.
- Mỗi màn hình chỉ cần **mở 1 đường link bằng trình duyệt** (trình duyệt có sẵn của Smart TV, hoặc Android TV box / máy tính mini / điện thoại cũ cắm vào màn hình qua HDMI).
- Nội dung được đẩy xuống màn hình **ngay lập tức** qua WebSocket — đổi playlist là màn hình đổi theo, không cần chạm vào màn hình.

## Yêu cầu

1. **Máy tính** (Windows / macOS / Linux) cài [Node.js](https://nodejs.org) bản 18 trở lên.
2. **Mỗi màn hình cần một thiết bị có trình duyệt** kết nối cùng mạng Wi-Fi/LAN với máy tính:
   - Smart TV: dùng trình duyệt có sẵn của TV.
   - Màn hình LCD thường (không có hệ điều hành): cắm thêm **Android TV box** (~300-500k) hoặc máy tính mini / Raspberry Pi / điện thoại cũ qua cổng HDMI.
3. Tất cả thiết bị **cùng một mạng** với máy tính.

## Cài đặt và chạy

```bash
# Trong thư mục dự án
npm install
npm start
```

Server in ra địa chỉ, ví dụ:

```
Trang quản trị:   http://localhost:3000/
Trong mạng LAN:   http://192.168.1.10:3000/
```

### Trên máy tính

Mở **http://localhost:3000** — đây là trang quản trị. Tải video/ảnh lên ở mục "Thư viện nội dung" (kéo thả được nhiều file cùng lúc).

### Trên từng màn hình

Mở trình duyệt của màn hình/TV và truy cập (thay `192.168.1.10` bằng IP máy tính của bạn — trang quản trị có nút 📋 sao chép sẵn từng link):

| Màn hình | Đường link |
|---|---|
| LCD 1 — dọc 1080x1920 | `http://192.168.1.10:3000/screen/s1` |
| LCD 2 — ngang 1920x1080 | `http://192.168.1.10:3000/screen/s2` |
| TV 1 — 1920x1080 | `http://192.168.1.10:3000/screen/s3` |
| TV 2 — 1920x1080 | `http://192.168.1.10:3000/screen/s4` |

Khi màn hình đã kết nối, chấm tròn trên trang quản trị chuyển **xanh** và mọi nội dung bạn gán sẽ tự phát, lặp vòng liên tục.

> 💡 Chạm/nhấp một lần vào màn hình để bật chế độ toàn màn hình.

## Tính năng

- **4 màn hình độc lập** — mỗi màn hình một playlist riêng, hoặc bấm "📡 Tất cả" để phát cùng nội dung trên cả 4.
- **Điều khiển tức thì**: phát ▶️, tạm dừng ⏸️, dừng ⏹️, chuyển bài ⏮️⏭️, tải lại 🔄, và "📺 Chiếu ngay" để chen một nội dung bất kỳ.
- **Playlist lặp vòng**: video phát hết tự chuyển bài; ảnh hiển thị theo số giây cài đặt.
- **Màn hình dọc**: chọn "Xoay 90°/270°" cho màn hình LCD dọc nếu thiết bị phát xuất hình ngang.
- **Chế độ hiển thị**: Vừa khung / Phủ kín / Kéo giãn cho từng màn hình.
- **Trạng thái thời gian thực**: biết màn hình nào đang online, đang phát nội dung gì.
- **Tự phục hồi**: màn hình mất Wi-Fi sẽ tự kết nối lại; playlist được lưu trên máy tính (`data/db.json`), khởi động lại server không mất dữ liệu.

## Mẹo vận hành

- **Giữ máy tính không ngủ** khi đang trình chiếu (màn hình lấy nội dung trực tiếp từ máy tính): tắt chế độ Sleep trong cài đặt nguồn điện.
- **Đặt IP tĩnh cho máy tính** (trong cài đặt router) để đường link trên các màn hình không bị đổi khi khởi động lại.
- **Tường lửa**: nếu màn hình không kết nối được, hãy cho phép Node.js/cổng 3000 qua tường lửa (Windows sẽ hỏi ngay lần chạy đầu — chọn Allow).
- **Tự chạy khi mở màn hình**: trên Android box có thể dùng ứng dụng "Fully Kiosk Browser" đặt đường link làm trang chủ và tự mở khi khởi động.
- **Âm thanh**: trình duyệt thường chặn tự phát có tiếng; mặc định video phát ở chế độ tắt tiếng. Muốn có tiếng: bỏ chọn "Tắt tiếng" trên trang quản trị và chạm một lần vào màn hình đó.
- **Định dạng video** nên dùng **MP4 (H.264)** — mọi trình duyệt/TV đều phát được.

## Cấu trúc dự án

```
server.js          Server trung tâm (Express + WebSocket)
public/
  index.html       Trang quản trị
  admin.js/.css    Logic + giao diện trang quản trị
  player.html      Trang trình chiếu chạy trên màn hình
  player.js        Logic phát playlist, nhận lệnh điều khiển
data/              (tự tạo khi chạy) file media + db.json — không đưa lên git
```
