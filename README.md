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

## Màn hình ở xa, không chung Wi-Fi với máy tính

Khi màn hình đặt ở tòa nhà khác / chi nhánh khác, không thể chung mạng với máy tính, có 2 cách:

### Cách 1 (khuyên dùng): Đưa server lên Internet — màn hình ở đâu cũng điều khiển được

Thay vì chạy server trên máy tính của bạn, thuê một "máy tính trên mây" chạy 24/7 (~150–200k/tháng). Khi đó:

- Mỗi màn hình chỉ cần **có Internet là được** — Wi-Fi của tòa nhà đó, hoặc cắm router 4G có SIM, không liên quan gì đến mạng của bạn.
- Bạn mở trang quản trị **từ bất kỳ đâu**, kể cả trên điện thoại.
- Không cần giữ máy tính bật — server trên mây chạy suốt.

Các bước với [Render.com](https://render.com) (dự án đã có sẵn file cấu hình `render.yaml`):

1. Tạo tài khoản GitHub (nếu chưa có) và đưa code này lên tài khoản của bạn.
2. Vào **render.com** → đăng ký bằng tài khoản GitHub → **New + → Blueprint** → chọn repository này.
3. Render hỏi **ADMIN_PASSWORD** → tự đặt một mật khẩu (đây là mật khẩu mở trang quản trị — khi server ở trên Internet bắt buộc phải có).
4. Bấm tạo, đợi vài phút → bạn nhận địa chỉ dạng `https://phan-mem-chieu-lcd.onrender.com`.
5. Trên các màn hình mở `https://.../screen/s1` (s2, s3, s4). Trên máy/điện thoại của bạn mở `https://.../` và đăng nhập.

> Gói Starter của Render (~7$/tháng) kèm ổ cứng lưu video. Có thể dùng nhà cung cấp VPS Việt Nam (Vietnix, AZDIGI...) nếu muốn thanh toán nội địa — chạy bằng Docker với file `Dockerfile` có sẵn, nhớ đặt biến `ADMIN_PASSWORD`.

### Cách 2 (miễn phí): Tailscale — nối máy tính và màn hình thành "mạng ảo" chung

Hoàn toàn miễn phí, không cần thuê server, **không cần mật khẩu** (mạng ảo là riêng tư, chỉ thiết bị bạn đăng nhập mới vào được). Máy tính của bạn vẫn là server như bình thường.

1. **Trên máy tính**: vào [tailscale.com/download](https://tailscale.com/download) → tải và cài Tailscale → đăng nhập bằng tài khoản Google của bạn.
2. **Trên từng Android box** của màn hình: mở **CH Play** → cài ứng dụng **Tailscale** → đăng nhập **cùng tài khoản Google đó** → bật công tắc kết nối (Connect/VPN).
3. Mở phần mềm chiếu trên máy tính như bình thường (`CHAY-TREN-WINDOWS.bat`). Trên trang quản trị, ô chọn địa chỉ ở góc phải sẽ có thêm dòng **"100.x.x.x (Tailscale — cho màn hình ở xa)"** — chọn nó, link của từng màn hình sẽ đổi theo, bấm 📋 sao chép.
4. Trên màn hình ở xa, mở trình duyệt và vào link đó (dạng `http://100.x.x.x:3000/screen/s1`). Xong — dù màn hình ở tòa nhà khác, thành phố khác vẫn kết nối được.

Lưu ý:
- Máy tính phải **đang bật** thì màn hình mới nhận được nội dung **mới**; nội dung đã tải về bộ nhớ thì mất kết nối vẫn phát bình thường.
- Trình duyệt có sẵn của Smart TV **không cài được Tailscale** — màn hình ở xa cần chạy bằng Android box (mua 1 lần ~300–500k, không tốn phí hằng tháng).
- Gói miễn phí của Tailscale cho tối đa 100 thiết bị — quá đủ cho 4 màn hình.

## Màn hình ở nơi sóng yếu (thang máy, tầng hầm...)

Màn hình **tự tải toàn bộ nội dung về bộ nhớ của thiết bị** ngay khi bắt được sóng:

- Khi **mất mạng**, màn hình vẫn phát playlist bình thường từ bộ nhớ — không đứng hình, không màn đen.
- Khi **có sóng trở lại** (ví dụ thang máy dừng ở tầng có Wi-Fi), màn hình tự kết nối lại và tải nội dung mới bạn vừa thay đổi.
- Trên trang quản trị có dòng **"💾 Đã lưu x/y vào máy"** — khi đủ số lượng nghĩa là màn hình đó an toàn để mất mạng.

Chỉ cần thiết bị bắt được sóng **thỉnh thoảng** là đủ để nhận nội dung mới. Nếu vị trí đó **hoàn toàn không có sóng**, cần một trong các cách sau:

1. **Đặt bộ phát Wi-Fi gần giếng thang** (repeater/access point đặt ở phòng máy thang hoặc tầng gần nhất) — rẻ và dễ nhất.
2. **Nhờ kỹ thuật thang máy kéo dây mạng qua cáp hành trình** (traveling cable) của thang — ổn định nhất.
3. **Gắn router 4G có SIM data** ngay trong cabin thang máy.

Lưu ý: nếu thiết bị trong thang **bị mất điện và khởi động lại đúng lúc không có sóng**, nó cần bắt được sóng một lần để mở lại trang (nội dung thì đã có sẵn trong bộ nhớ). Dùng ứng dụng **Fully Kiosk Browser** trên Android box — ứng dụng này tự mở lại trang và tự thử lại liên tục đến khi có sóng.

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
