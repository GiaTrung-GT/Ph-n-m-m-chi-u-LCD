# Công cụ ghép mặt nhân viên vào ấn phẩm

Bạn tải **ảnh mẫu** (ví dụ poster "KPI Có Nhà") lên một lần. Nhân viên mở link, chọn **ảnh chân dung + giới tính**, bấm **Tạo ảnh**. AI (Google Gemini, "Nano Banana") sẽ thay người trong ảnh mẫu bằng khuôn mặt của nhân viên, giữ nguyên bối cảnh.

- Trang nhân viên: `https://<địa-chỉ>/`
- Trang quản trị: `https://<địa-chỉ>/admin`
- Ảnh chân dung của nhân viên **không bị lưu** trên server.

## 1. Lấy khóa AI (tạo khóa miễn phí, trả tiền theo lượt dùng)

1. Vào <https://aistudio.google.com/apikey>, đăng nhập Gmail công ty, bấm **Create API key**.
2. **Bắt buộc bật thanh toán (Billing)** cho project đó: bấm **Set up billing** cạnh khóa trong AI Studio. Gói miễn phí của Google cho 0 lượt tạo ảnh, và gói Google AI Pro/One (app Gemini) **không** tính cho API. Mỗi ảnh tốn khoảng 1.000–2.000 VNĐ.
3. Giữ kín khóa này. Không gửi cho nhân viên.

## 2. Đưa lên Internet (Render.com)

1. Đăng nhập <https://render.com> bằng GitHub, chọn **New + → Blueprint**, rồi chọn repository này.
2. Render đọc file `render.yaml` và tạo dịch vụ `cong-cu-ghep-mat`. Khi được hỏi, nhập:
   - `GEMINI_API_KEY`: khóa vừa lấy ở bước 1
   - `ADMIN_PASSWORD`: mật khẩu trang quản trị do bạn tự đặt
3. Đợi khoảng 3 phút cho đến khi Render báo *Live*. Bạn sẽ có link dạng `https://cong-cu-ghep-mat.onrender.com`.

> Gói `starter` (~7 USD/tháng) có ổ đĩa lưu ảnh mẫu. Gói miễn phí sẽ **mất ảnh mẫu** mỗi lần server khởi động lại.

## 3. Cài ảnh mẫu (làm 1 lần)

Mở `/admin` và đăng nhập, sau đó:

1. **Ảnh mẫu**: tải poster gốc lên. Tỉ lệ khung được tự nhận theo ảnh.
2. **Lớp chữ & logo** (nên làm): trong Photoshop, tắt layer nền và người, chỉ giữ chữ, checklist, logo. Chọn **Export → PNG** (nền trong suốt, cùng kích thước poster) rồi tải file lên. Lớp này được đè lên ảnh AI nên chữ tiếng Việt luôn đúng.
   - Nếu chữ nằm trên nền kính mờ (như khung checklist), hãy giữ luôn khung kính đó trong lớp PNG.
3. **Mã truy cập**: đặt một mã, ví dụ `skyzen2026`, để người ngoài có link cũng không dùng được và không tốn tiền API.
4. **Prompt**: có thể sửa. `{{gioi_tinh}}` sẽ tự được thay bằng Nam hoặc Nữ.

Sau đó bấm **Sao chép** link và gửi cho nhân viên qua Zalo hoặc email.

Muốn làm ấn phẩm mới thì chỉ cần tải ảnh mẫu mới và lớp chữ mới, rồi sửa prompt (tư thế, trang phục…). Link gửi nhân viên giữ nguyên.

## Chạy thử trên máy tính

```bash
cd cong-cu-ghep-mat
npm install
GEMINI_API_KEY=... ADMIN_PASSWORD=123 npm start
# Windows (PowerShell): $env:GEMINI_API_KEY="..."; $env:ADMIN_PASSWORD="123"; npm start
```

Đặt `MOCK=1` để thử giao diện mà không gọi AI. Khi đó công cụ trả luôn ảnh mẫu.

## Biến môi trường

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `GEMINI_API_KEY` | Khóa Google AI Studio | (bắt buộc) |
| `ADMIN_PASSWORD` | Mật khẩu trang `/admin` | trống = không cần mật khẩu |
| `GEMINI_MODEL` | Model tạo ảnh. Có thể dùng `gemini-3-pro-image` (Nano Banana Pro): giữ mặt tốt hơn nhưng đắt hơn | `gemini-3.1-flash-image` |
| `LIMIT_PER_HOUR` | Số ảnh tối đa mỗi người/giờ | `10` |
| `MOCK` | `1` = chạy thử không gọi AI | tắt |
