#!/bin/bash
# ============================================================
#  PHẦN MỀM CHIẾU LCD — Nháy đúp chuột vào file này để chạy (macOS)
# ============================================================
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo " =========================================================="
  echo "  MÁY CHƯA CÀI NODE.JS"
  echo " =========================================================="
  echo ""
  echo "  Bước 1: Trình duyệt sẽ tự mở trang https://nodejs.org"
  echo "  Bước 2: Bấm nút màu xanh để tải về, rồi cài đặt"
  echo "  Bước 3: Cài xong, nháy đúp chuột vào file này lần nữa"
  echo ""
  open "https://nodejs.org"
  read -r -p "Nhấn Enter để đóng..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo ""
  echo " Đang chuẩn bị lần đầu, vui lòng đợi 1-2 phút..."
  echo ""
  npm install || { read -r -p "Có lỗi khi cài đặt. Nhấn Enter để đóng..."; exit 1; }
fi

echo ""
echo " =========================================================="
echo "  ĐANG KHỞI ĐỘNG... TRÌNH DUYỆT SẼ TỰ MỞ TRANG QUẢN TRỊ"
echo ""
echo "  LƯU Ý: ĐỪNG ĐÓNG CỬA SỔ NÀY khi đang trình chiếu."
echo "  Đóng cửa sổ này = các màn hình sẽ ngừng phát."
echo " =========================================================="
echo ""

(sleep 2 && open "http://localhost:3000") &
node server.js
